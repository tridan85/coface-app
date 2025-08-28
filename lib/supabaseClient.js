import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://omwqrdaftuoldbenfqzd.supabase.co"; // <- nessuno spazio
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9td3FyZGFmdHVvbGRiZW5mcXpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYyODExMDUsImV4cCI6MjA3MTg1NzEwNX0.s5_04Wl0_Z5DHQRy99AkxXprCk2MOB3MX1nLa5Voelc"; // <- nessuno spazio né newline

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
