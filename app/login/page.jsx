"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router]);

  async function handleLogin() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    setLoading(false);
    if (error) alert(error.message);
    else router.replace("/");
  }

  async function handleMagic() {
    if (!email) return alert("Inserisci l'email");
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo:
          typeof window !== "undefined" ? window.location.origin : "https://coface-app.vercel.app",
      },
    });
    setLoading(false);
    if (error) alert(error.message);
    else alert("Ti abbiamo inviato un link di accesso.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 border rounded-2xl p-6 shadow-sm bg-white">
        <h1 className="text-xl font-semibold">Accedi</h1>
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Label>Password</Label>
          <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} autoComplete="current-password" />
        </div>
        <Button onClick={handleLogin} disabled={loading} className="w-full">Accedi</Button>
        <Button onClick={handleMagic} variant="secondary" disabled={loading} className="w-full">Invia Magic Link</Button>
      </div>
    </div>
  );
}
