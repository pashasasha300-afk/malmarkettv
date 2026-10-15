import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
export async function snapshot() {
  const config = JSON.parse(
    await readFile(
      new URL("../../src/public-config.json", import.meta.url),
      "utf8",
    ),
  );
  const url = process.env.VITE_SUPABASE_URL || config.url;
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    (url === config.url ? config.publishableKey : "");
  let publicKey = key?.startsWith("sb_publishable_");
  if (!publicKey) {
    try {
      publicKey =
        JSON.parse(
          Buffer.from((key || "").split(".")[1] || "", "base64url").toString(),
        ).role === "anon";
    } catch {
      publicKey = false;
    }
  }
  if (!publicKey) throw Error("SEO requires a public publishable/anon key");
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(30000) }),
    },
  });
  async function page(table, fields, filter = (q) => q) {
    const rows = [];
    for (let start = 0; ; start += 1000) {
      let result;
      for (let attempt = 0; attempt < 3; attempt++) {
        result = await filter(db.from(table).select(fields).order("id")).range(
          start,
          start + 999,
        );
        if (!result.error) break;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
      if (result.error) throw Error(table + ": " + result.error.message);
      rows.push(...result.data);
      if (result.data.length < 1000) break;
    }
    return rows;
  }
  const [channels, streams, countryResult] = await Promise.all([
    page(
      "channels",
      "id,name,manual_name,country,languages,categories,logo,website",
    ),
    page("streams", "id,channel_id", (q) =>
      q.eq("active", true).eq("disabled", false),
    ),
    db.from("countries").select("code,name,lat,lng").order("code"),
  ]);
  if (countryResult.error) throw countryResult.error;
  const linked = new Set(streams.map((s) => s.channel_id));
  const countries = countryResult.data;
  const codes = new Set(countries.map((c) => c.code));
  const published = channels
    .filter((c) => linked.has(c.id) && codes.has(c.country))
    .map((c) => ({
      id: c.id,
      name: c.manual_name || c.name,
      country: c.country,
      languages: [...new Set(c.languages)].sort(),
      categories: [...new Set(c.categories)].sort(),
      logo: c.logo,
      website: c.website,
    }))
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
  if (published.length < 1000)
    throw Error(
      "SEO catalogue unexpectedly empty/small: refusing to generate pages",
    );
  const data = {
    source: "Supabase public RLS catalogue, imported from iptv-org",
    countries: countries.filter((c) =>
      published.some((ch) => ch.country === c.code),
    ),
    channels: published,
  };
  await mkdir(new URL("../../seo/", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../../seo/catalog.json", import.meta.url),
    JSON.stringify(data, null, 2) + "\n",
  );
  console.log(
    `SEO snapshot: ${published.length} channels across ${data.countries.length} countries/regions`,
  );
  return data;
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
)
  await snapshot();
