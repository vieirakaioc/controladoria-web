"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

function guessNameFromEmail(email: string) {
  const s = (email || "").trim();
  if (!s.includes("@")) return s || "User";
  const left = s.split("@")[0] || "User";
  // troca . _ - por espaço e dá um “title case” simples
  return left
    .replace(/[._-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function LoginPage() {
  const router = useRouter();

  const DEFAULT_WORKSPACE_ID = (process.env.NEXT_PUBLIC_DEFAULT_WORKSPACE_ID || "").trim();

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

  async function bootstrapUser(opts: { email: string }) {
    if (!DEFAULT_WORKSPACE_ID) {
      throw new Error("Missing NEXT_PUBLIC_DEFAULT_WORKSPACE_ID (set it in env).");
    }

    const { data: sessData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) throw sessErr;
    const u = sessData.session?.user;
    if (!u) return; // sem sessão (ex.: email confirmation)

    // 1) workspace_members (se não tiver, cria)
    const { data: mem, error: memErr } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", u.id)
      .limit(1)
      .maybeSingle();

    if (memErr) throw memErr;

    if (!mem?.workspace_id) {
      const { error: insErr } = await supabase.from("workspace_members").insert({
        workspace_id: DEFAULT_WORKSPACE_ID,
        user_id: u.id,
        role: "member", // ou "admin" se quiser
      });
      if (insErr) throw insErr;
    }

    // 2) people (upsert)
    const displayName = guessNameFromEmail(opts.email);

    const { error: pplErr } = await supabase
      .from("people")
      .upsert(
        {
          workspace_id: DEFAULT_WORKSPACE_ID,
          user_id: u.id,
          name: displayName,
          email: opts.email.trim().toLowerCase(),
          active: true,
        },
        { onConflict: "workspace_id,email" }
      );

    if (pplErr) throw pplErr;
  }

  async function signIn() {
    try {
      setMsg("");
      setLoading("signin");

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // garante que ele existe no workspace + people
      await bootstrapUser({ email });

      router.replace("/tasks");
    } catch (e: any) {
      setMsg(e?.message || "Erro ao logar.");
    } finally {
      setLoading("none");
    }
  }

  async function signUp() {
    try {
      setMsg("");
      setLoading("signup");

      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      // Se o projeto NÃO exige confirmação de email, já vem user e sessão.
      // Se exige confirmação, não vai ter sessão ainda — aí o bootstrap roda no primeiro sign-in.
      if (data?.user) {
        try {
          await bootstrapUser({ email });
          setMsg("User created ✅ Added to workspace/people. Now click Sign in.");
        } catch (e: any) {
          // não bloqueia o signup se o bootstrap falhar (muitas vezes é RLS/env)
          setMsg(`User created ✅ BUT bootstrap failed: ${e?.message || "unknown"}. Now click Sign in.`);
        }
      } else {
        setMsg("User created ✅ Now confirm email (if required) then click Sign in.");
      }
    } catch (e: any) {
      setMsg(e?.message || "Erro ao criar usuário.");
    } finally {
      setLoading("none");
    }
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

          {msg ? <div className="text-sm opacity-80 whitespace-pre-wrap">{msg}</div> : null}

          <div className="flex gap-2">
            <Button className="flex-1" onClick={signIn} disabled={loading !== "none"}>
              {loading === "signin" ? "Signing in..." : "Sign in"}
            </Button>

            <Button className="flex-1" variant="outline" onClick={signUp} disabled={loading !== "none"}>
              {loading === "signup" ? "Creating..." : "Sign up"}
            </Button>
          </div>

          <div className="text-xs opacity-60">
            Tip: se o Supabase estiver com confirmação de email ligada, você vai precisar confirmar o email antes de logar.
          </div>
        </CardContent>
      </Card>
    </main>
  );
}