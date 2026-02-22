const app = {
    state: {
        currentUser: null,
        nightMode: false,
        locationInterval: null,
        locationWatchId: null,
        socket: null,
        sosHoldTimer: null,
        reconnectTimer: null,
        map: null,
        tileLayer: null,
        userMarker: null,
        shieldAura: null,
        deferredPrompt: null
    },


    init: async () => {
        try {
            console.log("%c--- YouSafe Initialization Started ---", "color: blue; font-weight: bold;");

            // 1. Force Clear SW if still active (to prevent stale code)
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(regs => {
                    for (let r of regs) {
                        r.unregister();
                        console.log("Service Worker Unregistered");
                    }
                });
            }

            // 2. Load User Session (Check Server first)
            await app.checkSession();

            const path = window.location.pathname;
            const user = app.state.currentUser;
            const isLocalFile = window.location.protocol === 'file:';

            // --- DEBUG OVERLAY ---
            const debugEl = document.createElement('div');
            debugEl.style = "position:fixed;bottom:10px;right:10px;background:rgba(0,0,0,0.9);color:#00ff00;padding:12px;font-size:12px;z-index:10000;font-family:monospace;border-radius:8px;border:1px solid #444;box-shadow:0 10px 30px rgba(0,0,0,0.8);pointer-events:none;";
            debugEl.id = "yousafe-debug";
            debugEl.innerHTML = `
                <div style="font-weight:bold;margin-bottom:5px;border-bottom:1px solid #444;color:#ff00ff;">YouSafe Debug Monitor</div>
                Protocol: <span style="color:${isLocalFile ? '#ff4444' : '#00ff00'}">${isLocalFile ? 'WRONG (file://)' : 'CORRECT (http://)'}</span><br>
                Path: ${path}<br>
                User: ${user ? user.type : 'NONE'}<br>
                Storage: ${localStorage.getItem('yousafe_user') ? 'OK' : 'EMPTY'}
            `;
            document.body.appendChild(debugEl);

            if (isLocalFile) {
                console.error("CRITICAL: You are running this as a local file!");
                const warning = document.createElement('div');
                warning.style = "position:fixed;top:0;left:0;width:100%;background:#ff4444;color:white;text-align:center;padding:15px;z-index:10001;font-weight:bold;box-shadow:0 4px 10px rgba(0,0,0,0.3);";
                warning.innerHTML = "⚠️ ERROR: You are using the wrong link! <br> Please open: <a href='http://localhost:3000' style='color:white;text-decoration:underline;'>http://localhost:3000</a>";
                document.body.prepend(warning);
                alert("STOP! You are opening the file directly.\n\nPlease type http://localhost:3000 in your address bar.\n\nThe app will NOT work otherwise.");
            }

            console.log("Current Path:", path);
            console.log("Current User:", user);

            // 3. Routing & Protection Logic
            const lowercasePath = path.toLowerCase();
            const filename = lowercasePath.split('/').pop() || 'index.html';

            console.log(`[ROUTING] Logic for filename: ${filename}`);

            // If on landing pages (Root or index.html)
            if (filename === 'index.html' || filename === '') {
                if (user) {
                    console.log("[ROUTING] Active session found. Redirecting to app...");
                    const target = (user.type === 'woman') ? 'dashboard.html' : 'guardian.html';
                    window.location.replace(target);
                    return;
                }
            }

            // Registration Page Bindings
            if (filename === 'register-woman.html') {
                const form = document.getElementById('woman-reg-form');
                if (form) form.addEventListener('submit', app.handleRegisterWoman);
            }
            if (filename === 'register-guardian.html') {
                const form = document.getElementById('guardian-reg-form');
                if (form) form.addEventListener('submit', app.handleRegisterGuardian);
            }
            if (filename === 'login.html') {
                const form = document.getElementById('login-form');
                if (form) form.addEventListener('submit', app.handleLogin);
            }

            // Dashboard Protection
            if (filename === 'dashboard.html') {
                if (!user || user.type !== 'woman') {
                    console.error("[ROUTING] SESSION ERROR: Woman profile required. Redirecting to index.");
                    window.location.replace('index.html');
                    return;
                }
                app.initDashboard();
            }

            // Guardian Portal Protection
            if (filename === 'guardian.html') {
                if (!user || user.type !== 'guardian') {
                    console.error("[ROUTING] SESSION ERROR: Guardian profile required. Redirecting to index.");
                    window.location.replace('index.html');
                    return;
                }
                app.initGuardian();
            }

            // SOS Page Protection
            if (filename === 'sos.html') {
                if (!user) {
                    console.error("[ROUTING] SOS ERROR: No session. Redirecting to index.");
                    window.location.replace('index.html');
                    return;
                }
                app.initSOS();
            }

            console.log("%c--- YouSafe Initialization Complete ---", "color: blue; font-weight: bold;");
        } catch (err) {
            console.error("INITIALIZATION PANIC:", err);
            // If session fails, at least load local as fallback (for prototype)
            app.loadUser();
        }
    },

    // --- PAGE INITIALIZERS ---

    initDashboard: () => {
        console.log("Initializing Dashboard Components...");
        const user = app.state.currentUser;

        const codeEl = document.getElementById('user-code');
        const greetEl = document.getElementById('user-greeting');
        if (codeEl) codeEl.textContent = user.code || '---';
        if (greetEl) greetEl.textContent = `Hi, ${user.name}`;

        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', app.logout);

        const nmBtn = document.getElementById('night-mode-btn');
        if (nmBtn) nmBtn.onclick = app.toggleNightMode;

        const fcBtn = document.getElementById('fake-call-btn');
        if (fcBtn) fcBtn.onclick = app.testFakeCall;

        app.initSocket();

        // Initial location broadcast
        setTimeout(() => app.broadcastLocation(), 1000);

        // PWA Install Logic
        const installBtn = document.getElementById('install-app-btn');
        if (installBtn) {
            if (app.state.deferredPrompt) installBtn.style.display = 'flex';
            installBtn.onclick = async () => {
                if (!app.state.deferredPrompt) return;
                app.state.deferredPrompt.prompt();
                const { outcome } = await app.state.deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    installBtn.style.display = 'none';
                    app.state.deferredPrompt = null;
                }
            };
        }

        // Auto-resume Night Mode if it was ON

        const savedNightMode = localStorage.getItem('yousafe_nightmode') === 'true';
        if (savedNightMode) {
            console.log("[NIGHT MODE] Auto-resuming saved state...");
            app.state.nightMode = false; // Set to false so toggle turns it ON
            app.toggleNightMode();
        }
    },

    initGuardian: () => {
        console.log("Initializing Guardian Components...");
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) logoutBtn.addEventListener('click', app.logout);

        app.initMap();
        app.initSocket();

        const user = app.state.currentUser;
        const monitorEl = document.getElementById('monitored-user');
        if (monitorEl) monitorEl.textContent = user.linkedCode || 'Searching...';
    },

    initSOS: () => {
        console.log("Initializing SOS Sensors...");
        const bioTrigger = document.getElementById('biometric-trigger');
        if (bioTrigger) {
            bioTrigger.addEventListener('mousedown', app.startBiometric);
            bioTrigger.addEventListener('touchstart', app.startBiometric);
            bioTrigger.addEventListener('mouseup', app.cancelBiometric);
            bioTrigger.addEventListener('touchend', app.cancelBiometric);
        }
        if (navigator.vibrate) navigator.vibrate(200);
        app.initSocket();
    },

    // --- AUTH & SESSION ---

    handleRegisterWoman: async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        if (btn) btn.disabled = true;

        const formData = {
            name: document.getElementById('w-name').value,
            mobile: document.getElementById('w-mobile').value,
            email: document.getElementById('w-email').value,
            password: document.getElementById('w-password').value,
            contact: document.getElementById('w-contact').value,
            type: 'woman'
        };

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await res.json();
            if (data.success) {
                app.toast(data.message || 'Registration Success!');
                setTimeout(() => window.location.replace('login.html'), 1500);
            } else {
                alert('Registration Failed: ' + (data.message || 'Error'));
                if (btn) btn.disabled = false;
            }
        } catch (err) {
            console.error(err);
            alert('Server Error. check connection.');
            if (btn) btn.disabled = false;
        }
    },

    handleRegisterGuardian: async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        if (btn) btn.disabled = true;

        const formData = {
            name: document.getElementById('g-name').value,
            linkedCode: document.getElementById('g-code').value.toUpperCase(),
            type: 'guardian'
        };

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await res.json();
            if (data.success) {
                app.saveUser(data.user);
                app.toast(data.message || 'Connection Success!');
                setTimeout(() => window.location.replace('guardian.html'), 1000);
            } else {
                alert('Connection Failed: ' + (data.message || 'Invalid Code'));
                if (btn) btn.disabled = false;
            }
        } catch (err) {
            console.error(err);
            alert('Server Error.');
            if (btn) btn.disabled = false;
        }
    },

    handleLogin: async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button');
        if (btn) btn.disabled = true;

        const email = document.getElementById('l-email').value;
        const password = document.getElementById('l-password').value;
        const typeEl = e.target.querySelector('input[name="l-type"]');
        const type = typeEl ? typeEl.value : 'woman';

        console.log(`[LOGIN] Attempting login for ${email} as ${type}`);

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, type })
            });

            const data = await res.json();
            if (data.success) {
                app.saveUser(data.user);
                const target = (data.user.type === 'woman') ? 'dashboard.html' : 'guardian.html';
                window.location.replace(target);
            } else {
                alert('Login Failed: ' + (data.message || 'Check credentials'));
                if (btn) btn.disabled = false;
            }
        } catch (err) {
            console.error(err);
            alert('Server Error during login.');
            if (btn) btn.disabled = false;
        }
    },

    saveUser: (user) => {
        localStorage.setItem('yousafe_user', JSON.stringify(user));
        app.state.currentUser = user;
    },

    loadUser: () => {
        const stored = localStorage.getItem('yousafe_user');
        if (stored) {
            try {
                app.state.currentUser = JSON.parse(stored);
            } catch (e) {
                console.error("Session Corrupt. Clearing.");
                localStorage.removeItem('yousafe_user');
            }
        }
    },

    checkSession: async () => {
        try {
            const res = await fetch('/api/me');
            const data = await res.json();
            if (data.success) {
                app.state.currentUser = data.user;
                // Sync to local
                localStorage.setItem('yousafe_user', JSON.stringify(data.user));
            } else {
                app.state.currentUser = null;
                localStorage.removeItem('yousafe_user');
            }
        } catch (err) {
            app.loadUser(); // Fallback
        }
    },

    logout: async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch (e) { }

        if (app.state.socket) app.state.socket.disconnect();
        if (app.state.locationWatchId) {
            navigator.geolocation.clearWatch(app.state.locationWatchId);
            app.state.locationWatchId = null;
        }
        localStorage.removeItem('yousafe_user');
        localStorage.removeItem('yousafe_nightmode');
        app.state.currentUser = null;
        app.state.nightMode = false;
        app.toast('Logging out...');
        setTimeout(() => window.location.replace('index.html'), 500);
    },

    // --- FEATURES ---

    toggleNightMode: () => {
        app.state.nightMode = !app.state.nightMode;
        localStorage.setItem('yousafe_nightmode', app.state.nightMode);

        const btn = document.getElementById('night-mode-status');
        const body = document.body;

        if (app.state.nightMode) {
            btn.textContent = 'ON';
            btn.style.background = '#00b894';
            body.classList.remove('light-theme-override');
            app.toast('Night Mode: Continuous Sharing ON');

            // Start real-time tracking
            if (navigator.geolocation) {
                app.state.locationWatchId = navigator.geolocation.watchPosition(
                    (pos) => {
                        console.log("[LIVE] broadcasting location update...");
                        app.state.socket.emit('location_update', {
                            code: app.state.currentUser.code,
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            status: 'In Night Mode (LIVE)'
                        });
                    },
                    (err) => console.error("WatchPosition Error:", err),
                    { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
                );
            }
        } else {
            btn.textContent = 'OFF';
            btn.style.background = 'rgba(0,0,0,0.3)';
            body.classList.add('light-theme-override');
            app.toast('Night Mode Off');

            if (app.state.locationWatchId) {
                navigator.geolocation.clearWatch(app.state.locationWatchId);
                app.state.locationWatchId = null;
            }
        }

        if (app.state.map && app.state.tileLayer) {
            const isLight = body.classList.contains('light-theme-override');
            const url = isLight
                ? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
            app.state.tileLayer.setUrl(url);
        }
    },

    startBiometric: () => {
        const scanner = document.querySelector('.fingerprint-scanner');
        if (scanner) scanner.classList.add('scanning');
        app.state.sosHoldTimer = setTimeout(() => app.verifySuccess(), 1500);
        if (navigator.vibrate) navigator.vibrate([50]);
    },

    cancelBiometric: () => {
        const scanner = document.querySelector('.fingerprint-scanner');
        if (scanner) scanner.classList.remove('scanning');
        clearTimeout(app.state.sosHoldTimer);
    },

    verifySuccess: () => {
        const scanner = document.querySelector('.fingerprint-scanner');
        if (scanner) {
            scanner.classList.remove('scanning');
            scanner.style.borderColor = '#00b894';
        }
        if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
        app.toast('IDENTITY VERIFIED. REQUESTING HELP.');
        app.broadcastLocation(true);
        app.sendSOS();
    },

    sendSOS: async () => {
        if (!navigator.geolocation) return;

        // Reset and show timeline if on SOS page
        const updateStep = (id, status, active = false) => {
            const el = document.getElementById(id);
            if (el) {
                el.querySelector('.status').textContent = status;
                el.style.opacity = active ? "1" : "0.5";
                if (active) el.style.fontWeight = "bold";
            }
        };

        navigator.geolocation.getCurrentPosition(async (pos) => {
            const { latitude, longitude } = pos.coords;
            const contact = app.state.currentUser.contact;
            const code = app.state.currentUser.code;

            try {
                const link = `https://maps.google.com/?q=${latitude},${longitude}`;
                const msg = `SOS! I need help. My location: ${link}`;

                // 1. Backend SOS Alert (Socket + Server SMS if configured)
                updateStep('step-sms', 'Sending...');
                await fetch('/api/sos/alert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        code: code,
                        lat: latitude,
                        lng: longitude,
                        contact: contact
                    })
                });
                updateStep('step-sms', 'SENT ✅', true);

                // Show Success Message on SOS Page
                const successEl = document.getElementById('sos-success');
                if (successEl) successEl.classList.remove('hidden');

                // 2. Open Native SMS (Immediate)
                const smsUri = `sms:${contact}${navigator.userAgent.match(/iPhone/i) ? '&' : '?'}body=${encodeURIComponent(msg)}`;
                window.location.href = smsUri;

                // 3. WhatsApp SOS (T + 15s)
                let waCountdown = 15;
                const waInterval = setInterval(() => {
                    waCountdown--;
                    if (waCountdown > 0) {
                        updateStep('step-whatsapp', `Pending (${waCountdown}s)`);
                    } else {
                        clearInterval(waInterval);
                    }
                }, 1000);

                setTimeout(() => {
                    updateStep('step-whatsapp', 'OPENING... 💬', true);
                    const waUri = `https://wa.me/${contact.startsWith('+') ? contact : '+91' + contact}?text=${encodeURIComponent(msg)}`;
                    window.open(waUri, '_blank');
                    updateStep('step-whatsapp', 'OPENED ✅', true);
                }, 15000);

                // 4. Phone Call (T + 45s)
                let callCountdown = 45;
                const callInterval = setInterval(() => {
                    callCountdown--;
                    if (callCountdown > 0) {
                        updateStep('step-call', `Pending (${callCountdown}s)`);
                    } else {
                        clearInterval(callInterval);
                    }
                }, 1000);

                setTimeout(() => {
                    updateStep('step-call', 'DIALING... 📞', true);
                    const callUri = `tel:${contact}`;
                    window.location.href = callUri;
                    updateStep('step-call', 'DIALED ✅', true);
                }, 45000);

            } catch (err) {
                console.error('SOS sequence failed', err);
                app.toast('SOS Alert failed to send');
            }
        }, (err) => {
            console.error("Geo Error:", err);
            app.toast('Location access required for SOS');
        }, { enableHighAccuracy: true });
    },


    // --- REAL-TIME (SOCKET) ---

    initSocket: () => {
        if (!app.state.currentUser || typeof io === 'undefined') return;

        app.state.socket = io();
        app.state.socket.on('connect', () => {
            const user = app.state.currentUser;
            const code = (user.type === 'woman') ? user.code : user.linkedCode;
            if (code) app.state.socket.emit('join_room', code);
        });

        if (app.state.currentUser.type === 'guardian') {
            app.state.socket.on('guardian_update', (data) => app.updateGuardianMap(data.lat, data.lng, data.status));
            app.state.socket.on('sos_alert', (data) => {
                alert('URGENT: SOS ALERT FROM USER!');
                app.updateGuardianMap(data.lat, data.lng, 'SOS ACTIVE');
                if (navigator.vibrate) navigator.vibrate([500, 500, 500]);
            });
        }
    },

    broadcastLocation: (isSos = false) => {
        if (!navigator.geolocation || !app.state.socket) return;
        navigator.geolocation.getCurrentPosition((pos) => {
            app.state.socket.emit(isSos ? 'sos_trigger' : 'location_update', {
                code: app.state.currentUser.code,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                status: isSos ? 'SOS ACTIVE' : (app.state.nightMode ? 'In Night Mode' : 'Safe')
            });
        }, null, { enableHighAccuracy: true });
    },

    // --- MAPS ---

    initMap: () => {
        setTimeout(() => {
            const el = document.getElementById('map');
            if (!el || el._leaflet_id || typeof L === 'undefined') return;

            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            const url = isDark
                ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

            app.state.map = L.map('map').setView([20, 0], 2);
            app.state.tileLayer = L.tileLayer(url, { attribution: '&copy; CARTO', maxZoom: 20 }).addTo(app.state.map);
        }, 500);
    },

    updateGuardianMap: (lat, lng, status) => {
        if (!app.state.map) return;
        const latLng = new L.LatLng(lat, lng);

        if (!app.state.userMarker) {
            app.state.userMarker = L.marker(latLng).addTo(app.state.map);
        } else {
            app.state.userMarker.setLatLng(latLng);
        }

        if (!app.state.shieldAura) {
            const icon = L.divIcon({
                className: 'shield-aura-container',
                html: '<div class="shield-aura"></div>',
                iconSize: [60, 60], iconAnchor: [30, 30]
            });
            app.state.shieldAura = L.marker(latLng, { icon }).addTo(app.state.map);
        } else {
            app.state.shieldAura.setLatLng(latLng);
        }

        // Only snap map if the user is significantly far or just joined
        if (!app.state.map.getBounds().contains(latLng)) {
            app.state.map.panTo(latLng);
        }

        app.state.userMarker.bindPopup(`User Status: ${status}`).openPopup();
        const updateEl = document.getElementById('last-update');
        if (updateEl) updateEl.textContent = 'LIVE: ' + new Date().toLocaleTimeString();
    },

    toast: (msg) => {
        const el = document.getElementById('toast');
        if (el) {
            el.textContent = msg;
            el.classList.remove('hidden');
            setTimeout(() => el.classList.add('hidden'), 3000);
        }
    },

    testFakeCall: () => app.toast('Simulating Fake Call Incoming...')
};

// Handle PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    app.state.deferredPrompt = e;
    const installBtn = document.getElementById('install-app-btn');
    if (installBtn) installBtn.style.display = 'flex';
});

window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('install-app-btn');
    if (installBtn) installBtn.style.display = 'none';
    app.state.deferredPrompt = null;
    app.toast('YouSafe Installed Successfully!');
});

// Start the App
document.addEventListener('DOMContentLoaded', app.init);

