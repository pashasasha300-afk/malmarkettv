import { serverDB, checked } from "./common.mjs";
import { safeProbe } from "./safe-probe.mjs";
const db = serverDB();
const rows = await checked(
  db
    .from("streams")
    .select("id,url")
    .eq("active", true)
    .eq("disabled", false)
    .order("checked_at", { ascending: true, nullsFirst: true })
    .limit(100),
);
let cursor = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      let status;
      try {
        const r = await safeProbe(row.url);
        status =
          r.status === 403 || r.status === 451
            ? "restricted"
            : r.status === 404 || r.status === 410
              ? "unavailable"
              : r.status >= 200 && r.status < 300
                ? "http_reachable_browser_unverified"
                : `http_${r.status}`;
      } catch (e) {
        status = String(e).includes("Blocked")
          ? "blocked_target"
          : "network_error";
      }
      await checked(
        db
          .from("streams")
          .update({
            server_status: status,
            checked_at: new Date().toISOString(),
          })
          .eq("id", row.id),
      );
    }
  }),
);
console.log(
  "Checked",
  rows.length,
  "streams; not browser playback verification",
);
