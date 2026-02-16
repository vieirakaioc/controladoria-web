"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

type Run = {
  id: string;
  template_id: string;
  due_date: string | null;
  done_at: string | null;
  status: string;
  task_templates?: {
    task_id: string | null;
    title: string;
    sector: string | null;
    frequency: string | null;
  } | null;
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
function isoToDateEnd(iso: string) {
  return new Date(iso + "T23:59:59");
}
function isoToDateStart(iso: string) {
  return new Date(iso + "T00:00:00");
}

export default function DashboardPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);

  // range default: last 30 days (by due_date)
  const [daysBack, setDaysBack] = useState(30);

  async function load() {
    setErrorMsg("");
    setLoading(true);

    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session?.user) {
      router.replace("/login");
      return;
    }

    const end = todayISO();
    const start = addDays(end, -daysBack);

    const { data, error } = await supabase
      .from("task_runs")
      .select("id,template_id,due_date,done_at,status, task_templates(task_id,title,sector,frequency)")
      .gte("due_date", start)
      .lte("due_date", end)
      .order("due_date", { ascending: true });

    if (error) setErrorMsg(error.message);
    setRuns((data || []) as Run[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysBack]);

  const kpis = useMemo(() => {
    const now = isoToDateStart(todayISO());
    const total = runs.length;
    const done = runs.filter((r) => r.status === "done" || !!r.done_at);
    const open = runs.filter((r) => !(r.status === "done" || !!r.done_at));

    const overdue = open.filter((r) => r.due_date && isoToDateEnd(r.due_date) < now);

    const onTime = done.filter((r) => {
      if (!r.due_date || !r.done_at) return false;
      return new Date(r.done_at) <= isoToDateEnd(r.due_date);
    });

    const onTimeRate = done.length ? Math.round((onTime.length / done.length) * 100) : 0;

    const avgLateDays = (() => {
      const lates = done
        .map((r) => {
          if (!r.due_date || !r.done_at) return 0;
          const lateMs = new Date(r.done_at).getTime() - isoToDateEnd(r.due_date).getTime();
          const lateDays = lateMs > 0 ? Math.ceil(lateMs / (1000 * 60 * 60 * 24)) : 0;
          return lateDays;
        })
        .filter((n) => n > 0);
      if (!lates.length) return 0;
      return Math.round((lates.reduce((a, b) => a + b, 0) / lates.length) * 10) / 10;
    })();

    return {
      total,
      done: done.length,
      open: open.length,
      overdue: overdue.length,
      onTimeRate,
      avgLateDays,
    };
  }, [runs]);

  const bySector = useMemo(() => {
    const map = new Map<string, { sector: string; total: number; done: number; overdue: number }>();
    const now = isoToDateStart(todayISO());

    for (const r of runs) {
      const sector = r.task_templates?.sector || "—";
      if (!map.has(sector)) map.set(sector, { sector, total: 0, done: 0, overdue: 0 });
      const row = map.get(sector)!;

      row.total += 1;
      const isDone = r.status === "done" || !!r.done_at;
      if (isDone) row.done += 1;

      const isOpen = !isDone;
      if (isOpen && r.due_date && isoToDateEnd(r.due_date) < now) row.overdue += 1;
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [runs]);

  const dailyDoneTrend = useMemo(() => {
    // trend by done_at day (fallback due_date)
    const map = new Map<string, number>();
    for (const r of runs) {
      const isDone = r.status === "done" || !!r.done_at;
      if (!isDone) continue;

      const day =
        r.done_at?.slice(0, 10) ||
        r.due_date ||
        null;

      if (!day) continue;
      map.set(day, (map.get(day) || 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, count]) => ({ day, count }));
  }, [runs]);

  const statusPie = useMemo(() => {
    return [
      { name: "Done", value: kpis.done },
      { name: "Open", value: kpis.open },
      { name: "Overdue", value: kpis.overdue },
    ];
  }, [kpis]);

  // recharts pede Cell color, mas a gente não vai “viajar” em paleta aqui
  const pieColors = ["#16a34a", "#2563eb", "#dc2626"];

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">Dashboard</h1>
            <div className="text-xs opacity-70">KPIs por vencimento (due_date) — últimos {daysBack} dias</div>
          </div>
          <div className="flex gap-2">
            <Button variant={daysBack === 7 ? "default" : "outline"} onClick={() => setDaysBack(7)}>
              7d
            </Button>
            <Button variant={daysBack === 30 ? "default" : "outline"} onClick={() => setDaysBack(30)}>
              30d
            </Button>
            <Button variant={daysBack === 90 ? "default" : "outline"} onClick={() => setDaysBack(90)}>
              90d
            </Button>
            <Button variant="outline" onClick={() => router.push("/runs")}>
              Go to /runs
            </Button>
          </div>
        </div>

        {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Total</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">
              {loading ? "…" : kpis.total}
              <div className="text-xs opacity-70 mt-1">runs no período</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Done</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">
              {loading ? "…" : kpis.done}
              <div className="text-xs opacity-70 mt-1">
                On-time rate: <span className="font-medium">{kpis.onTimeRate}%</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Overdue</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">
              {loading ? "…" : kpis.overdue}
              <div className="text-xs opacity-70 mt-1">
                Avg late days: <span className="font-medium">{kpis.avgLateDays}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Status</CardTitle>
              <Badge variant="secondary">{loading ? "Loading..." : "OK"}</Badge>
            </CardHeader>
            <CardContent style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPie} dataKey="value" nameKey="name" outerRadius={90} label>
                    {statusPie.map((_, idx) => (
                      <Cell key={idx} fill={pieColors[idx % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Done trend</CardTitle>
            </CardHeader>
            <CardContent style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyDoneTrend}>
                  <XAxis dataKey="day" hide />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="text-xs opacity-70 mt-2">
                (Conta conclusões por dia — usando done_at)
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>By sector</CardTitle>
            </CardHeader>
            <CardContent style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySector}>
                  <XAxis dataKey="sector" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="total" />
                  <Bar dataKey="done" />
                  <Bar dataKey="overdue" />
                </BarChart>
              </ResponsiveContainer>
              <div className="text-xs opacity-70 mt-2">
                Total vs Done vs Overdue por setor.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
