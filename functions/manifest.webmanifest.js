// functions/manifest.webmanifest.js
// 动态生成 PWA manifest：站点名称/描述读取后台设置（KV settings_cache → D1 兜底），
// 与首页 SSR 的取值优先级保持一致（settings > 环境变量 > 默认值）

import { getSettingsKeys, parseSettings } from './lib/settings-parser';

const ICONS = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

async function fetchSettings(env) {
  try {
    // 优先读 KV 设置缓存（api/settings.js 写入时清除，index.js 回填，TTL 24h）
    const cached = await env.NAV_AUTH.get('settings_cache', { type: 'json' });
    if (cached) return parseSettings(cached);
  } catch (e) {
    console.warn('Manifest settings cache read failed:', e);
  }
  try {
    const keys = getSettingsKeys();
    const placeholders = keys.map(() => '?').join(',');
    const { results } = await env.NAV_DB
      .prepare(`SELECT key, value FROM settings WHERE key IN (${placeholders})`)
      .bind(...keys)
      .all();
    return parseSettings(results || []);
  } catch (e) {
    return parseSettings([]);
  }
}

export async function onRequestGet({ request, env }) {
  const S = await fetchSettings(env);
  const siteName = S.home_site_name || env.SITE_NAME || '灰色轨迹';
  const siteDescription = S.home_site_description || env.SITE_DESCRIPTION
    || '一个优雅、快速、易于部署的书签（网址）收藏与分享平台，完全基于 Cloudflare 全家桶构建';

  const manifest = {
    name: siteName,
    short_name: siteName.length > 12 ? siteName.slice(0, 12) : siteName,
    description: siteDescription,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#fdf8f3',
    theme_color: '#254267',
    lang: 'zh-CN',
    icons: ICONS,
  };

  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
