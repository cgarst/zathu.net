// Service worker for the /synth app (scope /synth/). Makes it installable and usable offline.
//  - Same-origin files: network first (so a deploy shows up right away), cache as the offline fallback.
//  - Fonts and icons from CDNs: cached on first use, refreshed in the background.
// Bump CACHE only to drop old cached files; ordinary updates need no bump.
const CACHE = 'fidgetbox-v2';

const PRECACHE = [
  '/synth/',
  '/synth/manifest.webmanifest',
  '/css/base.css',
  '/css/synth.css',
  '/js/synth-page.js',
  '/js/synth/index.js',
  '/js/synth/template.js',
  '/js/synth/scope.js',
  '/js/synth/keys.js',
  '/js/synth/controls.js',
  '/js/synth/voices.js',
  '/js/synth/ribbon.js',
  '/js/synth/audio.js',
  '/js/synth/music.js',
  '/js/synth/state.js',
  '/js/synth/ui.js',
  '/assets/favicon.svg',
  '/assets/synth/icon-192.png',
  '/assets/synth/icon-512.png',
  '/assets/synth/icon-maskable-512.png',
  '/assets/synth/apple-touch-icon.png',
];

const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req));
  } else if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    // Offline navigation to anywhere in the app: serve the app shell
    if (req.mode === 'navigate') return (await cache.match('/synth/')) || Response.error();
    return Response.error();
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await refresh) || Response.error();
}
