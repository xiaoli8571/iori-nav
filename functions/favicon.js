/**
 * 多源 favicon 代理（Pages Functions）
 *
 * 背景：原实现直接把 faviconsnap.com 的 URL 存库，浏览器 <img> 直连第三方。
 * 该服务对很多站点返回 1×1 透明 PNG / JSON 错误，导致卡片图标空白。
 *
 * 本代理让浏览器只访问本站域名（如 https://n.720820.xyz/favicon?url=xxx），
 * 由 Cloudflare 边缘服务端依次尝试多个图标源：
 *   1. Google s2 favicons（覆盖最好）
 *   2. favicon.im（对失败域名有字母兜底）
 *   3. faviconsnap（原服务，作为最后一层）
 * 全部失败时返回首字母 SVG，保证卡片永不空白。结果经 Cache API 缓存 24h。
 *
 * 用法：GET /favicon?url=<domain>（自动提取纯域名，忽略协议/路径/端口）
 */
const SOURCES = (domain) => [
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`,
  `https://favicon.im/${encodeURIComponent(domain)}?larger=true`,
  `https://faviconsnap.com/api/favicon?url=${encodeURIComponent(domain)}`,
];

// 小于该字节数的响应视为空图标（1×1 透明 PNG 约 70B）
const MIN_IMAGE_SIZE = 100;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** 提取纯域名：去协议、路径、query、端口、大小写归一 */
function extractDomain(raw) {
  let input = (raw || '').trim();
  if (!input) return null;
  if (!/^https?:\/\//i.test(input)) input = 'http://' + input;
  let hostname;
  try {
    hostname = new URL(input).hostname.toLowerCase();
  } catch {
    return null;
  }
  // 基本合法性：必须含点、非 IP 段乱串、长度合理
  if (!hostname.includes('.') || hostname.length > 253) return null;
  return hostname;
}

/** 首字母兜底 SVG */
function letterSvg(domain) {
  const letter = (domain.charAt(0) || '?').toUpperCase();
  const safe = /[A-Za-z0-9\u4e00-\u9fff]/.test(letter) ? letter : '?';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#6366f1"/><text x="32" y="43" font-family="sans-serif" font-size="30" font-weight="600" fill="#ffffff" text-anchor="middle">${safe}</text></svg>`;
}

function corsify(response) {
  const r = new Response(response.body, response);
  r.headers.set('Access-Control-Allow-Origin', '*');
  return r;
}

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);
  const domain = extractDomain(url.searchParams.get('url'));

  if (!domain) {
    return new Response('Invalid or missing url parameter', { status: 400 });
  }

  // Cache API：以域名为 key 缓存 24h
  const cache = caches.default;
  const cacheKey = new Request(`https://favicon-cache.local/${domain}`, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return corsify(cached);

  for (const sourceUrl of SOURCES(domain)) {
    let resp;
    try {
      resp = await fetch(sourceUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      continue; // 网络失败：尝试下一个源
    }
    if (!resp.ok) continue;

    const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim();
    if (!contentType.startsWith('image/')) continue;

    const buf = await resp.arrayBuffer();
    if (buf.byteLength < MIN_IMAGE_SIZE) continue; // 1×1 空白图等

    const out = new Response(buf, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
    waitUntil(cache.put(cacheKey, out.clone()));
    return corsify(out);
  }

  // 全部源失败：返回首字母 SVG 兜底
  const out = new Response(letterSvg(domain), {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
  waitUntil(cache.put(cacheKey, out.clone()));
  return corsify(out);
}
