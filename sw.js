self.addEventListener('fetch', (event) => {
    // Basic service worker to enable PWA installation
    event.respondWith(fetch(event.request));
});