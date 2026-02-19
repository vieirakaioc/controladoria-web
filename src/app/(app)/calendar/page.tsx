"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type RunRow = {
  id: string;
  user_id?: string;
  due_date: string;
  status: string;
  task_templates?: any;
};

type Tpl = { task_id: string | null; title: string; sector: string | null; assignee_name?: string | null; assignee_email?: string | null };

function tplOf(r: RunRow): Tpl | null {
  const t = (r as any).task_templates;
  if (!t) return null;
  if (Array.isArray(t)) return (t[0] ?? null) as any;
  return t as any;
}

function toLocalDate(d: string) {
  return new Date(`${d}T00:00:00`);
}
function ymdLocal(dt: Date) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function addDays(dt: Date, days: number) {
  const x = new Date(dt);
  x.setDate(x.getDate() + days);
  return x;
}
function dueBucket(dueDate: string) {
  const today = new Date();
  const todayYMD = ymdLocal(today);

  const dueDt = toLocalDate(dueDate);
  const todayDt = toLocalDate(todayYMD);
  const next7 = addDays(todayDt, 7);

  if (dueDt < todayDt) return "overdue";
  if (dueDate === todayYMD) return "today";
  if (dueDt > todayDt && dueDt <= next7) return "next7";
  return "later";
}
function normalizeStatus(s: string) {
  const st = (s || "open").toLowerCase();
  if (st === "in-progress" || st === "progress") return "in_progress";
  return st;
}

export default function CalendarPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);

  async function load() {
    setBusy(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session?.user) {
        router.replace("/login");
        return;
      }
      const uid = sess.session.user.id;

      const { data, error } = await supabase
        .from("task_runs")
        .select(
          `
          id,user_id,due_date,status,
          task_templates(task_id,title,sector,assignee_name,assignee_email)
        `
        )
        .eq("user_id", uid)
        .order("due_date", { ascending: true })
        .limit(5000);

      if (error) throw new Error(error.message);
      setRuns((data as any) ?? []);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    let open = 0;
    let done = 0;
    let overdue = 0;
    let today = 0;
    let next7 = 0;

    for (const r of runs) {
      const st = normalizeStatus(r.status || "open");
      const isDone = st === "done";
      if (isDone) done++;
      else open++;

      if (!isDone) {
        const b = dueBucket(r.due_date);
        if (b === "overdue") overdue++;
        else if (b === "today") today++;
        else if (b === "next7") next7++;
      }
    }
    return { total: runs.length, open, overdue, today, next7, done };
  }, [runs]);

  const grouped = useMemo(() => {
    const map = new Map<string, RunRow[]>();
    for (const r of runs) {
      const key = r.due_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [runs]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Calendar</h1>
          <div className="text-sm opacity-70">Visão por data (lista).</div>
        </div>

        <div className="flex flex-wrap gap-2 items-center justify-end">
          <div className="text-xs rounded border px-2 py-1 bg-muted/40">Total: <b>{stats.total}</b></div>
          <div className="text-xs rounded border px-2 py-1 bg-amber-50 border-amber-200">Open: <b>{stats.open}</b></div>
          <div className="text-xs rounded border px-2 py-1 bg-red-50 border-red-200">Overdue: <b>{stats.overdue}</b></div>
          <div className="text-xs rounded border px-2 py-1 bg-amber-50 border-amber-200">Today: <b>{stats.today}</b></div>
          <div className="text-xs rounded border px-2 py-1 bg-muted/40">Next 7d: <b>{stats.next7}</b></div>
          <div className="text-xs rounded border px-2 py-1 bg-emerald-50 border-emerald-200">Done: <b>{stats.done}</b></div>

          <Button variant="outline" onClick={load} disabled={busy}>
            {busy ? "Loading..." : "Refresh"}
          </Button>
          <Button variant="outline" onClick={() => router.push("/tasks")}>
            Go to Tasks
          </Button>
        </div>
      </div>

      {grouped.map(([date, items]) => (
        <Card key={date}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{date}</span>
              <span className="text-xs opacity-70">{items.length} tasks</span>
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-2">
            {items.map((r) => {
              const t = tplOf(r);
              const ass = (t?.assignee_name || t?.assignee_email || "").trim();
              const st = normalizeStatus(r.status || "open");
              const b = dueBucket(r.due_date);

              return (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="text-xs opacity-70">
                      {(t?.task_id || "—")} • {t?.sector || "—"} • {ass || "Sem responsável"}
                    </div>
                    <div className="font-medium truncate">{t?.title || "Sem título"}</div>
                  </div>

                  <div className="shrink-0 text-xs rounded border px-2 py-1 bg-muted/40">
                    {st === "done" ? "DONE" : b.toUpperCase()}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      {runs.length === 0 ? (
        <div className="text-sm opacity-70">Sem dados ainda.</div>
      ) : null}
    </div>
  );
}
