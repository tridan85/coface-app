"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/button";

export default function LogoutButton({ className = "" }) {
  const router = useRouter();

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(error.message);
      return;
    }
    router.replace("/login");
  }

  return (
    <Button onClick={handleLogout} variant="outline" className={className}>
      Esci
    </Button>
  );
}
