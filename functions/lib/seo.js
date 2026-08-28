// functions/lib/seo.js
// SEO 相关纯函数构建器（robots.txt / sitemap.xml / JSON-LD）
// 保持无副作用，便于单元测试（见 test/seo.test.mjs）

import { escapeHTML } from './utils';

/**
 * 构建 robots.txt 内容
 * @param {string} origin - 站点源（如 https://example.com）
 * @returns {string}
 */
export function buildRobotsTxt(origin) {
  const safeOrigin = String(origin || '').replace(/[\r\n]/g, '');
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api',
    '',
    `Sitemap: ${safeOrigin}/sitemap.xml`,
    '',
  ].join('\n');
}

/**
 * XML 文本转义
 * @param {string} s
 * @returns {string}
 */
export function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 构建 sitemap.xml 内容（首页 + 各公开分类页）
 * @param {Array<{catelog: string}>} categories - 公开分类列表
 * @param {string} origin - 站点源
 * @param {Date} [now] - lastmod 基准时间
 * @returns {string}
 */
export function buildSitemapXml(categories, origin, now = new Date()) {
  const safeOrigin = String(origin || '').replace(/[\r\n]/g, '');
  const lastmod = now.toISOString().slice(0, 10);
  const urls = [safeOrigin + '/'];

  const seen = new Set();
  (Array.isArray(categories) ? categories : []).forEach(cat => {
    const name = (cat && cat.catelog) ? String(cat.catelog).trim() : '';
    if (!name || seen.has(name)) return;
    seen.add(name);
    urls.push(`${safeOrigin}/?catalog=${encodeURIComponent(name)}`);
  });

  const body = urls
    .map(u => `  <url><loc>${escapeXml(u)}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq></url>`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/**
 * 构建首页 JSON-LD（WebSite 结构化数据）
 * @param {string} siteName
 * @param {string} siteDescription
 * @param {string} origin
 * @returns {string} <script> 标签内容（已转义 < 防注入）
 */
export function buildJsonLd(siteName, siteDescription, origin) {
  const safeOrigin = String(origin || '').replace(/[\r\n]/g, '');
  const data = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: String(siteName || ''),
    description: String(siteDescription || ''),
    url: safeOrigin + '/',
  };
  // < 转义防止 </script> 提前闭合（与 IORI_SITES 注入同一策略）
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
