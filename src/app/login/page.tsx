"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"none" | "signin" | "signup">("none");
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    // Se já estiver logado, manda pro /tasks
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/tasks");
    });
  }, [router]);

  async function signIn() {
    setMsg("");
    setLoading("signin");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading("none");
    if (error) return setMsg(error.message);
    router.replace("/tasks");
  }

  async function signUp() {
    setMsg("");
    setLoading("signup");
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading("none");
    if (error) return setMsg(error.message);
    setMsg("User created ✅ Now click Sign in.");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Controladoria — Login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Email</div>
            <Input
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Password</div>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {msg ? <div className="text-sm opacity-80">{msg}</div> : null}

          <div className="flex gap-2">
            <Button className="flex-1" onClick={signIn} disabled={loading !== "none"}>
              {loading === "signin" ? "Signing in..." : "Sign in"}
            </Button>

            <Button
              className="flex-1"
              variant="outline"
              onClick={signUp}
              disabled={loading !== "none"}
            >
              {loading === "signup" ? "Creating..." : "Sign up"}
            </Button>
          </div>

          <div className="text-xs opacity-60">
            Tip: se o Supabase estiver com confirmação de email ligada, você vai precisar confirmar o
            email antes de logar.
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
