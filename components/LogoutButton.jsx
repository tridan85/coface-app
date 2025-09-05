"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/button";

/**
 * LogoutButton
 * - variant: "default" | "secondary" | "outline" | "ghost" | ...
 * - size: "sm" | "md" | "lg" (se supportato dal tuo <Button>)
 * - className: classi Tailwind extra
 * - label: testo del bottone
 */
export default function LogoutButton({
  variant = "outline",
  size = "sm",
  className = "",
  label = "Esci",
}) {
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
    <Button variant={variant} size={size} className={className} onClick={handleLogout}>
      {label}
    </Button>
  );
}
