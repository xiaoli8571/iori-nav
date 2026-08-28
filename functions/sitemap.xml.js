// functions/sitemap.xml.js
// 动态生成 sitemap.xml：包含首页与全部公开分类页（与首页 SSR 同样的公私过滤规则）

import { buildSitemapXml } from './lib/seo';

export async function onRequestGet({ request, env }) {
  const origin = new URL(request.url).origin;

  let categories = [];
  try {
    const { results } = await env.NAV_DB
      .prepare('SELECT catelog FROM category WHERE is_private = 0 ORDER BY sort_order ASC, id ASC')
      .all();
    categories = results || [];
  } catch (e) {
    // 表不存在等异常时降级为仅含首页的 sitemap
    console.error('Failed to fetch categories for sitemap:', e);
  }

  return new Response(buildSitemapXml(categories, origin), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
