import test from "node:test";
import assert from "node:assert/strict";
import { normalize } from "../scripts/normalize.mjs";
import { publicIP, safeProbe } from "../scripts/safe-probe.mjs";
test("reject private/reserved/mapped IPs", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.1.1",
    "192.168.1.2",
    "169.254.169.254",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "224.0.0.1",
  ])
    assert.equal(publicIP(ip), false, ip);
  assert.equal(publicIP("8.8.8.8"), true);
});
test("validate DNS before connection, mixed addresses rejected", async () => {
  await assert.rejects(
    safeProbe("https://example.com", async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
    /Blocked/,
  );
  for (const url of [
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "https://example.com:8080",
  ])
    await assert.rejects(safeProbe(url), /Blocked/);
});
test("dedupe and reject adult, blocked, HTTP, request-header and unknown sources", () => {
  const c = ["a", "b", "c"].map((id) => ({
    id,
    name: id,
    country: "US",
    is_nsfw: id === "b",
  }));
  const s = [
    { channel: "a", url: "https://example.com/a.m3u8" },
    { channel: "a", url: "https://example.com/a.m3u8" },
    { channel: "b", url: "https://example.com/b.m3u8" },
    { channel: "c", url: "https://example.com/c.m3u8" },
    { channel: "x", url: "https://example.com/x.m3u8" },
    { channel: "a", url: "http://example.com/x.m3u8" },
    {
      channel: "a",
      url: "https://example.com/h.m3u8",
      referrer: "https://site.com",
    },
  ];
  const r = normalize(
    c,
    s,
    [{ channel: "a", languages: ["eng"] }],
    [],
    [{ channel: "c" }],
    "now",
  );
  assert.equal(r.channels.length, 1);
  assert.equal(r.streams.length, 1);
  assert.deepEqual(r.channels[0].languages, ["eng"]);
  assert.equal(r.streams[0].disabled, undefined);
});
