import { readFile } from "node:fs/promises";
import { api, serverDB, checked, retry } from "./common.mjs";
import { normalize } from "./normalize.mjs";
const now = new Date().toISOString();
let db, log;
try {
  if (!process.argv.includes("--dry-run")) {
    db = serverDB();
    log = await checked(
      db.from("sync_logs").insert({ status: "running" }).select("id").single(),
    );
  }
  const [channels, streams, feeds, logos, blocklist, countries] =
    await Promise.all(
      ["channels", "streams", "feeds", "logos", "blocklist", "countries"].map(
        api,
      ),
    );
  const result = normalize(channels, streams, feeds, logos, blocklist, now);
  if (result.channels.length < 1000 || result.streams.length < 1000)
    throw Error("Suspicious upstream shrink");
  const coordinates = JSON.parse(
    (
      await readFile(
        new URL("../public/country-locations.json", import.meta.url),
        "utf8",
      )
    ).replace(/^\uFEFF/, ""),
  );
  const countryRows = countries
    .filter((c) => coordinates[c.code])
    .map((c) => ({
      code: c.code,
      name: c.name,
      lat: coordinates[c.code][0],
      lng: coordinates[c.code][1],
    }));
  const known = new Set(countryRows.map((c) => c.code));
  result.channels = result.channels.filter((c) => known.has(c.country));
  const ids = new Set(result.channels.map((c) => c.id));
  result.streams = result.streams.filter((s) => ids.has(s.channel_id));
  if (process.argv.includes("--dry-run")) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run; no database changes",
          channels: result.channels.length,
          streams: result.streams.length,
          countries: new Set(result.channels.map((c) => c.country)).size,
          sample: result.channels.slice(0, 2),
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  for (const [table, rows] of [
    ["countries", countryRows],
    ["channels", result.channels],
    ["streams", result.streams],
  ])
    for (let i = 0; i < rows.length; i += 300)
      await retry(() => checked(db.from(table).upsert(rows.slice(i, i + 300))));
  await checked(
    db
      .from("streams")
      .update({ active: false })
      .eq("source", "https://iptv-org.github.io/api/streams.json")
      .lt("last_seen_at", now),
  );
  await checked(
    db
      .from("sync_logs")
      .update({
        status: "success",
        finished_at: new Date().toISOString(),
        details: {
          channels: result.channels.length,
          streams: result.streams.length,
        },
      })
      .eq("id", log.id),
  );
  console.log("Synced", result.channels.length, result.streams.length);
} catch (e) {
  if (db && log)
    await db
      .from("sync_logs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        details: { error: String(e) },
      })
      .eq("id", log.id);
  console.error(String(e));
  process.exitCode = 1;
}
