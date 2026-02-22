const CACHE_NAME = 'yousafe-v2';
const ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/dashboard.html',
    '/guardian.html',
    '/sos.html',
    '/register-woman.html',
    '/register-guardian.html',
    '/style.css',
    '/script.js',
    '/logo.png',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force the waiting service worker to become active
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim()); // Take control of all open pages immediately
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        fetch(event.request).catch(() => {
            return caches.match(event.request);
        })
    );
});

