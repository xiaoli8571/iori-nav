// 首页 SSR 冒烟测试：mock D1/KV/ASSETS，验证 v9 注入内容（PWA/SEO/星标/快捷键提示）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { onRequest } from '../functions/index.js';
import { HOME_CACHE_VERSION } from '../functions/constants.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const templateHtml = readFileSync(join(root, 'public/index.html'), 'utf8');

function createKv(initialEntries = {}) {
  const store = new Map(Object.entries(initialEntries));
  return {
    store,
    async get(key, opts) {
      const value = store.get(key) ?? null;
      if (value !== null && opts && opts.type === 'json') {
        try { return JSON.parse(value); } catch { return null; }
      }
      return value;
    },
    async put(key, value) { store.set(key, value); },
    async delete(key) { store.delete(key); },
  };
}

function createDb({ categories, sites }) {
  const table = (sql) => {
    if (sql.includes('FROM category')) return categories;
    if (sql.includes('FROM sites')) return sites;
    if (sql.includes('FROM settings')) return [];
    return [];
  };
  return {
    prepare(sql) {
      return {
        bind() { return { all: async () => ({ results: table(sql) }) }; },
        all: async () => ({ results: table(sql) }),
        run: async () => ({ success: true }),
      };
    },
    async batch(statements) { return statements.map(() => ({ success: true })); },
  };
}

function makeEnv({ categories = [], sites = [] } = {}) {
  return {
    NAV_AUTH: createKv({ [`schema_migrated_v4`]: 'true' }),
    NAV_DB: createDb({ categories, sites }),
    ASSETS: { fetch: async () => new Response(templateHtml, { headers: { 'Content-Type': 'text/html' } }) },
  };
}

function makeContext(env, url = 'https://nav.example.com/') {
  const waitUntilPromises = [];
  return {
    request: new Request(url),
    env,
    waitUntil: (p) => waitUntilPromises.push(Promise.resolve(p).catch(() => {})),
    _drain: () => Promise.all(waitUntilPromises),
  };
}

test('home SSR injects PWA manifest, theme-color, JSON-LD and hitokoto preconnect', async () => {
  const env = makeEnv({ categories: [{ id: 1, catelog: '工具', sort_order: 1 }], sites: [{ id: 1, name: 'GitHub', url: 'https://github.com', catelog_id: 1, catelog_name: '工具' }] });
  const ctx = makeContext(env);
  const res = await onRequest(ctx);
  const html = await res.text();

  assert.equal(res.status, 200);
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#254267">/);
  assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#111827">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png">/);
  assert.match(html, /<link rel="preconnect" href="https:\/\/v1\.hitokoto\.cn" crossorigin>/);
  assert.match(html, /application\/ld\+json/);
  const jsonLd = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  assert.ok(jsonLd, 'JSON-LD script exists');
  const data = JSON.parse(jsonLd[1]);
  assert.equal(data['@type'], 'WebSite');
});

test('home SSR renders fav buttons, kbd hint and enterkeyhint on cards/inputs', async () => {
  const env = makeEnv({
    categories: [{ id: 1, catelog: '工具', sort_order: 1 }],
    sites: [{ id: 7, name: 'GitHub', url: 'https://github.com', catelog_id: 1, catelog_name: '工具' }],
  });
  const ctx = makeContext(env);
  const html = await onRequest(ctx).then(r => r.text());

  assert.match(html, /class="fav-btn" data-fav-id="7"/);
  assert.match(html, /<use href="#icon-star"\/>/);
  assert.match(html, /<symbol id="icon-star-solid"/); // sprite 中定义实心星
  assert.match(html, /<kbd class="search-kbd"/);
  assert.match(html, /enterkeyhint="search"/);
  assert.match(html, /id="favFilterBtn"/);
  // 卡片容器改为 relative 定位以承载星标按钮
  assert.match(html, /site-card group relative/);
});

test('home SSR caches html under v9 key and follows system theme script', async () => {
  const env = makeEnv();
  const ctx = makeContext(env);
  const html = await onRequest(ctx).then(r => r.text());
  await ctx._drain();

  const cached = env.NAV_AUTH.store.get(`home_html_public_${HOME_CACHE_VERSION}`);
  assert.ok(cached, 'home html cached under v9 key');
  assert.match(cached, /rel="manifest"/);
  // FOUC 脚本包含系统偏好判断
  assert.match(html, /prefers-color-scheme: dark/);
  assert.match(html, /localStorage\.getItem\('theme'\)/);
});

test('manifest route returns valid manifest with site name from settings', async () => {
  const { onRequestGet } = await import('../functions/manifest.webmanifest.js');
  const settingsRows = [{ key: 'home_site_name', value: '我的导航站' }];
  const env = {
    NAV_AUTH: createKv(),
    NAV_DB: {
      prepare(sql) {
        return {
          bind() { return { all: async () => ({ results: sql.includes('settings') ? settingsRows : [] }) }; },
          all: async () => ({ results: sql.includes('settings') ? settingsRows : [] }),
        };
      },
    },
  };
  const res = await onRequestGet({ request: new Request('https://nav.example.com/manifest.webmanifest'), env });
  const manifest = await res.json();

  assert.equal(manifest.name, '我的导航站');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some(i => i.purpose === 'maskable'));
  assert.match(res.headers.get('Content-Type'), /manifest\+json/);
});

test('robots and sitemap routes respond with correct content types', async () => {
  const robots = await import('../functions/robots.txt.js');
  const sitemap = await import('../functions/sitemap.xml.js');

  const env = makeEnv({ categories: [{ id: 1, catelog: '工具' }] });

  const robotsRes = await robots.onRequestGet({ request: new Request('https://nav.example.com/robots.txt'), env });
  assert.equal(robotsRes.status, 200);
  assert.match(robotsRes.headers.get('Content-Type'), /text\/plain/);
  assert.match(await robotsRes.text(), /Sitemap: https:\/\/nav\.example\.com\/sitemap\.xml/);

  const sitemapRes = await sitemap.onRequestGet({ request: new Request('https://nav.example.com/sitemap.xml'), env });
  assert.match(sitemapRes.headers.get('Content-Type'), /application\/xml/);
  const xml = await sitemapRes.text();
  assert.match(xml, /<loc>https:\/\/nav\.example\.com\/<\/loc>/);
  assert.match(xml, /catalog=%E5%B7%A5%E5%85%B7/);
});
