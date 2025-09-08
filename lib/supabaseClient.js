// lib/supabaseClient.js
"use client";

// Unico client per i component client-side, basato su auth-helpers.
// Così legge/scrive i cookie di sessione e allega l'Authorization alle chiamate.
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

let _client;
export function getSupabaseClient() {
  if (!_client) _client = createClientComponentClient();
  return _client;
}
