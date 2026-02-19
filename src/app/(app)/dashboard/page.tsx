"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  BarChart,
  Bar,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";

// --- PALETA DE CORES PARA OS GRÁFICOS ---
const COLORS = {
  open: "#f59e0b",        // Amber/Amarelo
  in_progress: "#3b82f6", // Azul
  done: "#10b981",        // Verde
  overdue: "#ef4444",     // Vermelho
  today: "#f97316",       // Laranja
  next7: "#8b5cf6",       // Roxo
  later: "#94a3b8",       // Cinza
};

type Template = {
  sector: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
};

type RunRow = {
  id: string;
  due_date: string; // YYYY-MM-DD
  status: string;
  done_at: string | null;
  template: Template | Template[] | null; // join pode vir array
};

type Run = {
  id: string;
  due_date: string;
  status: "open" | "in_progress" | "done" | string;
  done_at: string | null;
  template: Template | null;
};

function localISO(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + days);
  return localISO(dt);
}

function startOfMonthISO(iso: string) {
  const [y, m] = iso.split("-").map((x) => parseInt(x, 10));
  return localISO(new Date(y, (m || 1) - 1, 1));
}

function endOfMonthISO(iso: string) {
  const [y, m] = iso.split("-").map((x) => parseInt(x, 10));
  return localISO(new Date(y, (m || 1), 0));
}

function normalizeStatus(s: string) {
  const st = (s || "open").toLowerCase();
  if (st === "in-progress" || st === "progress") return "in_progress";
  return st;
}

function dueBucket(dueDate: string, todayISO: string, next7ISO: string) {
  if (dueDate < todayISO) return "Overdue";
  if (dueDate === todayISO) return "Today";
  if (dueDate > todayISO && dueDate <= next7ISO) return "Next 7";
  return "Later";
}

function safeLabel(s: string, max = 16) {
  const x = (s || "").trim();
  if (!x) return "—";
  return x.length <= max ? x : x.slice(0, max - 1) + "…";
}

