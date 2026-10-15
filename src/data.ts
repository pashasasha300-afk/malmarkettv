import { createClient } from "@supabase/supabase-js";
import publicConfig from "./public-config.json";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || publicConfig.url;
const supabasePublicKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  (supabaseUrl === publicConfig.url ? publicConfig.publishableKey : "");
export const db =
  supabaseUrl && supabasePublicKey
    ? createClient(supabaseUrl, supabasePublicKey)
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
