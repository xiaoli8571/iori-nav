// functions/lib/utils.js
// 共用工具函数

import { FONT_MAP } from '../constants';

/**
 * HTML 特殊字符转义
 */
const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, c => ESCAPE_MAP[c]);
}

/**
 * URL 安全化：严格白名单，仅允许 http/https 协议
 */
export function sanitizeUrl(url) {
    if (!url) return '';
    const trimmed = url.trim();
    if (!trimmed) return '';
    if (!/^https?:\/\//i.test(trimmed)) return '';
    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return '';
        }
        return parsed.href;
    } catch {
        return '';
    }
}

function getUrlAuthority(parsed) {
    const auth = (parsed.username || parsed.password)
        ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}@`
        : '';
    return `${parsed.protocol}//${auth}${parsed.host}`;
}

/**
 * 书签 URL 存储规范化：保留路径语义，仅将根路径 URL 规范为不带结尾斜杠
 */
export function normalizeUrlForStorage(url) {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) return '';

    try {
        const parsed = new URL(safeUrl);
        if (parsed.pathname === '/') {
            return `${getUrlAuthority(parsed)}${parsed.search}${parsed.hash}`;
        }
        return parsed.href;
    } catch {
        return '';
    }
}

/**
 * 生成 URL 查重候选，兼容根路径历史数据中带/不带结尾斜杠的两种形式
 */
export function getUrlMatchCandidates(url) {
    const rawUrl = String(url ?? '').trim();
    const normalizedUrl = normalizeUrlForStorage(rawUrl);
    if (!normalizedUrl) return [];

    const candidates = new Set([normalizedUrl]);
    const safeUrl = sanitizeUrl(rawUrl);
    if (safeUrl) candidates.add(safeUrl);
    if (rawUrl) candidates.add(rawUrl);

    try {
        const parsed = new URL(safeUrl || normalizedUrl);
        if (parsed.pathname === '/') {
            const authority = getUrlAuthority(parsed);
            candidates.add(`${authority}${parsed.search}${parsed.hash}`);
            candidates.add(`${authority}/${parsed.search}${parsed.hash}`);
        }
    } catch {
        // normalizedUrl 已经过 sanitizeUrl 校验，这里仅做防御
    }

    return [...candidates].filter(Boolean);
}

/**
 * 安全化字体大小：仅允许有限范围内的 px 数值
 */
export function sanitizeStyleSize(size, options = {}) {
    if (size === null || size === undefined || size === '') return '';
    const min = options.min ?? 8;
    const max = options.max ?? 96;
    const value = Number(String(size).trim());
    if (!Number.isFinite(value) || value < min || value > max) return '';
    return String(Math.round(value * 100) / 100);
}

/**
 * 安全化颜色值：允许 hex / rgb() / rgba()，拒绝包含 CSS 注入风险的表达式
 */
export function sanitizeStyleColor(color) {
    if (!color) return '';
    const value = String(color).trim();
    if (!value) return '';
    const lowerValue = value.toLowerCase();
    if (lowerValue === 'undefined' || lowerValue === 'null') return '';

    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
        return value;
    }

    // CSS named colors and global keywords are identifier-only, so they cannot
    // break out of the declaration the way semicolons/functions can.
    if (/^[a-z][a-z0-9-]{0,31}$/i.test(value)) {
        return value;
    }

    const rgbMatch = value.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(0|1|0?\.\d+))?\s*\)$/i);
    if (!rgbMatch) return '';

    const channels = rgbMatch.slice(1, 4).map(Number);
    if (channels.some(channel => channel < 0 || channel > 255)) return '';
    if (value.toLowerCase().startsWith('rgba') && rgbMatch[4] === undefined) return '';

    return value;
}

/**
 * 解析分页参数，防止 NaN/负数传入 LIMIT/OFFSET
 */
export function parsePagination(searchParams, options = {}) {
    const defaultPage = options.defaultPage ?? 1;
    const defaultPageSize = options.defaultPageSize ?? 10;
    const maxPageSize = options.maxPageSize ?? 200;

    const requestedPage = parseInt(searchParams.get('page') || String(defaultPage), 10);
    const requestedPageSize = parseInt(searchParams.get('pageSize') || String(defaultPageSize), 10);

    const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : defaultPage;
    const rawPageSize = Number.isFinite(requestedPageSize) && requestedPageSize > 0
        ? requestedPageSize
        : defaultPageSize;
    const pageSize = Math.min(rawPageSize, maxPageSize);

    return {
        page,
        pageSize,
        offset: (page - 1) * pageSize,
    };
}

/**
 * 排序值归一化
 */
export function normalizeSortOrder(val) {
    const num = Number(val);
    return Number.isFinite(num) ? num : 9999;
}

/**
 * 转义 SQL LIKE 通配符
 */
export function escapeLikePattern(str) {
    return String(str).replace(/[%_\\]/g, c => '\\' + c);
}

/**
 * 为给定 URL 生成 favicon 图标地址
 * @param {string} siteUrl - 站点 URL
 * @param {string} currentLogo - 现有 logo（非空则直接返回）
 * @param {string} iconAPI - favicon API 前缀
 * @returns {string|null}
 */
