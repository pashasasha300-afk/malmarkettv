import { createHash } from "node:crypto";
export function normalize(channels, streams, feeds, logos, blocklist, now) {
  const blocked = new Set(blocklist.map((x) => x.channel)),
    meta = new Map(
      channels
        .filter((c) => !c.is_nsfw && !c.closed && !blocked.has(c.id))
        .map((c) => [c.id, c]),
    ),
    languages = new Map(),
    logo = new Map();
  for (const f of feeds) {
    if (!languages.has(f.channel)) languages.set(f.channel, new Set());
    for (const l of f.languages || []) languages.get(f.channel).add(l);
  }
  for (const l of logos)
    if (l.in_use && l.url?.startsWith("https://") && !logo.has(l.channel))
      logo.set(l.channel, l.url);
  const sources = new Map(),
    used = new Set();
  for (const s of streams) {
    if (!meta.has(s.channel) || s.referrer || s.user_agent) continue;
    let u;
    try {
      u = new URL(s.url);
    } catch {
      continue;
    }
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.hash ||
      !/\.m3u8(?:$|\?)/i.test(u.href)
    )
      continue;
    const id = createHash("sha256")
      .update(s.channel + "\n" + u.href)
      .digest("hex");
    sources.set(id, {
      id,
      channel_id: s.channel,
      url: u.href,
      labels: s.labels || [],
      source: "https://iptv-org.github.io/api/streams.json",
      active: true,
      last_seen_at: now,
    });
    used.add(s.channel);
  }
  return {
    channels: [...used].map((id) => {
      const c = meta.get(id);
      return {
        id,
        name: c.name,
        country: c.country,
        languages: [...(languages.get(id) || [])],
        categories: c.categories || [],
        logo: logo.get(id) || null,
        website: /^https?:\/\//.test(c.website) ? c.website : null,
        is_nsfw: false,
        source: "https://iptv-org.github.io/api/channels.json",
        updated_at: now,
      };
    }),
    streams: [...sources.values()],
  };
}
