// public/sw.js - iori-nav Service Worker
// 策略：
//   - 静态资源（css/js/img/font，同源 GET）：stale-while-revalidate，秒开 + 后台更新
//   - 页面导航请求：network-first，离线时回退缓存的首页
//   - /api/* 与 /admin* 一律不拦截，直连网络
// 缓存键跟随浏览器实际请求 URL（含 ?v=hash），发版后自然写入新条目，activate 时清理旧版本

const VERSION = 'v1';
const STATIC_CACHE = `iori-static-${VERSION}`;
const PAGE_CACHE = `iori-pages-${VERSION}`;

// install 时预缓存不带版本号的核心资源，保证首次安装后离线可用
const PRECACHE_URLS = [
  '/',
  '/css/style.css',
  '/css/tailwind.min.css',
  '/js/main.js',
  '/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== STATIC_CACHE && k !== PAGE_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/** 是否为该由 SW 处理的同源静态资源 */
function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) return false;
  return (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|eot)$/i.test(url.pathname)
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 页面导航：network-first，离线回退缓存页
  if (request.mode === 'navigate') {
    if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/')) return;
    event.respondWith(
      fetch(request)
        .then(response => {
          // 仅缓存首页成功响应，后台编辑后的管理页不落缓存
          if (response.ok && url.pathname === '/' && !url.search) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then(cache => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match(url.pathname === '/' && !url.search ? '/' : request)
          .then(cached => cached || caches.match('/')))
    );
    return;
  }

  // 同源静态资源：stale-while-revalidate
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then(response => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
  // 其余（跨域字体/一言 API 等）交给浏览器默认行为
});
