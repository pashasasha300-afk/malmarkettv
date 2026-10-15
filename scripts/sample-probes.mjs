import { writeFile } from "node:fs/promises";
import { api } from "./common.mjs";
import { normalize } from "./normalize.mjs";
import { safeProbe } from "./safe-probe.mjs";
const [c, s, f, l, b] = await Promise.all(
  ["channels", "streams", "feeds", "logos", "blocklist"].map(api),
);
const data = normalize(c, s, f, l, b, new Date().toISOString());
const targets = ["FR", "JP", "US", "UK", "BR", "IN"];
const report = [];
for (const country of targets) {
  const channel = data.channels.find(
    (c) => c.country === country && !c.categories.includes("movies"),
  );
  if (!channel) continue;
  const stream = data.streams.find((s) => s.channel_id === channel.id);
  try {
    report.push({
      country,
      channel: channel.name,
      url: stream.url,
      ...(await safeProbe(stream.url)),
      browser_playback: "NOT TESTED",
    });
  } catch (e) {
    report.push({
      country,
      channel: channel.name,
      error: String(e),
      browser_playback: "NOT TESTED",
    });
  }
}
await writeFile("docs/stream-probes.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
