
const CACHE_NAME = 'pos-app-v1';
const PRECACHE_URLS = [
    './',
    './app.html',
    './home-content.html',
    './setting-content.html',
    './data-produk-content.html',
    './data-produk-form-content.html',
    './data-kategori-content.html',
    './data-kategori-form-content.html',
    './data-customer-content.html',
    './data-customer-form-content.html',
    './assets/css/style.css',
    './assets/js/app.js',
    './assets/js/db.js',
    './assets/js/pages/home.js',
    './assets/js/pages/setting.js',
    './assets/js/pages/data-produk.js',
    // ... file JS halaman lainnya
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});