import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPages,
  selectProfiles,
  channelPath,
  alternatePaths,
  escape,
  json,
  safeWebsite,
  metadata,
} from "../scripts/seo/model.mjs";
import worker from "../worker/index.js";
const c = {
  id: "France24.fr",
  name: "France 24",
  country: "FR",
  languages: ["fra"],
  categories: ["news"],
  website: "https://www.france24.com/",
  logo: null,
};
test("SEO excludes empty countries and channel profiles without real metadata", () => {
  const catalogue = {
    countries: [{ code: "FR" }, { code: "ZZ" }],
    channels: [
      c,
      { ...c, id: "NoWebsite.fr", website: null },
      { ...c, id: "NoLanguage.fr", languages: [] },
    ],
  };
  const result = buildPages(catalogue);
  assert.equal(result.pages.filter((p) => p.kind === "country").length, 2);
  assert.equal(result.pages.filter((p) => p.kind === "channel").length, 2);
  assert.equal(result.profiles[0].id, c.id);
  assert.ok(!result.pages.some((p) => p.path.includes("/zz/")));
});
test("Channel URLs remain stable through display-name edits and are safe path segments", () => {
  const a = channelPath(c.id, "en");
  assert.equal(a, channelPath({ ...c, name: "Changed display name" }.id, "en"));
  assert.notEqual(channelPath("A/B.fr", "en"), channelPath("A-B.fr", "en"));
  assert.match(
    channelPath("../escape.fr", "zh"),
    /^\/zh\/channels\/[a-z0-9-]+\/$/,
  );
});
test("Every translated page has a self alternate, a reciprocal locale path and x-default", () => {
  const { pages } = buildPages({ countries: [{ code: "FR" }], channels: [c] });
  for (const p of pages) {
    const alt = alternatePaths(p);
    assert.equal(alt[p.locale === "zh" ? "zh-Hans" : "en"], p.path);
    assert.ok(pages.some((x) => x.path === alt.en));
    assert.ok(pages.some((x) => x.path === alt["zh-Hans"]));
    assert.equal(alt["x-default"], alt["zh-Hans"]);
  }
});
test("Selection is bounded and balanced across countries instead of generating every channel", () => {
  const rows = Array.from({ length: 2000 }, (_, i) => ({
    ...c,
    id: "id" + i,
    country: "C" + Math.floor(i / 10),
  }));
  const profiles = selectProfiles(rows);
  assert.equal(profiles.length, 400);
  assert.equal(new Set(profiles.map((c) => c.country)).size, 200);
});
test("Public data is HTML and JSON-script escaped; unsafe website schemes rejected", () => {
  assert.equal(
    escape('<img onerror="x">'),
    "&lt;img onerror=&quot;x&quot;&gt;",
  );
  assert.ok(
    !json({ name: "</script><script>alert(1)</script>" }).includes("</script>"),
  );
  assert.equal(safeWebsite("javascript:alert(1)"), null);
  assert.equal(safeWebsite("https://user:password@example.com"), null);
  assert.equal(safeWebsite(c.website), c.website);
});
test("Metadata describes recorded facts without live availability claims", () => {
  const data = metadata(
    { kind: "channel", locale: "en", channel: c },
    { channels: [c], countries: [{ code: "FR" }] },
  );
  assert.match(data.description, /France/);
  assert.ok(
    !/rated|currently playing|working stream|five.star/i.test(data.description),
  );
});
test("Worker redirects old root watch links without dropping their channel; unknown pages preserve asset 404", async () => {
  let r = await worker.fetch(new Request("https://tv.malmarket.app/"), {});
  assert.equal(r.status, 301);
  assert.equal(r.headers.get("location"), "https://tv.malmarket.app/zh/");
  r = await worker.fetch(
    new Request("https://tv.malmarket.app/?channel=France24.fr"),
    {},
  );
  assert.equal(r.status, 302);
  assert.equal(
    r.headers.get("location"),
    "https://tv.malmarket.app/watch/?channel=France24.fr",
  );
  r = await worker.fetch(
    new Request("https://tv.malmarket.app/no-such-page/"),
    {
      ASSETS: { fetch: async () => new Response("not found", { status: 404 }) },
    },
  );
  assert.equal(r.status, 404);
});

test("Published profile membership is stable when newer entries would sort ahead", () => {
  const stable = { ...c, id: "Stable.fr" };
  const { profiles } = buildPages(
    { countries: [{ code: "FR" }], channels: [c, stable] },
    ["Stable.fr"],
  );
  assert.deepEqual(
    profiles.map((c) => c.id),
    ["Stable.fr"],
  );
});
