"use client";

import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Button } from "@/components/button";

export default function LogoutButton({ className = "" }) {
  const router = useRouter();
  const supabase = createClientComponentClient();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(`Logout error: ${error.message}`);
      return;
    }
    router.replace("/login");
    // Se vuoi forzare un hard refresh usa:
    // window.location.href = "/login";
  };

  return (
    <Button onClick={handleLogout} variant="outline" className={className}>
      Esci
    </Button>
  );
}
