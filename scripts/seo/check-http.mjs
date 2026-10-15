import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { ORIGIN } from "./model.mjs";
const base = (process.argv[2] || ORIGIN).replace(/\/$/, "");
const results = [];
async function request(path, init) {
  return fetch(base + path, {
    ...init,
    redirect: "manual",
    signal: AbortSignal.timeout(25000),
  });
}
for (const headers of [{}, { "Sec-Fetch-Mode": "navigate" }]) {
  let r = await request("/", { headers });
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), base + "/zh/");
  r = await request("/?channel=France24.fr", { headers });
  assert.equal(r.status, 302);
  assert.equal(r.headers.get("location"), base + "/watch/?channel=France24.fr");
}
const paths = [
  "/zh/",
  "/en/",
  "/zh/countries/us/",
  "/en/countries/jp/",
  "/zh/channels/france24-fr-ab74f92c11/",
  "/en/channels/france24-fr-ab74f92c11/",
];
for (const path of paths) {
  const r = await request(path);
  assert.equal(r.status, 200, path);
  const dom = new JSDOM(await r.text());
  const doc = dom.window.document;
  assert.ok(doc.title.length > 5);
  assert.equal(
    doc.querySelector('link[rel="canonical"]')?.getAttribute("href"),
    ORIGIN + path,
  );
  assert.equal(doc.querySelectorAll("link[hreflang]").length, 3);
  assert.ok(doc.querySelector("main")?.textContent.trim().length > 100);
  assert.ok(doc.querySelectorAll("main a[href]").length > 2);
  assert.ok(
    doc
      .querySelector('meta[property="og:image"]')
      ?.getAttribute("content")
      .endsWith("/social-card.png"),
  );
  results.push({
    path,
    status: r.status,
    title: doc.title,
    lang: doc.documentElement.lang,
    ordinaryLinks: doc.querySelectorAll("a[href]").length,
    bodyWithoutJavaScript: true,
  });
  dom.window.close();
}
for (const path of [
  "/a-page-that-does-not-exist/",
  "/zh/countries/zz/",
  "/zh/channels/not-a-channel/",
  "/seo",
]) {
  const r = await request(path, { headers: { "Sec-Fetch-Mode": "navigate" } });
  assert.equal(r.status, 404, path);
  assert.ok((await r.text()).includes("noindex"));
  results.push({ path, status: 404 });
}
let r = await request("/watch/?channel=France24.fr");
assert.equal(r.status, 200);
const watch = await r.text();
assert.ok(watch.includes('id="root"') && watch.includes("/assets/app-"));
assert.ok(watch.includes("noindex"));
r = await request("/admin/");
assert.equal(r.status, 200);
assert.ok((await r.text()).includes("noindex"));
r = await request("/sitemap.xml");
assert.equal(r.status, 200);
const xml = new JSDOM(await r.text(), { contentType: "text/xml" });
const urls = xml.window.document.getElementsByTagName("loc").length;
assert.ok(urls > 100);
xml.window.close();
r = await request("/robots.txt");
assert.equal(r.status, 200);
assert.ok((await r.text()).includes("Sitemap: " + ORIGIN + "/sitemap.xml"));
r = await request("/social-card.png");
assert.equal(r.status, 200);
assert.match(r.headers.get("content-type"), /image\/png/);
const report = {
  base,
  checkedAt: new Date().toISOString(),
  sitemapUrls: urls,
  oldLinks: "preserved via 302",
  viewer: "200, noindex, existing app entry retained",
  results,
};
if (process.argv[3])
  await writeFile(process.argv[3], JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
