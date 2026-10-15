import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  ORIGIN,
  LOCALES,
  escape as h,
  json,
  countryName,
  languageName,
  categoryName,
  safeWebsite,
  countryPath,
  channelPath,
  watchPath,
  buildPages,
  alternatePaths,
  metadata,
} from "./model.mjs";
const catalog = JSON.parse(await readFile("seo/catalog.json", "utf8"));
const { pages, profiles } = buildPages(catalog);
const profileIds = new Set(profiles.map((c) => c.id));
const seoTemplate = await readFile("dist/seo.html", "utf8"),
  appTemplate = await readFile("dist/index.html", "utf8");
if (!appTemplate.includes('id="root"'))
  throw Error(
    "SEO rendering requires a fresh Vite build; run npm run build instead.",
  );
const tags = (template) => ({
  css: [...template.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)]
    .map((m) => m[0])
    .join(""),
  scripts: [
    ...template.matchAll(
      /<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g,
    ),
  ]
    .map((m) => m[0])
    .join(""),
});
const seoAssets = tags(seoTemplate),
  appAssets = tags(appTemplate);
const pick = (locale, zh, en) => (locale === "en" ? en : zh);
const href = (url, label, cls = "") =>
  `<a${cls ? ` class="${h(cls)}"` : ""} href="${h(url)}">${h(label)}</a>`;
