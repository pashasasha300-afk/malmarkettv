import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
const publicConfig = JSON.parse(
  await readFile(new URL("../src/public-config.json", import.meta.url), "utf8"),
);
const url = process.env.VITE_SUPABASE_URL || publicConfig.url;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  (url === publicConfig.url ? publicConfig.publishableKey : "");
if (!url || !key) {
  console.error(
    "Missing public frontend configuration: VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY). Configure Cloudflare build variables, then rebuild.",
  );
  process.exit(1);
}
if (key.startsWith("sb_secret_")) {
  console.error(
    "Refusing a secret key in frontend configuration. Use publishable/anon key.",
  );
  process.exit(1);
}
try {
  const token = JSON.parse(
    Buffer.from(key.split(".")[1] || "", "base64url").toString(),
  );
  if (token.role === "service_role") {
    console.error("Refusing service_role key in frontend configuration.");
    process.exit(1);
  }
} catch {}
const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
  },
});
try {
  const { data: countries, error } = await db.rpc("country_counts");
  if (error) throw error;
  if (!Array.isArray(countries))
    throw Error("country_counts returned an unexpected shape");
  const total = countries.reduce((n, c) => n + Number(c.count), 0);
  console.log(
    JSON.stringify(
      {
        project: new URL(url).hostname,
        countriesWithChannels: countries.filter((c) => Number(c.count) > 0)
          .length,
        channels: total,
      },
      null,
      2,
    ),
  );
  if (!total)
    throw Error(
      "Database connected, but public catalogue is empty. Run the real channel import.",
    );
  for (const country of countries
    .filter((c) => Number(c.count) > 0)
    .slice(0, 3)) {
    const { data, error } = await db.rpc("search_channels", {
      country_code: country.code,
    });
    if (error) throw error;
    if (!data?.length || !data[0].streams?.length)
      throw Error("Missing channel/stream relation for " + country.code);
    console.log(
      JSON.stringify({
        country: country.code,
        firstChannel: data[0].name,
        sourceCount: data[0].streams.length,
        browserPlayback: "not checked by this script",
      }),
    );
  }
  console.log(
    "Public Supabase queries and channel/stream relations verified. Browser playback remains a separate check.",
  );
} catch (e) {
  console.error("Connection check failed:", e.message || String(e));
  process.exitCode = 1;
}
