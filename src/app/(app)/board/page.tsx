"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RunRow = {
  id: string;
  user_id?: string;
  template_id: string;
  due_date: string;
  status: string;
  done_at: string | null;
  task_templates?: any;
};

type Tpl = {
  task_id: string | null;
  title: string;
  sector: string | null;
  frequency: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
};

function tplOf(r: RunRow): Tpl | null {
  const t = (r as any).task_templates;
  if (!t) return null;
  if (Array.isArray(t)) return (t[0] ?? null) as any;
  return t as any;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warn" | "danger" | "success";
}) {
  return (
    <div
      className={cx(
        "inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs",
        tone === "neutral" && "bg-muted/40",
        tone === "warn" &&
          "bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-100",
        tone === "danger" &&
          "bg-red-50 border-red-200 text-red-900 dark:bg-red-950/30 dark:border-red-900 dark:text-red-100",
        tone === "success" &&
          "bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-100"
      )}
    >
      <span className="opacity-80">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export default function BoardPage() {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);

  // filtros (igual teu board)
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [statusFilter, setStatusFilter] = useState("open"); // open default

  async function load() {
    setBusy(true);
    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);
      if (!sess.session?.user) {
        router.replace("/login");
        return;
      }

      const uid = sess.session.user.id;

      const { data, error } = await supabase
        .from("task_runs")
        .select(
          `
          id, user_id, template_id, due_date, status, done_at,
          task_templates (
            task_id, title, sector, frequency, assignee_name, assignee_email
          )
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

  const filters = useMemo(() => {
    const sectors = new Set<string>();
    const assignees = new Set<string>();
    for (const r of runs) {
      const t = tplOf(r);
      if (t?.sector) sectors.add(t.sector);
      const a = (t?.assignee_name || t?.assignee_email || "").trim();
      if (a) assignees.add(a);
    }
    return { sectors: Array.from(sectors).sort(), assignees: Array.from(assignees).sort() };
  }, [runs]);

  function clearFilters() {
    setSearch("");
    setSector("all");
    setAssignee("all");
    setStatusFilter("open");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return runs.filter((r) => {
      const t = tplOf(r);

      if (sector !== "all" && (t?.sector || "") !== sector) return false;

      const a = (t?.assignee_name || t?.assignee_email || "").trim();
      if (assignee !== "all" && a !== assignee) return false;

      const st = normalizeStatus(r.status || "open");
      if (statusFilter !== "all" && st !== statusFilter) return false;

      if (!q) return true;
      const taskId = (t?.task_id || "").toLowerCase();
      const title = (t?.title || "").toLowerCase();
      return taskId.includes(q) || title.includes(q);
    });
  }, [runs, search, sector, assignee, statusFilter]);

  const stats = useMemo(() => {
    let open = 0;
    let done = 0;
    let overdue = 0;
    let today = 0;
    let next7 = 0;

    for (const r of filtered) {
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

    return { total: filtered.length, open, overdue, today, next7, done };
  }, [filtered]);

  const cols = useMemo(() => {
    const overdue: RunRow[] = [];
    const today: RunRow[] = [];
    const next7: RunRow[] = [];
    const later: RunRow[] = [];
    const done: RunRow[] = [];

    for (const r of filtered) {
      const st = normalizeStatus(r.status || "open");
      if (st === "done") {
        done.push(r);
        continue;
      }
      const b = dueBucket(r.due_date);
      if (b === "overdue") overdue.push(r);
      else if (b === "today") today.push(r);
      else if (b === "next7") next7.push(r);
      else later.push(r);
    }

    return { overdue, today, next7, later, done };
  }, [filtered]);

  async function markDone(runId: string) {
    const patch: any = { status: "done", done_at: new Date().toISOString() };
    const { error } = await supabase.from("task_runs").update(patch).eq("id", runId);
    if (error) return alert(error.message);
    setRuns((prev) => prev.map((r) => (r.id === runId ? { ...r, ...patch } : r)));
  }

  function Column({ title, items }: { title: string; items: RunRow[] }) {
    return (
      <div className="w-[360px] shrink-0">
        <div className="sticky top-0 z-10">
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 bg-background">
            <div className="font-medium">{title}</div>
            <div className="text-xs opacity-70">{items.length}</div>
          </div>
        </div>

        <div className="mt-2 h-[calc(100vh-360px)] overflow-y-auto pr-1 space-y-2">
          {items.map((r) => {
            const t = tplOf(r);
            const ass = (t?.assignee_name || t?.assignee_email || "").trim();

            return (
              <Card key={r.id} className="shadow-sm">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs opacity-70">
                        {t?.task_id || "—"} • {r.due_date}
                      </div>
                      <div className="font-medium leading-snug break-words">{t?.title || "Sem título"}</div>
                    </div>

                    <Button size="sm" onClick={() => markDone(r.id)}>
                      Complete
                    </Button>
                  </div>

                  <div className="text-xs opacity-80 flex flex-wrap gap-2">
                    <span className="px-2 py-1 rounded bg-muted">{t?.sector ? `Sector: ${t.sector}` : "Sector: —"}</span>
                    <span className="px-2 py-1 rounded bg-muted">{t?.frequency || "—"}</span>
                    <span className="px-2 py-1 rounded bg-muted">{ass || "Sem responsável"}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {items.length === 0 ? <div className="text-sm opacity-60 px-1 py-4">Nada aqui.</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Board</h1>
          <div className="text-sm opacity-70">Kanban por prazo (Overdue / Today / Next 7d / Later / Done).</div>
        </div>

        {/* CONTADORES NO TOPO */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatPill label="Total" value={stats.total} tone="neutral" />
          <StatPill label="Open" value={stats.open} tone="warn" />
          <StatPill label="Overdue" value={stats.overdue} tone="danger" />
          <StatPill label="Today" value={stats.today} tone="warn" />
          <StatPill label="Next 7d" value={stats.next7} tone="neutral" />
          <StatPill label="Done" value={stats.done} tone="success" />

          <div className="flex items-center gap-2 ml-1">
            <Button variant="outline" onClick={load} disabled={busy}>
              {busy ? "Loading..." : "Refresh"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/tasks")}>
              Go to List
            </Button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-3 md:grid-cols-12 items-end">
          <div className="md:col-span-4">
            <div className="text-xs opacity-70 mb-1">Search</div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Task_ID or Title..."
            />
          </div>

          <div className="md:col-span-3">
            <div className="text-xs opacity-70 mb-1">Sector</div>
            <select
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
            >
              <option value="all">All</option>
              {filters.sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <div className="text-xs opacity-70 mb-1">Assignee</div>
            <select
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="all">All</option>
              {filters.assignees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs opacity-70 mb-1">Status</div>
            <select
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="done">Done</option>
            </select>
          </div>

          <div className="md:col-span-12 flex gap-2 pt-1">
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
            <Button variant="outline" onClick={load} disabled={busy}>
              Refresh
            </Button>
            <Button variant="outline" onClick={() => router.push("/kanban")}>
              Go to Kanban (Status)
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex gap-3 overflow-x-auto pb-2 items-start">
          <Column title={`Overdue`} items={cols.overdue} />
          <Column title={`Today`} items={cols.today} />
          <Column title={`Next 7d`} items={cols.next7} />
          <Column title={`Later`} items={cols.later} />
          <Column title={`Done`} items={cols.done} />
        </div>
      </div>
    </div>
  );
}