function header(page) {
  const l = page.locale,
    alt = alternatePaths(page);
  return `<header class="seo-header"><a class="brand" href="/${l}/"><span class="brand-icon" aria-hidden="true">◉</span><span>MalMarket<b>TV</b></span></a><nav aria-label="${pick(l, "主导航", "Main navigation")}">${href("/" + l + "/#countries", pick(l, "国家目录", "Countries"))}${href("/watch/", pick(l, "地球与播放器", "Globe & player"))}${href(l === "en" ? alt["zh-Hans"] : alt.en, l === "en" ? "中文" : "English")}</nav></header>`;
}
function footer(locale) {
  return `<footer class="seo-footer"><span>MalMarket TV</span>${href("https://github.com/iptv-org/iptv", pick(locale, "频道来源：iptv-org", "Channel source: iptv-org"))}${href("https://github.com/pashasasha300-afk/malmarkettv/issues", pick(locale, "纠错与版权下架", "Corrections & takedown"))}${href("/country-locations-LICENSE.txt", pick(locale, "国家坐标许可", "Country location licence"))}<p>${pick(locale, "直播由提供方直接提供，可能受地区、网络及提供方限制。公开目录不代表内容授权；未验证的播放状态、评分和节目单不会作为事实展示。", "Streams connect directly to providers and may be limited by location, network or provider restrictions. A public listing does not grant content rights. No unverified availability, ratings or programme schedules are presented as facts.")}</p></footer>`;
}
function channelAnchor(c, locale) {
  return href(
    profileIds.has(c.id) ? channelPath(c.id, locale) : watchPath(c.id),
    c.name,
  );
}
function channelRows(channels, locale) {
  return `<ul class="seo-channel-list">${channels.map((c) => `<li><span class="seo-channel-initial" aria-hidden="true">${h(c.name.slice(0, 2))}</span><div>${channelAnchor(c, locale)}<p>${h(c.languages.map((x) => languageName(x, locale)).join(" · ") || pick(locale, "语言未提供", "Language not provided"))} · ${h(c.categories.map((x) => categoryName(x, locale)).join(" · ") || pick(locale, "分类未提供", "Category not provided"))}</p></div>${href(watchPath(c.id), pick(locale, "观看", "Watch"), "seo-watch-link")}</li>`).join("")}</ul>`;
}
function breadcrumbs(page) {
  const l = page.locale;
  const items = [{ name: pick(l, "首页", "Home"), path: "/" + l + "/" }];
  if (page.kind === "country")
    items.push({ name: countryName(page.country.code, l), path: page.path });
  if (page.kind === "channel") {
    items.push({
      name: countryName(page.channel.country, l),
      path: countryPath(page.channel.country, l),
    });
    items.push({ name: page.channel.name, path: page.path });
  }
  return {
    html: `<nav class="breadcrumbs" aria-label="${pick(l, "面包屑导航", "Breadcrumb")}">${items.map((i, n) => (n === items.length - 1 ? `<span aria-current="page">${h(i.name)}</span>` : href(i.path, i.name))).join('<span aria-hidden="true"> / </span>')}</nav>`,
    schema: {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((i, n) => ({
        "@type": "ListItem",
        position: n + 1,
        name: i.name,
        item: ORIGIN + i.path,
      })),
    },
  };
}
function home(page) {
  const l = page.locale;
  const ordered = [...catalog.countries].sort((a, b) =>
    countryName(a.code, l).localeCompare(
      countryName(b.code, l),
      l === "zh" ? "zh-CN" : "en",
    ),
  );
  const featuredIds = [
    "France24.fr",
    "NHKWorldJapan.jp",
    "3ABNEnglish.us",
    "DWEnglish.de",
    "AlJazeeraEnglish.qa",
  ];
  const featured = [...profiles]
    .sort(
      (a, b) =>
        (featuredIds.indexOf(a.id) < 0 ? 999 : featuredIds.indexOf(a.id)) -
        (featuredIds.indexOf(b.id) < 0 ? 999 : featuredIds.indexOf(b.id)),
    )
    .slice(0, 8);
  const countries = ordered.map((c) => ({
    ...c,
    name: countryName(c.code, l),
    count: catalog.channels.filter((ch) => ch.country === c.code).length,
  }));
  return `<section class="seo-home-hero"><div><h1>${pick(l, "从地球出发，发现电视直播", "Discover television around the world")}</h1><p>${pick(l, `按国家与地区浏览 ${catalog.channels.length.toLocaleString("zh-CN")} 个公开收录频道。先了解频道资料，再打开播放器，或继续使用地球选台。`, `Browse ${catalog.channels.length.toLocaleString("en")} publicly listed channels by country and region. Read channel information, open the player or keep exploring the globe.`)}</p><div class="seo-hero-actions">${href("/watch/", pick(l, "打开地球与播放器", "Open globe & player"), "seo-button")}${href("#countries", pick(l, "浏览国家目录", "Browse countries"), "seo-secondary")}</div><p class="seo-small">${pick(l, "频道数量为目录收录数量，不表示所有直播源均可播放。", "Counts describe directory listings, not verified stream availability.")}</p></div><div class="seo-globe-panel"><div id="home-globe" aria-label="${pick(l, "交互地球", "Interactive globe")}"><p>${pick(l, "正在准备地球；无需等待，也可通过下方国家链接浏览。", "Preparing the globe. You can also use the country links below without waiting.")}</p></div><p class="seo-small">${pick(l, "国家级位置 · 点击标记浏览该地区频道", "Country-level locations · Select a marker to browse channels")}</p></div></section><section class="seo-section" id="countries"><h2>${pick(l, "国家与地区目录", "Countries and regions")}</h2><p>${pick(l, `以下 ${countries.length} 个国家与地区在本次目录快照中有收录直播源。没有源的地区不生成空目录页。`, `These ${countries.length} countries and regions have listed streams in the current catalogue snapshot. Empty country pages are not generated.`)}</p><ul class="seo-country-grid">${countries.map((c) => `<li>${href(countryPath(c.code, l), c.name)}<span>${c.count} ${pick(l, "个频道", "channels")}</span></li>`).join("")}</ul></section><section class="seo-section"><h2>${pick(l, "浏览频道资料", "Browse channel profiles")}</h2><p>${pick(l, "以下频道具备登记官网、语言与分类资料；这些字段不代表官方授权或播放保证。", "These channels have a listed website, language and category information. Those fields do not establish content authorisation or guarantee playback.")}</p>${channelRows(featured, l)}</section><script type="application/json" id="home-data">${json({ locale: l, countries })}</script>`;
}
function countryContent(page) {
  const l = page.locale,
    name = countryName(page.country.code, l);
  return `${breadcrumbs(page).html}<section class="seo-page-intro"><h1>${h(name)}${pick(l, "电视直播频道目录", " TV channel directory")}</h1><p>${pick(l, `目录中有 ${page.channels.length} 个登记在${h(name)}的频道。查看名称、语言与分类，或打开播放器选择直播源。`, `The catalogue lists ${page.channels.length} channels under ${h(name)}. Browse their names, languages and categories, or open the player to select a stream.`)}</p>${href(watchPath(null, page.country.code), pick(l, "在播放器中浏览该地区", "Browse this region in the player"), "seo-button")}<p class="seo-small">${pick(l, "国家与地区依据公开目录登记，不代表每条源的接收范围。源可能失效或受访问限制；本页不宣称实时可播。", "Country and region labels follow the public directory and do not define stream reception areas. Streams may fail or be restricted; this page does not claim real-time availability.")}</p></section><section class="seo-section"><h2>${pick(l, "频道列表", "Channel list")}</h2><p>${pick(l, "有完整资料页的频道链接到详情；其他条目直接打开播放器。", "Channels with published profiles link to their information pages; other entries open the player directly.")}</p>${channelRows(page.channels, l)}</section>`;
}
function channelContent(page) {
  const l = page.locale,
    c = page.channel;
  const rows = [
    [pick(l, "频道名称", "Channel name"), h(c.name)],
    [
      pick(l, "目录国家 / 地区", "Listed country / region"),
      href(countryPath(c.country, l), countryName(c.country, l)),
    ],
    [
      pick(l, "语言", "Languages"),
      h(c.languages.map((x) => languageName(x, l)).join(" · ")),
    ],
    [
      pick(l, "分类", "Categories"),
      h(c.categories.map((x) => categoryName(x, l)).join(" · ")),
    ],
    [
      pick(l, "登记官网", "Listed website"),
      href(safeWebsite(c.website), safeWebsite(c.website)),
    ],
    [pick(l, "目录频道标识", "Directory channel ID"), h(c.id)],
    [
      pick(l, "数据来源", "Data sources"),
      href("https://github.com/iptv-org/database", "iptv-org/database") +
        " · " +
        href("https://github.com/iptv-org/iptv", "iptv-org/iptv"),
    ],
  ];
  return `${breadcrumbs(page).html}<section class="seo-page-intro"><h1>${h(c.name)}</h1><p>${pick(l, "公开频道资料与直播入口", "Public channel information and player access")}</p><div class="seo-hero-actions">${href(watchPath(c.id), pick(l, "打开播放器观看", "Open in player"), "seo-button")}${href(countryPath(c.country, l), pick(l, "浏览同地区频道", "Browse channels in this region"), "seo-secondary")}</div></section><section class="seo-section"><h2>${pick(l, "频道资料", "Channel information")}</h2><dl class="seo-facts">${rows.map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`).join("")}</dl></section><section class="seo-section seo-disclosure"><h2>${pick(l, "来源与观看说明", "Sources and viewing information")}</h2><p>${pick(l, `${h(c.name)} 的名称、官网、语言与分类来自公开目录，并存储在 MalMarket TV 的 Supabase 目录中。本站没有可核实的频道简介，因此只展示已登记字段，不补写节目或运营介绍。`, `The name, website, languages and categories for ${h(c.name)} come from public directory records stored in the MalMarket TV Supabase catalogue. We do not have a verified editorial description, so this page presents listed fields without inventing programming or operational details.`)}</p><p>${pick(l, "播放器由你的浏览器直连直播提供方。是否能播放取决于当前源、浏览器、网络与地区限制。登记官网不等于该直播源已经获官方核验；公开目录也不代表内容授权。", "The player connects your browser directly to the stream provider. Playback depends on the current source, browser, network and location restrictions. A listed website does not establish that a stream has been officially verified, and a public listing is not a content licence.")}</p><p>${pick(l, "本页不展示未经核实的实时可用状态、评分或节目单。如发现资料错误或版权问题，请联系维护者。", "This page does not publish unverified live availability, ratings or programme schedules. Contact the maintainer about incorrect information or rights concerns.")}</p>${href("https://github.com/pashasasha300-afk/malmarkettv/issues", pick(l, "提交纠错或版权下架请求", "Report an error or request a takedown"))}</section>`;
}
const titleCounts = new Map();
for (const page of pages) {
  const title = metadata(page, catalog).title;
  titleCounts.set(title, (titleCounts.get(title) || 0) + 1);
}
function document(page) {
  const meta = metadata(page, catalog);
  if (titleCounts.get(meta.title) > 1 && page.channel)
    meta.title = meta.title
      .replace(" | MalMarket TV", ` (${page.channel.id}) | MalMarket TV`)
      .replace("｜MalMarket TV", `（${page.channel.id}）｜MalMarket TV`);
  const alternates = alternatePaths(page),
    canonical = ORIGIN + page.path;
  const structured =
    page.kind === "home"
      ? {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "MalMarket TV",
          url: ORIGIN + "/" + page.locale + "/",
          inLanguage: page.locale === "zh" ? "zh-Hans" : "en",
        }
      : breadcrumbs(page).schema;
  const head = `<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0b1117"><title>${h(meta.title)}</title><meta name="description" content="${h(meta.description)}"><meta name="robots" content="index,follow"><link rel="canonical" href="${canonical}">${Object.entries(
    alternates,
  )
    .map(
      ([lang, url]) =>
        `<link rel="alternate" hreflang="${lang}" href="${ORIGIN + url}">`,
    )
    .join(
      "",
    )}<meta property="og:type" content="website"><meta property="og:site_name" content="MalMarket TV"><meta property="og:title" content="${h(meta.title)}"><meta property="og:description" content="${h(meta.description)}"><meta property="og:url" content="${canonical}"><meta property="og:locale" content="${page.locale === "zh" ? "zh_CN" : "en_US"}"><meta property="og:locale:alternate" content="${page.locale === "zh" ? "en_US" : "zh_CN"}"><meta property="og:image" content="${ORIGIN}/social-card.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${pick(page.locale, "MalMarket TV 全球电视探索", "MalMarket TV global television explorer")}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${h(meta.title)}"><meta name="twitter:description" content="${h(meta.description)}"><meta name="twitter:image" content="${ORIGIN}/social-card.png">${seoAssets.css}<script type="application/ld+json">${json(structured)}</script>${page.kind === "home" ? seoAssets.scripts : ""}`;
  return `<!doctype html><html lang="${page.locale === "zh" ? "zh-Hans" : "en"}"><head>${head}</head><body class="seo-page"><a class="skip-link" href="#content">${pick(page.locale, "跳到正文", "Skip to content")}</a>${header(page)}<main id="content" class="seo-shell">${page.kind === "home" ? home(page) : page.kind === "country" ? countryContent(page) : channelContent(page)}</main>${footer(page.locale)}</body></html>`;
}
for (const page of pages) {
  const target = path.join("dist", page.path, "index.html");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, document(page));
}
// Keep the existing client application at an explicit, non-indexable viewing route.
for (const [route, title] of [
  ["watch", "MalMarket TV｜地球与播放器"],
  ["admin", "MalMarket TV｜维护后台"],
]) {
  await mkdir("dist/" + route, { recursive: true });
  await writeFile(
    "dist/" + route + "/index.html",
    `<!doctype html><html lang="zh-Hans"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0b1117"><title>${title}</title><meta name="robots" content="noindex,follow"><link rel="canonical" href="${ORIGIN}/${route}/">${appAssets.css}${appAssets.scripts}</head><body><div id="root"><p>正在加载播放器。Loading the player.</p></div></body></html>`,
  );
}
await writeFile(
  "dist/index.html",
  document(pages.find((p) => p.path === "/zh/")),
);
await writeFile(
  "dist/404.html",
  `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>404 · Page not found | MalMarket TV</title><meta name="robots" content="noindex,follow">${seoAssets.css}</head><body class="seo-page"><main class="seo-shell seo-not-found"><h1>404</h1><p>页面不存在或已移除。This page was not found.</p>${href("/zh/", "中文首页", "seo-button")} ${href("/en/", "English home", "seo-secondary")}</main></body></html>`,
);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${pages
  .map(
    (page) =>
      `<url><loc>${ORIGIN + page.path}</loc>${Object.entries(
        alternatePaths(page),
      )
        .map(
          ([lang, p]) =>
            `<xhtml:link rel="alternate" hreflang="${lang}" href="${ORIGIN + p}"/>`,
        )
        .join("")}</url>`,
  )
  .join("")}</urlset>`;
await writeFile("dist/sitemap.xml", sitemap);
await writeFile(
  "dist/robots.txt",
  `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`,
);
await writeFile(
  "dist/_headers",
  "/watch/*\n  X-Robots-Tag: noindex, follow\n/admin/*\n  X-Robots-Tag: noindex, follow\n",
);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><radialGradient id="g"><stop stop-color="#356958"/><stop offset="1" stop-color="#102b27"/></radialGradient></defs><rect width="1200" height="630" fill="#0b1117"/><circle cx="950" cy="315" r="250" fill="url(#g)" stroke="#72c6a4" stroke-width="2"/><g fill="none" stroke="#659c87" stroke-width="2" opacity=".6"><ellipse cx="950" cy="315" rx="125" ry="250"/><ellipse cx="950" cy="315" rx="220" ry="250"/><ellipse cx="950" cy="315" rx="250" ry="80"/><ellipse cx="950" cy="315" rx="250" ry="170"/></g><circle cx="830" cy="220" r="9" fill="#b9ffe1"/><circle cx="1040" cy="400" r="9" fill="#b9ffe1"/><text x="80" y="265" font-family="sans-serif" font-size="78" font-weight="600" fill="#eef6f0">MalMarket TV</text><text x="84" y="345" font-family="sans-serif" font-size="28" fill="#b1c6b8">Explore television around the world.</text><text x="84" y="500" font-family="sans-serif" font-size="24" fill="#a2f3cf">tv.malmarket.app</text></svg>`;
await sharp(Buffer.from(svg)).png().toFile("dist/social-card.png");
await mkdir(".seo-build", { recursive: true });
await writeFile(
  ".seo-build/report.json",
  JSON.stringify(
    {
      origin: ORIGIN,
      pages: pages.map((p) => ({
        path: p.path,
        kind: p.kind,
        locale: p.locale,
      })),
      countries: catalog.countries.length,
      channels: catalog.channels.length,
      profiles: profiles.length,
      examples: profiles
        .filter((c) =>
          ["France24.fr", "NHKWorldJapan.jp", "3ABNEnglish.us"].includes(c.id),
        )
        .map((c) => ({
          id: c.id,
          zh: channelPath(c.id, "zh"),
          en: channelPath(c.id, "en"),
        })),
    },
    null,
    2,
  ),
);
console.log(
  `Prerendered ${pages.length} pages: 2 homes, ${catalog.countries.length * 2} country pages, ${profiles.length * 2} channel profiles. No empty pages.`,
);

await unlink("dist/seo.html");
