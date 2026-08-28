// functions/robots.txt.js
// 动态生成 robots.txt：Sitemap 地址需要跟随部署域名，故不能放静态文件

import { buildRobotsTxt } from './lib/seo';

export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  return new Response(buildRobotsTxt(origin), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
