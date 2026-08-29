/**
 * 多源 favicon 代理（Pages Functions）
 *
 * 背景：存库 logo 常为 faviconsnap.com 等第三方直链，该类服务对很多站点
 * 返回 1×1 透明 PNG / 地球球标 / JSON 错误，导致卡片图标空白。
 *
 * 本代理让浏览器只访问本站域名（如 https://n.720820.xyz/favicon?url=xxx），
 * 由 Cloudflare 边缘服务端依次尝试多个图标源（按"真实声明图标优先"排序）：
 *   1. DuckDuckGo icons —— 解析过站点声明的图标，命中率与清晰度兼佳
 *   2. 站点自托管 /favicon.ico —— 最真实的原始图标
 *   3. favicon.im —— 对失败域名有字母兜底
 *   4. Google s2 —— 覆盖好但对无效域名返回地球球标（故靠后）
 *   5. faviconsnap —— 原服务，最后一层
 * 全部失败时返回首字母 SVG（与卡片字母占位块同配色），保证卡片永不空白。
 *
 * 缓存：图片结果经 Cache API 缓存 24h；首字母兜底仅缓存 1h
 * （站点后续补了图标能更快被重新拾取）。
 *
 * 用法：GET /favicon?url=<domain 或完整 URL>（自动提取纯域名，忽略协议/路径/端口）
 */
const SOURCE_TIMEOUT_MS = 5000;

// 小于该字节数的响应视为空图标（1×1 透明 PNG 约 70B）
const MIN_IMAGE_SIZE = 100;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** 提取纯域名：去协议、路径、query、端口、大小写归一 */
export function extractDomain(raw) {
  let input = (raw || '').trim();
  if (!input) return null;
  if (!/^https?:\/\//i.test(input)) input = 'http://' + input;
  let hostname;
  try {
    hostname = new URL(input).hostname.toLowerCase();
  } catch {
    return null;
  }
  // 基本合法性：必须含点、长度合理
  if (!hostname.includes('.') || hostname.length > 253) return null;
  if (isPrivateHost(hostname)) return null;
  return hostname;
}

/** 拒绝本地/内网地址，防止代理被当作内网探测跳板（Workers 本就出不了内网，双保险） */
function isPrivateHost(hostname) {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;
  // IPv4 字面量与私网段
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

/**
 * 图标源列表：真实声明图标优先，低质量/球标源靠后
 * @param {string} domain - 纯域名
 */
function buildSources(domain) {
  const enc = encodeURIComponent(domain);
  return [
    `https://icons.duckduckgo.com/ip3/${enc}.ico`,
    `https://${domain}/favicon.ico`,
    `https://favicon.im/${enc}?larger=true`,
    `https://www.google.com/s2/favicons?domain=${enc}&sz=64`,
    `https://faviconsnap.com/api/favicon?url=${enc}`,
  ];
}

/** 首字母兜底 SVG（配色与卡片字母占位块一致：primary 渐变深蓝） */
function letterSvg(domain) {
  const letter = (domain.charAt(0) || '?').toUpperCase();
  const safe = /[A-Za-z0-9\u4e00-\u9fff]/.test(letter) ? letter : '?';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#416d9d"/><stop offset="1" stop-color="#254267"/></linearGradient></defs><rect width="64" height="64" rx="12" fill="url(#g)"/><text x="32" y="44" font-family="system-ui,sans-serif" font-size="32" font-weight="600" fill="#ffffff" text-anchor="middle">${safe}</text></svg>`;
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

  // Cache API：以域名为 key 缓存
  const cache = caches.default;
  const cacheKey = new Request(`https://favicon-cache.local/${domain}`, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) return corsify(cached);

  for (const sourceUrl of buildSources(domain)) {
    let resp;
    try {
      resp = await fetch(sourceUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
      });
    } catch {
      continue; // 网络失败/超时：尝试下一个源
    }
    if (!resp.ok) continue;

    const contentType = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    // 拒绝非图与 SVG（部分服务对错误域名把 HTML 错误页声明成 image/*）
    if (!contentType.startsWith('image/') || contentType === 'image/svg+xml') continue;

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

  // 全部源失败：返回首字母 SVG 兜底（短缓存，站点补图标后能更快生效）
  const out = new Response(letterSvg(domain), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
  waitUntil(cache.put(cacheKey, out.clone()));
  return corsify(out);
}
