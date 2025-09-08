"use client";

import React, { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";

export default function LoginPage() {
  const supabase = createClientComponentClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Login con email+password
  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    // 🔧 IMPORTANTE in produzione: hard reload per far passare dal middleware
    // e sincronizzare i cookie di sessione (sb-access-token/sb-refresh-token).
    window.location.href = "/";
  }

  // Login con Magic Link
  async function onMagicLink() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // reindirizza all'origine corrente (localhost in dev, vercel in prod)
        emailRedirectTo:
          typeof window !== "undefined" ? `${window.location.origin}/` : undefined,
      },
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("Ti abbiamo inviato un link di accesso. Controlla la tua email.");
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accedi</CardTitle>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Accesso..." : "Accedi"}
            </Button>
          </form>

          <div className="mt-4 space-y-2">
            <Button
              variant="secondary"
              onClick={onMagicLink}
              disabled={loading || !email}
              className="w-full"
            >
              Invia Magic Link
            </Button>

            {message && <p className="text-sm text-center mt-2">{message}</p>}

            <p className="text-xs text-center opacity-60">
              coface-app – accesso protetto
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
