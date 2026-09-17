import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
<<<<<<< HEAD
// Supabase's current API key system replaced the legacy "anon" key with a
// "publishable" key (looks like sb_publishable_...). It's a drop-in
// replacement for the same createClient() argument — same permissions
// model (anon/RLS-scoped), just a new name and format. No other code here
// needs to change for the new key type.
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    "Supabase env vars missing. Expected VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env",
  );
}

export const supabase = createClient(url, publishableKey, {
  auth: { persistSession: true, autoRefreshToken: true },
=======
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Supabase env vars missing. Expected VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
>>>>>>> bf4d284f8dfaffbf2178ff5d6a519c85c65e128e
});

/** Tables that store TokenTrack operational data. */
export type TTTable = "tokentrack_platforms" | "tokentrack_entries" | "tokentrack_payouts";
