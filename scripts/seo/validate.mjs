import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import path from "node:path";
const report = JSON.parse(await readFile(".seo-build/report.json", "utf8"));
const published = new Set(report.pages.map((p) => p.path));
const titles = new Set();
let links = 0;
for (const page of report.pages) {
  const html = await readFile(
    path.join("dist", page.path, "index.html"),
    "utf8",
  );
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.ok(title, `Missing title ${page.path}`);
  assert.ok(!titles.has(title), `Duplicate title ${title}`);
  titles.add(title);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, page.path);
  assert.ok(
    html.includes(`rel="canonical" href="${report.origin + page.path}"`),
    page.path,
  );
  assert.ok(html.includes('name="description" content="'), page.path);
  assert.ok(html.includes('property="og:image"'), page.path);
  for (const [, lang, url] of html.matchAll(
    /rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g,
  )) {
    const pathname = new URL(url).pathname;
    assert.ok(published.has(pathname), `Missing alternate ${url}`);
    const target = await readFile(
      path.join("dist", pathname, "index.html"),
      "utf8",
    );
    assert.ok(
      target.includes(`href="${report.origin + page.path}"`),
      `Nonreciprocal hreflang ${page.path}`,
    );
  }
  for (const [, raw] of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    const url = new URL(
      raw.replaceAll("&amp;", "&"),
      report.origin + page.path,
    );
    if (url.origin !== report.origin) continue;
    if (url.pathname === "/" || url.pathname === "/watch/") continue;
    if (url.pathname === "/country-locations-LICENSE.txt") continue;
    assert.ok(
      published.has(url.pathname),
      `Broken internal link ${url.href} on ${page.path}`,
    );
    links++;
  }
  for (const [, schema] of html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
  ))
    JSON.parse(schema);
  assert.ok(
    !html.includes("AggregateRating") && !html.includes("VideoObject"),
    page.path,
  );
}
const sitemap = await readFile("dist/sitemap.xml", "utf8");
assert.equal((sitemap.match(/<loc>/g) || []).length, published.size);
assert.ok(!sitemap.includes("/watch/") && !sitemap.includes("/admin/"));
const notFound = await readFile("dist/404.html", "utf8");
assert.ok(notFound.includes("noindex"));
await access("dist/social-card.png");
console.log(
  `SEO validation: ${published.size} pages, ${titles.size} unique titles, ${links} valid ordinary internal links; canonical/hreflang/JSON-LD/sitemap passed.`,
);

const watch = await readFile("dist/watch/index.html", "utf8");
assert.ok(
  watch.includes('id="root"') && watch.includes("/assets/app-"),
  "Viewing app entry must be preserved",
);
