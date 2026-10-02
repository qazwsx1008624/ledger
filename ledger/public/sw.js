/**
 * Service Worker：运行时缓存（stale-while-revalidate）。
 *
 * 所有资源（含 hash 命名的 JS/CSS/WASM）在首次访问时被缓存，
 * 之后离线也能完整打开账本——这是 PWA「添加到主屏幕」的价值所在。
 * 新版本发布后，页面会先命中旧缓存、后台更新，下一次刷新生效。
 */
const CACHE = 'ledger-v1'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // 只缓存同源静态资源
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request)
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(request, response.clone())
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    }),
  )
})
