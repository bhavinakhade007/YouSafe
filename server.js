const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const session = require('express-session');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- TWILIO CONFIG ---
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'yousafe-secret-key-123',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Serve static files from 'public'
app.use(express.static(path.join(__dirname, 'public')));

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
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const newUser = {
            id: Date.now().toString(),
            name, mobile, email, password, contact, code,
            type: 'woman', guardians: []
        };
        db.users.push(newUser);
        saveDB(db);
        res.json({ success: true, message: 'Registration successful! Please login.' });
    } else {
        const targetUser = db.users.find(u => u.code === linkedCode && u.type === 'woman');
        if (!targetUser) return res.status(404).json({ success: false, message: 'Invalid User Code' });

        const newGuardian = { id: Date.now().toString(), name, type: 'guardian', linkedCode };
        db.users.push(newGuardian);
        saveDB(db);

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
    const db = getDB();
    const user = db.users.find(u =>
        u.type === type &&
        (u.email === email || (type === 'guardian' && u.name === email)) &&
        (u.password === password || (type === 'guardian' && password === '123456'))
    );

    if (user) {
        req.session.userId = user.id;
        req.session.userType = user.type;
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.get('/api/me', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ success: false });
    const db = getDB();
    const user = db.users.find(u => u.id === req.session.userId);
    if (user) res.json({ success: true, user });
    else res.status(401).json({ success: false });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.post('/api/sos/alert', async (req, res) => {
    const { code, lat, lng, contact } = req.body;
    const room = `yousafe_${code}`;
    const mapsLink = `https://maps.google.com/?q=${lat},${lng}`;
    const message = `SOS ALERT! User ${code} needs help. Location: ${mapsLink}`;

    io.to(room).emit('sos_alert', { code, lat, lng, status: 'SOS ACTIVE' });

    if (twilioClient) {
        try {
            const formattedNumber = contact.startsWith('+') ? contact : `+91${contact}`;
            await twilioClient.messages.create({ body: message, from: TWILIO_NUMBER, to: formattedNumber });
            res.json({ success: true, method: 'SMS' });
        } catch (err) {
            res.json({ success: false, message: 'SMS failed but web alert sent' });
        }
    } else {
        res.json({ success: true, method: 'WEB_ONLY' });
    }
});

// --- SOCKET.IO ---
io.on('connection', (socket) => {
    socket.on('join_room', (roomCode) => {
        socket.join(`yousafe_${roomCode}`);
        io.to(`yousafe_${roomCode}`).emit('room_joined', { message: 'Connected to Room' });
    });

    socket.on('location_update', (data) => {
        socket.to(`yousafe_${data.code}`).emit('guardian_update', data);
    });

    socket.on('sos_trigger', (data) => {
        io.to(`yousafe_${data.code}`).emit('sos_alert', data);
    });
});

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
