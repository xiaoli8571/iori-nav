import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRobotsTxt, buildSitemapXml, buildJsonLd, escapeXml } from '../functions/lib/seo.js';

test('buildRobotsTxt disallows admin/api and points to sitemap', () => {
  const txt = buildRobotsTxt('https://nav.example.com');
  assert.match(txt, /^User-agent: \*/m);
  assert.match(txt, /^Disallow: \/admin$/m);
  assert.match(txt, /^Disallow: \/api$/m);
  assert.match(txt, /^Sitemap: https:\/\/nav\.example\.com\/sitemap\.xml$/m);
});

test('buildRobotsTxt strips CRLF to avoid header injection', () => {
  const txt = buildRobotsTxt('https://evil.example\r\nHost: x');
  assert.doesNotMatch(txt, /[\r\n]Host:/);
});

test('buildSitemapXml includes home and unique category urls', () => {
  const xml = buildSitemapXml(
    [{ catelog: '常用工具' }, { catelog: 'Docs' }, { catelog: '常用工具' }, { catelog: '' }],
    'https://nav.example.com',
    new Date('2026-03-01T00:00:00Z')
  );
  assert.match(xml, /<loc>https:\/\/nav\.example\.com\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/nav\.example\.com\/\?catalog=%E5%B8%B8%E7%94%A8%E5%B7%A5%E5%85%B7<\/loc>/);
  assert.match(xml, /<loc>https:\/\/nav\.example\.com\/\?catalog=Docs<\/loc>/);
  assert.equal(xml.match(/<loc>/g).length, 3); // 去重 + 跳过空分类
  assert.match(xml, /<lastmod>2026-03-01<\/lastmod>/);
});

test('buildSitemapXml escapes XML special chars in urls', () => {
  const xml = buildSitemapXml([{ catelog: 'A&B<C>' }], 'https://nav.example.com', new Date());
  // 分类名经 encodeURIComponent 后特殊字符已百分号编码，不应出现裸露的 < & >
  assert.match(xml, /catalog=A%26B%3CC%3E/);
  assert.doesNotMatch(xml, /catalog=A&/);
  assert.doesNotMatch(xml, /<loc>[^<]*A&B/);
});

test('buildJsonLd emits WebSite schema and escapes < for script safety', () => {
  const json = buildJsonLd('我的导航', '描述 </script><script>alert(1)</script>', 'https://nav.example.com');
  const data = JSON.parse(json);
  assert.equal(data['@type'], 'WebSite');
  assert.equal(data.url, 'https://nav.example.com/');
  assert.doesNotMatch(json, /<\/script>/);
});

test('escapeXml escapes all five special characters', () => {
  assert.equal(escapeXml(`<&>"'`), '&lt;&amp;&gt;&quot;&apos;');
});
