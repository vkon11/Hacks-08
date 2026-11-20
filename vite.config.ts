import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'

// Cache this build's app shell and local assets. External map tiles use normal browser caching.
function offlineShell(): Plugin {
  return {
    name: 'housing-board-offline-shell',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const urls = ['/index.html', '/housing-board.svg', ...Object.keys(bundle).filter(file => file !== 'index.html').map(file => '/' + file)]
      const version = createHash('sha256').update(JSON.stringify(urls)).digest('hex').slice(0, 16)
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const cacheName = 'ann-arbor-housing-board-${version}';
const urls = ${JSON.stringify(urls)};
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(cacheName);
  await cache.addAll(urls);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) {
    if (name.startsWith('ann-arbor-housing-board-') && name !== cacheName) await caches.delete(name);
  }
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const page = event.request.mode === 'navigate' && (url.pathname === '/' || url.pathname.startsWith('/preferences/'));
  if (!page && !urls.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    if (page) {
      try { return await fetch(event.request); } catch { return await cache.match('/index.html'); }
    }
    return await cache.match(url.pathname) || fetch(event.request);
  })());
});
` })
    },
  }
}

export default defineConfig({ plugins: [react(), offlineShell()] })
