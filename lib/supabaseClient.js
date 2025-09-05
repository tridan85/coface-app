"use client";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

/**
 * Client Supabase per i componenti client.
 * Legge URL e ANON KEY dalle env NEXT_PUBLIC_* (Vercel/.env.local)
 * e mantiene i cookie di sessione per il middleware.
 */
export const supabase = createClientComponentClient();

