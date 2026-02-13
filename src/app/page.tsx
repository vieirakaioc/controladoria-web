"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/tasks");
      else router.replace("/login");
    });
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="text-sm opacity-70">Loading...</div>
    </main>
  );
}
