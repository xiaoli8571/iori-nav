// 卡片 logo 解析 + favicon 代理域名校验 单元测试
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveCardLogoUrl, sanitizeUrl } from '../functions/lib/utils.js';
import { extractDomain } from '../functions/favicon.js';

const proxyFor = (domain) => `/favicon?url=${encodeURIComponent(domain)}`;

test('resolveCardLogoUrl: 无 logo → 走本站代理自动补全', () => {
  assert.deepEqual(resolveCardLogoUrl('https://example.com', null), { src: proxyFor('example.com'), fallback: '' });
  assert.deepEqual(resolveCardLogoUrl('https://example.com', ''), { src: proxyFor('example.com'), fallback: '' });
});

test('resolveCardLogoUrl: 已知 favicon 服务直链 → 重写为本站代理', () => {
  const r = resolveCardLogoUrl('https://example.com', 'https://faviconsnap.com/api/favicon?url=example.com');
  assert.equal(r.src, proxyFor('example.com'));
  assert.equal(r.fallback, '');
  // 带 www / 子域也能识别
  assert.equal(resolveCardLogoUrl('https://example.com', 'https://www.faviconsnap.com/x').src, proxyFor('example.com'));
  assert.equal(resolveCardLogoUrl('https://example.com', 'https://icons.duckduckgo.com/ip3/example.com.ico').src, proxyFor('example.com'));
  // 本站代理的绝对 URL 形式（ICON_API 指向本站存库的值）→ 统一为相对路径
  assert.equal(
    resolveCardLogoUrl('https://example.com', 'https://n.720820.xyz/favicon?url=app.notion.com').src,
    proxyFor('app.notion.com')
  );
});

test('resolveCardLogoUrl: 用户自定义直链 → 原样保留并挂二级兜底', () => {
  const r = resolveCardLogoUrl('https://example.com', 'https://cdn.example.com/logo.png');
  assert.equal(r.src, 'https://cdn.example.com/logo.png');
  assert.equal(r.fallback, proxyFor('example.com'));
});

test('resolveCardLogoUrl: 站点域名取 hostname 忽略端口与协议', () => {
  assert.equal(resolveCardLogoUrl('http://hy.815720.xyz:4096/app', null).src, proxyFor('hy.815720.xyz'));
  assert.equal(resolveCardLogoUrl('https://Example.COM/path', null).src, proxyFor('example.com'));
});

test('resolveCardLogoUrl: 无效站点 URL → 空输出退回字母占位', () => {
  assert.deepEqual(resolveCardLogoUrl('not-a-url', null), { src: '', fallback: '' });
  assert.deepEqual(resolveCardLogoUrl('', null), { src: '', fallback: '' });
  assert.deepEqual(resolveCardLogoUrl(null, null), { src: '', fallback: '' });
});

test('resolveCardLogoUrl: data:image 与 javascript: logo 被清洗后走代理/拒绝', () => {
  // data: URI 经 sanitizeUrl 清洗为空 → 走代理
  assert.equal(resolveCardLogoUrl('https://example.com', 'data:image/png;base64,AAA').src, proxyFor('example.com'));
  // javascript: URL 被 sanitizeUrl 拒绝 → 走代理（不会注入到 src）
  assert.equal(resolveCardLogoUrl('https://example.com', 'javascript:alert(1)').src, proxyFor('example.com'));
  // 代理 src 是本站相对路径（我们自己构造，天然安全），且不包含未转义的特殊字符
  const r = resolveCardLogoUrl('https://example.com', 'javascript:alert(1)');
  assert.ok(r.src.startsWith('/favicon?url='));
  assert.ok(!/["'<>\\ ]/.test(r.src));
});

test('favicon extractDomain: 提取纯域名并拒绝内网/非法输入', () => {
  assert.equal(extractDomain('https://example.com/a?b=c'), 'example.com');
  assert.equal(extractDomain('example.com:8080/x'), 'example.com');
  assert.equal(extractDomain('HTTPS://EXAMPLE.COM'), 'example.com');
  assert.equal(extractDomain('localhost'), null);
  assert.equal(extractDomain('192.168.1.1'), null);
  assert.equal(extractDomain('10.0.0.1'), null);
  assert.equal(extractDomain('127.0.0.1'), null);
  assert.equal(extractDomain('169.254.1.1'), null);
  assert.equal(extractDomain('my-service.internal'), null);
  assert.equal(extractDomain(''), null);
  assert.equal(extractDomain(null), null);
});