function dateRangeList(fromISO: string, toISO: string, hardLimitDays = 60) {
  let start = fromISO;
  let end = toISO;

  const maxBack = addDaysISO(end, -hardLimitDays);
  if (start < maxBack) start = maxBack;

  const out: string[] = [];
  let cur = start;
  while (cur <= end && out.length <= hardLimitDays + 2) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
  }
  return out;
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "warn" | "danger" | "success";
}) {
  const cls =
    tone === "danger"
      ? "border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900"
        : tone === "success"
          ? "border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-900"
          : "border-border bg-muted/20";

  return (
    <Card className={cls}>
      <CardContent className="p-4">
        <div className="text-xs opacity-70">{label}</div>
        <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
        {hint ? <div className="text-xs opacity-60 mt-1">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const q0 = sp.get("q") ?? "";
  const sector0 = sp.get("sector") ?? "";
  const assignee0 = sp.get("assignee") ?? "";
  const due0 = sp.get("due") ?? "month"; 
  const from0 = sp.get("from") ?? "";
  const to0 = sp.get("to") ?? "";

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userId, setUserId] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [showFilters, setShowFilters] = useState(false);

  const [q, setQ] = useState(q0);
  const [sector, setSector] = useState(sector0);
  const [assignee, setAssignee] = useState(assignee0);
  const [duePreset, setDuePreset] = useState(due0);
  const [dueFrom, setDueFrom] = useState(from0);
  const [dueTo, setDueTo] = useState(to0);

  const [runs, setRuns] = useState<Run[]>([]);
  const [sectors, setSectors] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<Array<{ key: string; label: string }>>([]);

  const today = useMemo(() => localISO(new Date()), []);
  const next7 = useMemo(() => addDaysISO(today, 7), [today]);

  function setUrl(next: Partial<Record<string, string>>) {
    const params = new URLSearchParams(sp.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (!v) params.delete(k);
      else params.set(k, v);
    });

    const due = params.get("due") ?? "month";
    if (due !== "custom") {
      params.delete("from");
      params.delete("to");
    }

    const qs = params.toString();
    router.replace(`/dashboard${qs ? `?${qs}` : ""}`);
  }

  function applyDuePreset(p: string) {
    setDuePreset(p);

    if (p === "custom") {
      setUrl({ due: "custom" });
      return;
    }

    if (p === "overdue") {
      setDueFrom("");
      setDueTo(addDaysISO(today, -1));
      setUrl({ due: "overdue" });
      return;
    }
    if (p === "today") {
      setDueFrom(today);
      setDueTo(today);
      setUrl({ due: "today" });
      return;
    }
    if (p === "next7") {
      setDueFrom(today);
      setDueTo(next7);
      setUrl({ due: "next7" });
      return;
    }
    if (p === "month") {
      setDueFrom(startOfMonthISO(today));
      setDueTo(endOfMonthISO(today));
      setUrl({ due: "month" });
      return;
    }

    setDueFrom("");
    setDueTo("");
    setUrl({ due: "all" });
  }

  async function checkSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setErr(error.message);
      return;
    }
    const u = data.session?.user;
    if (!u) {
      router.replace("/login");
      return;
    }
    setUserId(u.id);
    setCheckingAuth(false);
  }

  useEffect(() => {
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setQ(q0);
    setSector(sector0);
    setAssignee(assignee0);
    setDuePreset(due0);
    setDueFrom(from0);
    setDueTo(to0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  useEffect(() => {
    if (!userId) return;

    (async () => {
      const { data, error } = await supabase
        .from("task_templates")
        .select("sector, assignee_name, assignee_email")
        .eq("user_id", userId);

      if (error) return;

      const sec = new Set<string>();
      const asg = new Map<string, { key: string; label: string }>();

      (data || []).forEach((t: any) => {
        const s = String(t.sector ?? "").trim();
        if (s) sec.add(s);

        const name = String(t.assignee_name ?? "").trim();
        const email = String(t.assignee_email ?? "").trim();
        const key = (email || name).trim();
        if (!key) return;

        const label = name && email ? `${name} — ${email}` : (name || email);
        asg.set(key, { key, label });
      });

      setSectors(Array.from(sec).sort((a, b) => a.localeCompare(b)));
      setAssignees(Array.from(asg.values()).sort((a, b) => a.label.localeCompare(b.label)));
    })();
  }, [userId]);

  function applyCommonFilters(query: any) {
    if (sector) query = query.eq("task_templates.sector", sector);

    if (assignee) {
      query = query.or(`assignee_name.eq.${assignee},assignee_email.eq.${assignee}`, {
        foreignTable: "task_templates",
      });
    }

    const qq = q.trim();
    if (qq) {
      query = query.or(`title.ilike.%${qq}%,task_id.ilike.%${qq}%`, { foreignTable: "task_templates" });
    }

    if (duePreset === "overdue") query = query.lt("due_date", today);
    else if (duePreset === "today") query = query.eq("due_date", today);
    else if (duePreset === "next7") query = query.gte("due_date", today).lte("due_date", next7);
    else if (duePreset === "month") {
      query = query.gte("due_date", startOfMonthISO(today)).lte("due_date", endOfMonthISO(today));
    } else if (duePreset === "custom") {
      if (dueFrom) query = query.gte("due_date", dueFrom);
      if (dueTo) query = query.lte("due_date", dueTo);
    }

    return query;
  }

  async function load() {
    if (!userId) return;

    setBusy(true);
    setErr("");

    try {
      let query = supabase
        .from("task_runs")
        .select(
          `
          id, due_date, status, done_at,
          template:task_templates!inner(
            sector, assignee_name, assignee_email
          )
        `
        )
        .eq("user_id", userId)
        .order("due_date", { ascending: true })
        .limit(10000);

      query = applyCommonFilters(query);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const normalized: Run[] = ((data || []) as RunRow[]).map((r) => {
        const t = Array.isArray(r.template) ? r.template[0] : r.template;
        return {
          id: r.id,
          due_date: r.due_date,
          status: r.status,
          done_at: r.done_at,
          template: (t ?? null) as any,
        };
      });

      setRuns(normalized);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, q0, sector0, assignee0, due0, from0, to0]);

  function clearFilters() {
    setUrl({ q: "", sector: "", assignee: "", due: "month", from: "", to: "" });
  }

  const kpis = useMemo(() => {
    let open = 0;
    let inprog = 0;
    let done = 0;
    let overdue = 0;
    let dueToday = 0;
    let next7c = 0;

    for (const r of runs) {
      const st = normalizeStatus(r.status || "open");
      const isDone = st === "done";

      if (isDone) done++;
      else if (st === "in_progress") inprog++;
      else open++;

      if (!isDone) {
        const b = dueBucket(r.due_date, today, next7);
        if (b === "Overdue") overdue++;
        else if (b === "Today") dueToday++;
        else if (b === "Next 7") next7c++;
      }
    }

    const total = runs.length;
    const completion = total ? Math.round((done / total) * 100) : 0;

    return { total, open, inprog, done, overdue, dueToday, next7: next7c, completion };
  }, [runs, today, next7]);

  // =========================
  // CHART DATA COM CATEGORIA "OVERDUE"
  // =========================

  const completionData = useMemo(() => [{ name: "Completion", value: kpis.completion, fill: COLORS.done }], [kpis.completion]);

  const duePie = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of runs) {
      const st = normalizeStatus(r.status || "open");
      if (st === "done") continue;
      const b = dueBucket(r.due_date, today, next7);
      m.set(b, (m.get(b) ?? 0) + 1);
    }

    const dueColors: Record<string, string> = {
      "Overdue": COLORS.overdue,
      "Today": COLORS.today,
      "Next 7": COLORS.next7,
      "Later": COLORS.later,
    };

    return Array.from(m.entries()).map(([name, value]) => ({ 
      name, 
      value, 
      fill: dueColors[name] || COLORS.later 
    }));
  }, [runs, today, next7]);

  const statusPie = useMemo(() => {
    return [
      { name: "Open", value: kpis.open, fill: COLORS.open },
      { name: "In progress", value: kpis.inprog, fill: COLORS.in_progress },
      { name: "Done", value: kpis.done, fill: COLORS.done },
    ].filter((x) => x.value > 0);
  }, [kpis]);

  const trendData = useMemo(() => {
    let a = "";
    let b = "";

    if (duePreset === "custom" && (dueFrom || dueTo)) {
      a = dueFrom || addDaysISO(today, -30);
      b = dueTo || today;
    } else if (duePreset === "month") {
      a = startOfMonthISO(today);
      b = endOfMonthISO(today);
    } else if (duePreset === "next7") {
      a = today;
      b = next7;
    } else if (duePreset === "today") {
      a = today;
      b = today;
    } else if (duePreset === "overdue") {
      a = addDaysISO(today, -30);
      b = addDaysISO(today, -1);
    } else {
      a = addDaysISO(today, -30);
      b = today;
    }

    const days = dateRangeList(a, b, 60);
    const map = new Map<string, any>();
    days.forEach((d) => map.set(d, { date: d, open: 0, in_progress: 0, overdue: 0, done: 0 }));

    for (const r of runs) {
      if (r.due_date < days[0] || r.due_date > days[days.length - 1]) continue;
      const st = normalizeStatus(r.status || "open");
      const row = map.get(r.due_date);
      if (!row) continue;
      
      if (st === "done") {
        row.done++;
      } else if (r.due_date < today) {
        row.overdue++; // Agora contabiliza como atrasado no gráfico de linha
      } else if (st === "in_progress") {
        row.in_progress++;
      } else {
        row.open++;
      }
    }

    return Array.from(map.values());
  }, [runs, duePreset, dueFrom, dueTo, today, next7]);

  const sectorChart = useMemo(() => {
    const m = new Map<
      string,
      { name: string; open: number; in_progress: number; overdue: number; done: number; total: number }
    >();

    for (const r of runs) {
      const sec = String(r.template?.sector ?? "").trim() || "—";
      if (!m.has(sec)) m.set(sec, { name: sec, open: 0, in_progress: 0, overdue: 0, done: 0, total: 0 });
      const row = m.get(sec)!;
      row.total++;

      const st = normalizeStatus(r.status || "open");
      if (st === "done") {
        row.done++;
      } else if (r.due_date < today) {
        row.overdue++; // Separa as atrasadas
      } else if (st === "in_progress") {
        row.in_progress++;
      } else {
        row.open++;
      }
    }

    return Array.from(m.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map((x) => ({
        name: safeLabel(x.name, 14),
        open: x.open,
        in_progress: x.in_progress,
        overdue: x.overdue,
        done: x.done,
        total: x.total,
      }));
  }, [runs, today]);

  const assigneeChart = useMemo(() => {
    const m = new Map<
      string,
      { name: string; open: number; in_progress: number; overdue: number; done: number; total: number }
    >();

    for (const r of runs) {
      const name = String(r.template?.assignee_name ?? "").trim();
      const email = String(r.template?.assignee_email ?? "").trim();
      const key = email || name || "Unassigned";
      const label = key === "Unassigned" ? "Unassigned" : (name || email);

      if (!m.has(key)) m.set(key, { name: label, open: 0, in_progress: 0, overdue: 0, done: 0, total: 0 });
      const row = m.get(key)!;
      row.total++;

      const st = normalizeStatus(r.status || "open");
      if (st === "done") {
        row.done++;
      } else if (r.due_date < today) {
        row.overdue++; // Separa as atrasadas
      } else if (st === "in_progress") {
        row.in_progress++;
      } else {
        row.open++;
      }
    }

    return Array.from(m.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((x) => ({
        name: safeLabel(x.name, 14),
        open: x.open,
        in_progress: x.in_progress,
        overdue: x.overdue,
        done: x.done,
        total: x.total,
      }));
  }, [runs, today]);

  function goTasks(params: Record<string, string>) {
    const p = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v) p.set(k, v);
    });
    router.push(`/tasks?${p.toString()}`);
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm opacity-70">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">Dashboard (Executive)</h1>
          <div className="text-sm opacity-70">
            Bate o olho e entende: saúde, atrasos e carga por área/colaborador.
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowFilters((p) => !p)}>
            {showFilters ? "Hide filters" : "Show filters"}
          </Button>

          <Button variant="outline" onClick={load} disabled={busy}>
            {busy ? "Loading..." : "Refresh"}
          </Button>

          <Button onClick={() => goTasks({ status: "open", due: "overdue" })}>
            Open overdue
          </Button>
        </div>
      </div>

      {kpis.overdue > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/20 dark:border-red-900 dark:text-red-100">
          ⚠️ Você tem <b>{kpis.overdue}</b> tarefas <b>atrasadas</b> nesse recorte.
        </div>
      ) : null}

      {showFilters ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-12 items-end">
            <div className="md:col-span-4">
              <div className="text-xs opacity-70 mb-1">Search</div>
              <div className="flex gap-2">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ex: conciliação, fechamento..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setUrl({ q: q.trim() });
                  }}
                />
                <Button variant="secondary" onClick={() => setUrl({ q: q.trim() })}>
                  Apply
                </Button>
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="text-xs opacity-70 mb-1">Sector</div>
              <select
                className="w-full h-10 rounded-md border bg-background px-2 text-sm"
                value={sector}
                onChange={(e) => setUrl({ sector: e.target.value })}
              >
                <option value="">All</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <div className="text-xs opacity-70 mb-1">Assignee</div>
              <select
                className="w-full h-10 rounded-md border bg-background px-2 text-sm"
                value={assignee}
                onChange={(e) => setUrl({ assignee: e.target.value })}
              >
                <option value="">All</option>
                {assignees.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <div className="text-xs opacity-70 mb-1">Due period</div>
              <select
                className="w-full h-10 rounded-md border bg-background px-2 text-sm"
                value={duePreset}
                onChange={(e) => applyDuePreset(e.target.value)}
              >
                <option value="all">All</option>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="next7">Next 7 days</option>
                <option value="month">This month</option>
                <option value="custom">Custom range</option>
              </select>
            </div>

            {duePreset === "custom" ? (
              <div className="md:col-span-6">
                <div className="text-xs opacity-70 mb-1">Custom range</div>
                <div className="flex gap-2 items-center">
                  <Input
                    type="date"
                    value={dueFrom}
                    onChange={(e) => {
                      setDueFrom(e.target.value);
                      setUrl({ due: "custom", from: e.target.value, to: dueTo });
                    }}
                  />
                  <span className="text-xs opacity-60">to</span>
                  <Input
                    type="date"
                    value={dueTo}
                    onChange={(e) => {
                      setDueTo(e.target.value);
                      setUrl({ due: "custom", from: dueFrom, to: e.target.value });
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="md:col-span-12 flex gap-2 pt-1">
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
              <Button variant="outline" onClick={load} disabled={busy}>
                Refresh
              </Button>
              <Button variant="outline" onClick={() => router.push("/tasks")}>
                Open tasks list
              </Button>
            </div>

            {err ? (
              <div className="md:col-span-12 text-sm text-rose-600 border border-rose-200 bg-rose-50 rounded-md p-3">
                {err}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3 md:grid-cols-12">
        <div className="md:col-span-3">
          <StatTile label="Total" value={kpis.total} hint="Runs no recorte" tone="neutral" />
        </div>
        <div className="md:col-span-2">
          <StatTile label="Open" value={kpis.open} hint="Pendentes" tone="warn" />
        </div>
        <div className="md:col-span-2">
          <StatTile label="In progress" value={kpis.inprog} hint="Andamento" tone="warn" />
        </div>
        <div className="md:col-span-2">
          <StatTile label="Overdue" value={kpis.overdue} hint="Atrasadas" tone="danger" />
        </div>
        <div className="md:col-span-3">
          <StatTile label="Done" value={kpis.done} hint={`Completion: ${kpis.completion}%`} tone="success" />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Completion</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                innerRadius="60%"
                outerRadius="100%"
                data={completionData}
                startAngle={180}
                endAngle={0}
              >
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar dataKey="value" cornerRadius={10} />
                <Tooltip />
                <text x="50%" y="55%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 28, fontWeight: 700 }}>
                  {kpis.completion}%
                </text>
                <text x="50%" y="70%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: 12, opacity: 0.7 }}>
                  completed
                </text>
              </RadialBarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {statusPie.length === 0 ? (
              <div className="text-sm opacity-70">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip />
                  <Legend />
                  <Pie data={statusPie} dataKey="value" nameKey="name" outerRadius={90} label />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Due buckets (open only)</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {duePie.length === 0 ? (
              <div className="text-sm opacity-70">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip />
                  <Legend />
                  <Pie data={duePie} dataKey="value" nameKey="name" outerRadius={90} label />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily trend (by due date)</CardTitle>
          </CardHeader>
          <CardContent className="h-[280px]">
            {trendData.length === 0 ? (
              <div className="text-sm opacity-70">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="overdue" stroke={COLORS.overdue} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="open" stroke={COLORS.open} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="in_progress" stroke={COLORS.in_progress} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="done" stroke={COLORS.done} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Workload by area (Top 12)</CardTitle>
          </CardHeader>
          <CardContent className="h-[360px]">
            {sectorChart.length === 0 ? (
              <div className="text-sm opacity-70">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={90} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="overdue" stackId="a" fill={COLORS.overdue} />
                  <Bar dataKey="open" stackId="a" fill={COLORS.open} />
                  <Bar dataKey="in_progress" stackId="a" fill={COLORS.in_progress} />
                  <Bar dataKey="done" stackId="a" fill={COLORS.done} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="mt-2 flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => goTasks({ status: "open", due: "overdue" })}>
                Drill: overdue
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push("/tasks")}>
                Drill: list
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Workload by collaborator (Top 10)</CardTitle>
          </CardHeader>
          <CardContent className="h-[360px]">
            {assigneeChart.length === 0 ? (
              <div className="text-sm opacity-70">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={assigneeChart} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={110} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="overdue" stackId="a" fill={COLORS.overdue} />
                  <Bar dataKey="open" stackId="a" fill={COLORS.open} />
                  <Bar dataKey="in_progress" stackId="a" fill={COLORS.in_progress} />
                  <Bar dataKey="done" stackId="a" fill={COLORS.done} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="mt-2 flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => router.push("/kanban")}>
                Go Kanban
              </Button>
              <Button variant="outline" size="sm" onClick={() => router.push("/tasks")}>
                Go Tasks
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}