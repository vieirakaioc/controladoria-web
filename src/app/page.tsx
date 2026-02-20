"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AppHome() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (!u) {
        router.replace("/login");
        return;
      }

      let pid = "";
      try {
        pid = localStorage.getItem("ctx.plannerId") || "";
      } catch {}

      if (pid) router.replace(`/tasks?planner=${encodeURIComponent(pid)}`);
      else router.replace("/spaces");
    })();
  }, [router]);

  return <div className="text-sm opacity-70">Loading...</div>;
}
