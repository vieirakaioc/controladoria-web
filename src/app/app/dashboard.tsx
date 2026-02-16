"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Template = {
  task_id: string | null;
  title: string;
  sector: string | null;
  frequency: string | null;
};

type RunRow = {
  id: string;
  due_date: string | null;
  done_at: string | null;
  status: "open" | "done" | string;
  task_templates?: Template | Template[] | null;
};

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getTpl(t: RunRow["task_templates"]) {
  if (!t) return null;
  return Array.isArray(t) ? t[0] ?? null : t;
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [rows, setRows] = useState<RunRow[]>([]);

  async function load() {
    setErrorMsg("");
    setLoading(true);

    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.user) {
      router.replace("/login");
      return;
    }

    const t0 = todayISO();
    const from = addDays(t0, -30);
    const to = addDays(t0, 30);

    // Puxa um “pacote” de runs (últimos 30 e próximos 30) pra calcular KPIs no client
    const { data, error } = await supabase
      .from("task_runs")
      .select("id,due_date,done_at,status, task_templates(task_id,title,sector,frequency)")
      .gte("due_date", from)
      .lte("due_date", to)
      .order("due_date", { ascending: true });

    if (error) setErrorMsg(error.message);
    setRows((data || []) as any);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const kpis = useMemo(() => {
    const t0 = todayISO();

    let open = 0;
    let dueToday = 0;
    let overdue = 0;
    let done7d = 0;

    const sectorOpen: Record<string, number> = {};
    const overdueTop: Array<{ due: string; title: string; task_id: string }> = [];

    const doneFrom = addDays(t0, -7) + "T00:00:00.000Z";

    for (const r of rows) {
      const due = r.due_date || "";
      const st = r.status;
      const tpl = getTpl(r.task_templates);
      const sector = tpl?.sector || "Sem setor";
      const title = tpl?.title || "-";
      const task_id = tpl?.task_id || "-";

      if (st === "open") {
        open++;
        sectorOpen[sector] = (sectorOpen[sector] || 0) + 1;

        if (due === t0) dueToday++;
        if (due && due < t0) {
          overdue++;
          overdueTop.push({ due, title, task_id });
        }
      }

      if (st === "done" && r.done_at && r.done_at >= doneFrom) {
        done7d++;
      }
    }

    overdueTop.sort((a, b) => (a.due < b.due ? -1 : 1));

    const sectorOpenSorted = Object.entries(sectorOpen)
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count);

    return {
      open,
      dueToday,
      overdue,
      done7d,
      sectorOpenSorted,
      overdueTop: overdueTop.slice(0, 10),
    };
  }, [rows]);

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <div className="text-sm opacity-70">KPIs (last 30d + next 30d)</div>
        </div>
        <Button variant="outline" onClick={() => router.push("/runs")}>
          Go to Runs
        </Button>
      </div>

      {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Open</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{loading ? "…" : kpis.open}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Due Today</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{loading ? "…" : kpis.dueToday}</CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Overdue</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {loading ? "…" : <span className={kpis.overdue ? "text-red-600" : ""}>{kpis.overdue}</span>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Done (7d)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{loading ? "…" : kpis.done7d}</CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Open by sector</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="text-sm opacity-70">Loading...</div>
            ) : kpis.sectorOpenSorted.length === 0 ? (
              <div className="text-sm opacity-70">No open tasks.</div>
            ) : (
              kpis.sectorOpenSorted.slice(0, 12).map((x) => (
                <div key={x.sector} className="flex items-center justify-between">
                  <div className="text-sm">{x.sector}</div>
                  <Badge variant="secondary">{x.count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Overdue (top 10)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              <div className="text-sm opacity-70">Loading...</div>
            ) : kpis.overdueTop.length === 0 ? (
              <div className="text-sm opacity-70">No overdue tasks. Nice.</div>
            ) : (
              kpis.overdueTop.map((x, i) => (
                <div key={i} className="flex items-start justify-between gap-3">
                  <div className="text-sm">
                    <div className="font-mono text-xs opacity-70">{x.task_id}</div>
                    <div className="line-clamp-2">{x.title}</div>
                  </div>
                  <Badge variant="destructive">{x.due}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
