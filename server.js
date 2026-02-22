const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const session = require('express-session');

// --- TWILIO CONFIG (Use environment variables in production) ---
const twilio = require('twilio');
const TWILIO_SID = process.env.TWILIO_SID || 'YOUR_ACCOUT_SID_HERE';
const TWILIO_TOKEN = process.env.TWILIO_TOKEN || 'YOUR_AUTH_TOKEN_HERE';
const TWILIO_NUMBER = process.env.TWILIO_NUMBER || 'YOUR_TWILIO_PHONE_NUMBER';

let twilioClient;
try {
    if (TWILIO_SID !== 'YOUR_ACCOUT_SID_HERE') {
        twilioClient = twilio(TWILIO_SID, TWILIO_TOKEN);
    }
} catch (err) {
    console.error('Twilio Initialization Error:', err.message);
}

const PORT = process.env.PORT || 3000;
const DB_FILE = 'data.json';

// --- MIDDLEWARE ---
app.use(express.static('public'));
app.use(express.json());
app.use(session({
    secret: 'yousafe-secret-key-123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// --- DATABASE HELPER ---
function getDB() {
    if (!fs.existsSync(DB_FILE)) {
        fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(DB_FILE));
}

function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// --- API ROUTES ---

// Register User
app.post('/api/register', (req, res) => {
    const { name, mobile, email, password, contact, type, linkedCode } = req.body;
    const db = getDB();

    if (type === 'woman') {
        // Create User
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const newUser = {
            id: Date.now().toString(),
            name,
            mobile,
            email,
            password,
            contact,
            code,
            type: 'woman',
            guardians: []
        };
        db.users.push(newUser);
        saveDB(db);
        // Returning success but no session yet - user MUST login
        res.json({ success: true, message: 'Registration successful! Please login.' });
    } else {
        // Guardian Registration
        // Verify code
        const targetUser = db.users.find(u => u.code === linkedCode && u.type === 'woman');

        if (!targetUser) {
            return res.status(404).json({ success: false, message: 'Invalid User Code' });
        }

        const newGuardian = {
            id: Date.now().toString(),
            name,
            type: 'guardian',
            linkedCode
        };

        // Add guardian to user's list (optional, for reverse lookup)
        // db.users.push(newGuardian); // We actully just save guardians loosely or linked.
        // For simplicity, we just return the guardian object and let client store it, 
        // or we could store guardians in separate list. 
        // Let's store them in the same list but with type 'guardian'

        db.users.push(newGuardian);
        saveDB(db);

        // AUTO-SESSION FOR GUARDIAN: Only if not already logged in as a Woman
        // This prevents session overlap during testing on same device
        if (!req.session.userType || req.session.userType !== 'woman') {
            req.session.userId = newGuardian.id;
            req.session.userType = 'guardian';
        }

        res.json({ success: true, user: newGuardian, message: 'Connection successful!' });
    }
});

// Login User
app.post('/api/login', (req, res) => {
    const { email, password, type } = req.body;
    console.log(`[AUTH] Login Request: ${email}, Type: ${type}`);
    const db = getDB();

    const user = db.users.find(u =>
        u.type === type &&
        (u.email === email || (type === 'guardian' && u.name === email)) &&
        (u.password === password || (type === 'guardian' && password === '123456')) // Simple bypass for prototype
    );

    if (user) {
        req.session.userId = user.id;
        req.session.userType = user.type;
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Get Current User (Session Check)
app.get('/api/me', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ success: false });
    }

    const db = getDB();
    const user = db.users.find(u => u.id === req.session.userId);
    if (user) {
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false });
    }
});

// Logout User
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// SOS SMS Alert Endpoint
app.post('/api/sos/alert', async (req, res) => {
    const { code, lat, lng, contact } = req.body;
    const room = `yousafe_${code}`;
    const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
    const message = `SOS ALERT! User ${code} needs help. Location: ${mapsLink}`;

    console.log(`[BACKEND] SOS Triggered for ${code}`);

    // 1. Broadcast to Guardians via Socket.io
    io.to(room).emit('sos_alert', { code, lat, lng, status: 'SOS ACTIVE' });

    // 2. Send Actual SMS via Twilio
    if (twilioClient) {
        try {
            const formattedNumber = contact.startsWith('+') ? contact : `+91${contact}`;
            await twilioClient.messages.create({
                body: message,
                from: TWILIO_NUMBER,
                to: formattedNumber
            });
            console.log(`[SMS] Alert sent to ${formattedNumber}`);
            return res.json({ success: true, method: 'SMS' });
        } catch (err) {
            console.error('[SMS] Error:', err.message);
            return res.json({ success: false, message: 'SMS failed but web alert sent' });
        }
    } else {
        console.log('[SMS] Twilio not configured. Web alert only.');
        return res.json({ success: true, method: 'WEB_ONLY' });
    }
});

// --- SOCKET.IO REAL-TIME ---
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join Room
    // Users join room = "yousafe_<CODE>"
    // Guardians join room = "yousafe_<LINKED_CODE>"

    socket.on('join_room', (roomCode) => {
        socket.join(`yousafe_${roomCode}`);
        console.log(`Socket ${socket.id} joined room yousafe_${roomCode}`);
        io.to(`yousafe_${roomCode}`).emit('room_joined', { message: 'Connected to Room' });
    });

    // Location Updates
    socket.on('location_update', (data) => {
        // Expects { code, lat, lng, status }
        const room = `yousafe_${data.code}`;
        // Broadcast to everyone in the room EXCEPT sender (usually guardian is receiver)
        socket.to(room).emit('guardian_update', data);
    });

    // SOS Alert
    socket.on('sos_trigger', (data) => {
        const room = `yousafe_${data.code}`;
        console.log(`SOS TRIGGERED in room ${room}`);
        io.to(room).emit('sos_alert', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Start Server
server.listen(PORT, () => {
    console.log(`YouSafe Server running on http://localhost:${PORT}`);
});
