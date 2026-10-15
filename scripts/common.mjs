import { createClient } from "@supabase/supabase-js";
export function serverDB() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    throw Error("Missing server-only Supabase configuration");
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function retry(fn) {
  let e;
  for (let i = 0; i < 3; i++)
    try {
      return await fn();
    } catch (x) {
      e = x;
      if (i < 2) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  throw e;
}
export async function checked(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
export async function api(name) {
  return retry(async () => {
    const r = await fetch(`https://iptv-org.github.io/api/${name}.json`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw Error(`Upstream ${name}: ${r.status}`);
    const a = await r.json();
    if (!Array.isArray(a) || !a.length) throw Error("Invalid " + name);
    return a;
  });
}
