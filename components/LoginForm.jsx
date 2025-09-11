"use client";

import React from "react";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Button } from "@/components/button";

export default function LoginForm() {
  const supabase = getSupabaseClient();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState("");
  const [cooldown, setCooldown] = React.useState(0); // per il magic link

  // timer per il cooldown (mostra secondi residui)
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  async function handlePasswordLogin(e) {
    e.preventDefault();
    if (pending) return;         // evita doppi submit
    setPending(true);
    setError("");

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        // 429 = rate limit
        if (error.status === 429) setError("Troppe richieste. Riprova tra poco.");
        else setError(error.message || "Accesso non riuscito.");
        return;
      }
      // ok -> vai alla dashboard
      window.location.href = "/";
    } finally {
      setPending(false);
    }
  }

  async function handleMagicLink() {
    if (pending || cooldown > 0) return;
    setPending(true);
    setError("");

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) {
        if (error.status === 429) setError("Hai richiesto troppi link. Attendi un momento.");
        else setError(error.message || "Impossibile inviare il link.");
        return;
      }
      // imposta un cooldown di 60s per evitare flood
      setCooldown(60);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handlePasswordLogin} className="space-y-3">
      <div>
        <Label>Email</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div>
        <Label>Password</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Accesso in corso…" : "Accedi"}
      </Button>

      <Button
        type="button"
        variant="secondary"
        onClick={handleMagicLink}
        disabled={pending || cooldown > 0 || !email}
        className="w-full"
        title={cooldown > 0 ? `Riprova tra ${cooldown}s` : "Invia un link via email"}
      >
        {cooldown > 0 ? `Invia Magic Link (${cooldown}s)` : "Invia Magic Link"}
      </Button>
    </form>
  );
}
