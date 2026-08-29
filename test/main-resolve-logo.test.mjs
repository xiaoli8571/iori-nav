// main.js 浏览器端 resolveCardLogo 回归测试
// 背景: 该函数曾因 `parsed` 作用域错误在运行时抛 ReferenceError,
// 导致前端点击分类后整个卡片网格被清空(静默失败)。node --check 查不出
// 运行时作用域错误, 项目测试也不覆盖浏览器脚本, 故此处把函数源码从
// main.js 提取出来在 Node 里真实执行, 防止同类问题再次上线。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/js/main.js', import.meta.url), 'utf8');

/** 从源码中按声明起点提取完整块（花括号/方括号配平） */
function extractBlock(declSrc, startMarker) {
  const i = declSrc.indexOf(startMarker);
  assert.ok(i !== -1, `源码中找不到: ${startMarker}`);
  let depth = 0, started = false;
  for (let j = i; j < declSrc.length; j++) {
    const ch = declSrc[j];
    if (ch === '{' || ch === '[') { depth++; started = true; }
    if (ch === '}' || ch === ']') depth--;
    if (started && depth === 0) return declSrc.slice(i, j + 1);
  }
  throw new Error(`块未闭合: ${startMarker}`);
}

const knownSrc = extractBlock(src, 'const KNOWN_FAVICON_HOST_SUFFIXES');
const sanitizeSrc = extractBlock(src, 'function sanitizeHttpUrl');
const resolveSrc = extractBlock(src, 'function resolveCardLogo');

// 组装可执行作用域
const resolveCardLogo = new Function(`${knownSrc}\n${sanitizeSrc}\n${resolveSrc}\nreturn resolveCardLogo;`)();

const proxyFor = (d) => `/favicon?url=${encodeURIComponent(d)}`;

test('resolveCardLogo: 绝对代理 URL 相对化并保留原目标域名（回归: parsed 作用域错误）', () => {
  const r = resolveCardLogo({ logo: 'https://n.720820.xyz/favicon?url=app.notion.com' }, 'https://app.notion.com');
  assert.deepEqual(r, { src: proxyFor('app.notion.com'), fallback: '' });
});

test('resolveCardLogo: 全部常见形态不抛异常', () => {
  const cases = [
    [{ logo: null }, 'https://bilibili.com'],
    [{ logo: 'https://faviconsnap.com/api/favicon?url=github.com' }, 'https://github.com'],
    [{ logo: 'https://cdn.example.org/figma.png' }, 'https://figma.com'],
    [{ logo: 'https://tokenrhythm.studio/' }, 'https://tokenrhythm.studio/'],
    [{ logo: 'data:image/png;base64,AAA' }, 'https://example.com'],
    [{ logo: 'javascript:alert(1)' }, 'https://example.com'],
    [{ logo: '' }, ''],
    [{}, 'https://example.com'],
    [{ logo: 'https://x.com/a.png' }, 'not-a-url'],
  ];
  for (const [site, url] of cases) {
    assert.doesNotThrow(() => resolveCardLogo(site, url), `site=${JSON.stringify(site)} url=${url}`);
  }
});

test('resolveCardLogo: 已知 favicon 服务直链重写为本站代理', () => {
  const r = resolveCardLogo({ logo: 'https://faviconsnap.com/api/favicon?url=github.com' }, 'https://github.com');
  assert.deepEqual(r, { src: proxyFor('github.com'), fallback: '' });
});

test('resolveCardLogo: 自定义直链原样保留并挂二级兜底', () => {
  const r = resolveCardLogo({ logo: 'https://cdn.example.org/figma.png' }, 'https://figma.com');
  assert.deepEqual(r, { src: 'https://cdn.example.org/figma.png', fallback: proxyFor('figma.com') });
});
