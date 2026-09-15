/**
 * service-worker.js
 * فعال‌سازی حالت آفلاین کامل با کش‌گذاری Cache-First برای پوسته برنامه
 */

const CACHE_VERSION = 'car-service-cache-v7';

const APP_SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/app.js',
  './js/components.js',
  './js/database.js',
  './js/router.js',
  './js/storage.js',
  './js/utils.js',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-maskable-512.png',
  './assets/fonts/Vazirmatn/Vazirmatn-FD-Regular.woff2',
  './assets/fonts/Vazirmatn/Vazirmatn-FD-Medium.woff2',
  './assets/fonts/Vazirmatn/Vazirmatn-FD-SemiBold.woff2',
  './assets/fonts/Vazirmatn/Vazirmatn-FD-Bold.woff2',
  './assets/fonts/IranSansX/IRANYekanXFaNum-Regular.woff',
  './assets/fonts/IranSansX/IRANYekanXFaNum-Medium.woff',
  './assets/fonts/IranSansX/IRANYekanXFaNum-DemiBold.woff',
  './assets/fonts/IranSansX/IRANYekanXFaNum-Bold.woff',
  './assets/data/cars.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL_FILES)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

/** استراتژی Cache-First با به‌روزرسانی پس‌زمینه‌ای (stale-while-revalidate) */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // فقط درخواست‌های همان مبدا (بدون بک‌اند خارجی) مدیریت می‌شوند
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkFetch = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);
      return cachedResponse || networkFetch;
    }),
  );
});
