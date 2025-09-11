"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabaseClient";

export default function SessionGuard({ children }) {
  const router = useRouter();
  const supabase = getSupabaseClient();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    // 1) leggi sessione una volta
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (!session) router.replace("/login");
      setReady(true);
    });

    // 2) ascolta i cambi (login/logout/refresh)
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (!session) router.replace("/login");
    });

    return () => {
      mounted = false;
      sub.subscription?.unsubscribe?.();
    };
  }, [router, supabase]);

  // Evita flicker: mostra children solo dopo il check iniziale
  if (!ready) return null; // o uno spinner
  return children;
}
