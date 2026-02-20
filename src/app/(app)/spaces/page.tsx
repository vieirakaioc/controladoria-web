"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Planner = { id: string; name: string; active: boolean };

export default function SpacesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [planners, setPlanners] = useState<Planner[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setErr("");
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      const u = data.session?.user;
      if (!u) {
        router.replace("/login");
        return;
      }

      const { data: rows, error } = await supabase
        .from("planners")
        .select("id,name,active")
        .eq("user_id", u.id)
        .eq("active", true)
        .order("name", { ascending: true });

      if (error) setErr(error.message);
      setPlanners((rows as any) ?? []);
      setLoading(false);
    })();
  }, [router]);

  function pick(p: Planner) {
    try {
      localStorage.setItem("ctx.plannerId", p.id);
      localStorage.setItem("ctx.plannerName", p.name);
    } catch {}
    router.push(`/tasks?planner=${encodeURIComponent(p.id)}`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Choose a scenario</h1>
        <div className="text-sm opacity-70">
          Select which module (Planner Name) you want to work on.
        </div>
      </div>

      {err ? (
        <div className="text-sm text-red-600">{err}</div>
      ) : null}

      {loading ? (
        <div className="text-sm opacity-70">Loading...</div>
      ) : planners.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No scenarios found</CardTitle>
          </CardHeader>
          <CardContent className="text-sm opacity-80 space-y-3">
            <div>
              Import your Excel (ListBox sheet) to populate planners automatically.
            </div>
            <Button variant="outline" onClick={() => router.push("/import")}>
              Go to Import
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {planners.map((p) => (
            <Card key={p.id} className="cursor-pointer hover:bg-muted/30" onClick={() => pick(p)}>
              <CardHeader>
                <CardTitle className="text-base">{p.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <Button className="w-full">Open</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
