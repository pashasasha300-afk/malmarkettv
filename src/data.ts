import { createClient } from "@supabase/supabase-js";
export const db =
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
      )
    : null;
export type Stream = {
  id: string;
  url: string;
  labels: string[];
  server_status: string;
  checked_at: string | null;
  browser_status?: string;
};
export type Channel = {
  id: string;
  name: string;
  country: string;
  languages: string[];
  categories: string[];
  logo: string | null;
  website: string | null;
  updated_at: string;
  streams: Stream[];
};
export type Country = {
  code: string;
  name: string;
  lat: number;
  lng: number;
  count: number;
};
export function localRead(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