export function buildFaviconUrl(siteUrl, currentLogo, iconAPI) {
    if (currentLogo && !currentLogo.startsWith('data:image')) return currentLogo;
    if (!siteUrl || !(siteUrl.startsWith('https://') || siteUrl.startsWith('http://'))) return currentLogo || null;
    try {
        // 用 hostname 而非 host：host 会保留端口（如 hy.815720.xyz:4096），favicon 服务无法解析
        const domain = new URL(siteUrl).hostname;
        return `${iconAPI}${domain}`;
    } catch {
        return currentLogo || null;
    }
}

/**
 * 已知第三方 favicon 服务域名后缀——这些直链质量差（对大量站点返回
 * 1×1 透明图/地球球标），渲染时统一重写到本站多源代理 /favicon?url=
 */
const KNOWN_FAVICON_HOST_SUFFIXES = [
    'faviconsnap.com',
    'favicon.im',
    'icons.duckduckgo.com',
    'gstatic.com',      // google s2 走 *.gstatic.com
    'google.com',       // google s2 也可能走 www.google.com
    'googleusercontent.com',
];

/**
 * 从代理 URL 的 url 参数中提取纯域名（仅 http(s)/裸域名，复用与代理一致的基本校验）
 */
function extractProxyDomain(raw) {
    const input = String(raw || '').trim();
    if (!input || input.length > 253) return '';
    let candidate = input;
    if (!/^https?:\/\//i.test(candidate)) candidate = 'http://' + candidate;
    try {
        const host = new URL(candidate).hostname.toLowerCase();
        return (host.includes('.') && host.length <= 253) ? host : '';
    } catch {
        return '';
    }
}

/**
 * 渲染端卡片 logo 解析：决定 <img src> 与 onerror 二级兜底 data-fallback
 *
 * - 站点 URL 无效：返回空 src（卡片退回首字母占位块）
 * - logo 为空，或 logo 指向已知 favicon 服务：src = 本站代理 /favicon?url=<域名>
 *   （代理内部依次尝试多个源，最终兜底首字母 SVG，卡片永不空白）
 * - 其他（用户自定义直链）：src 原样保留，data-fallback = 本站代理，
 *   直链 404 时 onerror 自动切换到代理，无需改库即可修复存量坏数据
 *
 * @param {string} siteUrl - 书签站点 URL
 * @param {string|null} logo - 存库 logo（可能为 faviconsnap 直链 / 自定义直链 / 空）
 * @returns {{src: string, fallback: string}}
 */
export function resolveCardLogoUrl(siteUrl, logo) {
    // 站点域名提取（与 buildFaviconUrl 同样用 hostname 忽略端口）
    let domain = '';
    if (siteUrl && /^https?:\/\//i.test(siteUrl)) {
        try {
            const host = new URL(siteUrl).hostname.toLowerCase();
            if (host.includes('.') && host.length <= 253) domain = host;
        } catch { /* 无效 URL：domain 保持空 */ }
    }
    if (!domain) return { src: '', fallback: '' };

    const proxyUrl = `/favicon?url=${encodeURIComponent(domain)}`;

    const trimmed = String(logo || '').trim();
    if (trimmed && !trimmed.startsWith('data:image')) {
        const safeLogo = sanitizeUrl(trimmed);
        if (safeLogo) {
            // 已知 favicon 服务直链 → 重写到本站代理（多源更稳）
            let logoHost = '', logoPath = '', parsed = null;
            try {
                parsed = new URL(safeLogo);
                logoHost = parsed.hostname.toLowerCase();
                logoPath = parsed.pathname;
            } catch { /* 不可达 */ }
            // 本站代理的绝对 URL 形式（ICON_API 指向本站时存库的值）→ 统一为相对路径，
            // 并保留其原有 url 参数（图标真正对应的域名）
            if (logoPath === '/favicon') {
                const inner = (parsed.searchParams.get('url') || '').trim();
                const innerDomain = extractProxyDomain(inner);
                if (innerDomain) return { src: `/favicon?url=${encodeURIComponent(innerDomain)}`, fallback: '' };
                return { src: proxyUrl, fallback: '' };
            }
            const isKnownFaviconService = KNOWN_FAVICON_HOST_SUFFIXES.some(s => logoHost === s || logoHost.endsWith('.' + s));
            if (isKnownFaviconService) return { src: proxyUrl, fallback: '' };
            // 用户自定义直链 → 原样输出，失败时 onerror 自动切到代理
            return { src: safeLogo, fallback: proxyUrl };
        }
    }
    // 无 logo（或仅 data: 被清洗）：走本站代理自动补全
    return { src: proxyUrl, fallback: '' };
}

/**
 * 构建 style 属性字符串（字体名通过 FONT_MAP 白名单校验）
 * @returns {string} 如 'style="font-size: 16px; color: red;"' 或空字符串
 */
export function getStyleStr(size, color, font) {
    let s = '';
    const safeSize = sanitizeStyleSize(size);
    const safeColor = sanitizeStyleColor(color);
    if (safeSize) s += `font-size: ${safeSize}px;`;
    if (safeColor) s += `color: ${safeColor} !important;`;
    if (font && font in FONT_MAP) s += `font-family: ${font} !important;`;
    return s ? `style="${s}"` : '';
}
