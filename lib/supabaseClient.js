// lib/supabaseClient.js
import { createClient } from "@supabase/supabase-js";

let _client = null;

export function getSupabaseClient() {
  if (_client) return _client;
  _client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 3 } },
    }
  );
  return _client;
}
