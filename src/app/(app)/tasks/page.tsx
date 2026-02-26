"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import TaskDrawer, { RunItem } from "@/components/tasks/TaskDrawer";

import { ROUTES } from "@/lib/routes";

type Template = {
  id: string;
  task_id: string | null;
  title: string;
  sector: string | null;
  frequency: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
  classification: string | null;
  priority: number | null;
  planner: string | null;
  workday_only?: boolean | null;
  due_day?: number | null;
};

type RunRow = {
  id: string;
  template_id: string;
  due_date: string; // YYYY-MM-DD
  done_at: string | null;
  status: "open" | "done";
  template: Template | Template[] | null; // pode vir como array dependendo do join
};

type Run = {
  id: string;
  template_id: string;
  due_date: string;
  done_at: string | null;
  status: "open" | "done";
  template: Template | null;
};

type KpiRow = {
  id: string;
  due_date: string;
  status: "open" | "done";
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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
  const dt = new Date(y, (m || 1) - 1, 1);
  return localISO(dt);
}

function endOfMonthISO(iso: string) {
  const [y, m] = iso.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, (m || 1), 0); // dia 0 do próximo mês = último dia do mês atual
  return localISO(dt);
}

function badgeClass(kind: "open" | "done" | "overdue" | "chip") {
  if (kind === "done") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (kind === "overdue") return "bg-rose-100 text-rose-800 border-rose-200";
  if (kind === "open") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-muted text-foreground border-border";
}

export default function TasksPage() {
  const router = useRouter();
  const sp = useSearchParams();

  // lê filtros da URL
  const q0 = sp.get("q") ?? "";
  const sector0 = sp.get("sector") ?? "";
  const assignee0 = sp.get("assignee") ?? "";
  const status0 = (sp.get("status") ?? "open") as "open" | "done" | "all";
  const preset0 = sp.get("due") ?? "all"; // all | overdue | today | next7 | month | custom
  const from0 = sp.get("from") ?? "";
  const to0 = sp.get("to") ?? "";

  // ✅ planner automático (?planner=... ou localStorage ctx.plannerName)
  const [plannerName, setPlannerName] = useState<string>("");

  function readPlannerFromCtx() {
    const qp = (sp.get("planner") || "").trim();
    if (qp) return qp;

    try {
      return (localStorage.getItem("ctx.plannerName") || "").trim();
    } catch {
      return "";
    }
  }

  function persistPlannerToCtx(v: string) {
    try {
      localStorage.setItem("ctx.plannerName", v);
    } catch {}
  }

  // states
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userId, setUserId] = useState<string>("");

  const [q, setQ] = useState(q0);
  const [sector, setSector] = useState(sector0);
  const [assignee, setAssignee] = useState(assignee0);
  const [status, setStatus] = useState<"open" | "done" | "all">(status0);
  const [duePreset, setDuePreset] = useState(preset0);
  const [dueFrom, setDueFrom] = useState(from0);
  const [dueTo, setDueTo] = useState(to0);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  const [runs, setRuns] = useState<Run[]>([]);
  const [kpiRows, setKpiRows] = useState<KpiRow[]>([]);

  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<RunItem | null>(null);

  const [sectors, setSectors] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<Array<{ email: string; name?: string }>>([]);

  const today = useMemo(() => localISO(new Date()), []);
  const next7 = useMemo(() => addDaysISO(today, 7), [today]);

  // cache de template ids do planner (pra evitar join e evitar TS deep instantiation)
  const [plannerTplIds, setPlannerTplIds] = useState<string[] | null>(null);

  // ✅ sempre que URL mudar, recalcula planner e persiste se vier por querystring
  useEffect(() => {
    const p = readPlannerFromCtx();
    setPlannerName(p);
    if (p && sp.get("planner")) persistPlannerToCtx(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  function setUrl(next: Partial<Record<string, string>>) {
    const params = new URLSearchParams(sp.toString());

    Object.entries(next).forEach(([k, v]) => {
      if (!v) params.delete(k);
      else params.set(k, v);
    });

    // limpa combos inválidos
    const due = params.get("due") ?? "all";
    if (due !== "custom") {
      params.delete("from");
      params.delete("to");
    }

    const qs = params.toString();
    router.replace(`/tasks${qs ? `?${qs}` : ""}`);
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

  async function getTemplateIdsForPlanner(pName: string) {
    const p = (pName || "").trim();
    if (!p) return null;

    const { data, error } = await supabase
      .from("task_templates")
      .select("id")
      .eq("user_id", userId)
      .eq("planner", p);

    if (error) throw error;

    const ids = (data || []).map((x: any) => x.id).filter(Boolean) as string[];
    return ids;
  }

  // carrega ids do planner (quando user/planner mudar)
  useEffect(() => {
    if (!userId) return;

    (async () => {
      try {
        if (!plannerName) {
          setPlannerTplIds(null);
          return;
        }
        const ids = await getTemplateIdsForPlanner(plannerName);
        setPlannerTplIds(ids ?? []);
      } catch (e: any) {
        setErr(e.message || "Erro ao carregar planner.");
        setPlannerTplIds(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, plannerName]);

  // carrega listas de filtros (Setor / Responsável)
  useEffect(() => {
    if (!userId) return;

    (async () => {
      let qTpl = supabase
        .from("task_templates")
        .select("sector, assignee_name, assignee_email")
        .eq("user_id", userId);

      // ✅ filtra por planner automaticamente (se tiver)
      if (plannerName) qTpl = qTpl.eq("planner", plannerName);

      const { data, error } = await qTpl;
      if (error) return;

      const sec = new Set<string>();
      const asg = new Map<string, { email: string; name?: string }>();

      (data || []).forEach((t: any) => {
        const s = String(t.sector ?? "").trim();
        if (s) sec.add(s);

        const email = String(t.assignee_email ?? "").trim();
        const name = String(t.assignee_name ?? "").trim();
        if (email) asg.set(email, { email, name: name || undefined });
      });

      setSectors(Array.from(sec).sort((a, b) => a.localeCompare(b)));
      setAssignees(Array.from(asg.values()).sort((a, b) => a.email.localeCompare(b.email)));
    })();
  }, [userId, plannerName]);

  // sempre que a URL mudar, reflete no state
  useEffect(() => {
    setQ(q0);
    setSector(sector0);
    setAssignee(assignee0);
    setStatus(status0);
    setDuePreset(preset0);
    setDueFrom(from0);
    setDueTo(to0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q0, sector0, assignee0, status0, preset0, from0, to0]);

  // aplica filtros básicos comuns (sem filtro planner no join!)
  function applyCommonFilters(qry: any) {
    const qq = q.trim();
    if (qq) {
      qry = qry.or(`template.title.ilike.%${qq}%,template.task_id.ilike.%${qq}%`);
    }

    const sec = sector.trim();
    if (sec) {
      qry = qry.eq("template.sector", sec);
    }

    const asg = assignee.trim();
    if (asg) {
      qry = qry.eq("template.assignee_email", asg);
    }

    // due date
    if (duePreset === "custom") {
      const f = dueFrom.trim();
      const t = dueTo.trim();
      if (f) qry = qry.gte("due_date", f);
      if (t) qry = qry.lte("due_date", t);
    } else if (duePreset === "overdue") {
      qry = qry.lt("due_date", today).eq("status", "open");
    } else if (duePreset === "today") {
      qry = qry.eq("due_date", today);
    } else if (duePreset === "next7") {
      qry = qry.gte("due_date", today).lte("due_date", next7);
    } else if (duePreset === "month") {
      const f = startOfMonthISO(today);
      const t = endOfMonthISO(today);
      qry = qry.gte("due_date", f).lte("due_date", t);
    }

    return qry;
  }

  async function fetchRuns() {
    if (!userId) return;

    // se tem plannerName e ainda não carregou ids, espera (evita piscada)
    if (plannerName && plannerTplIds === null) return;

    setLoading(true);
    setErr("");

    try {
      // se planner foi definido mas não tem nenhum template, já zera tudo
      if (plannerName && plannerTplIds && plannerTplIds.length === 0) {
        setRuns([]);
        setKpiRows([]);
        return;
      }

      // 1) QUERY DA LISTA (respeita status)
      let listQuery = supabase
        .from("task_runs")
        .select(
          `
          id,
          template_id,
          due_date,
          done_at,
          status,
          template:task_templates!inner(
            id,
            task_id,
            title,
            sector,
            frequency,
            assignee_name,
            assignee_email,
            classification,
            priority,
            planner,
            workday_only,
            due_day
          )
        `
        )
        .eq("user_id", userId)
        .order("due_date", { ascending: true });

      // ✅ filtro planner SEM join
      if (plannerName && plannerTplIds && plannerTplIds.length > 0) {
        listQuery = listQuery.in("template_id", plannerTplIds);
      }

      listQuery = applyCommonFilters(listQuery);

      if (status !== "all") listQuery = listQuery.eq("status", status);

      const { data: listData, error: listErr } = await listQuery;
      if (listErr) throw listErr;

      const normalized: Run[] = (listData || []).map((r: RunRow) => {
        const t = Array.isArray(r.template) ? (r.template[0] ?? null) : (r.template as any);
        return {
          id: r.id,
          template_id: r.template_id,
          due_date: r.due_date,
          done_at: r.done_at,
          status: r.status,
          template: t,
        };
      });

      setRuns(normalized);

      // 2) KPI (sempre pega no mês corrente, independente do filtro “duePreset”)
      const monthFrom = startOfMonthISO(today);
      const monthTo = endOfMonthISO(today);

      let kpiQuery = supabase
        .from("task_runs")
        .select("id,due_date,status", { count: "exact" })
        .eq("user_id", userId)
        .gte("due_date", monthFrom)
        .lte("due_date", monthTo);

      // ✅ KPI filtra por planner SEM join
      if (plannerName && plannerTplIds && plannerTplIds.length > 0) {
        kpiQuery = kpiQuery.in("template_id", plannerTplIds);
      }

      const { data: kpiData, error: kpiErr } = await kpiQuery;
      if (kpiErr) throw kpiErr;

      const rows: KpiRow[] = (kpiData || []).map((x: any) => ({
        id: x.id,
        due_date: x.due_date,
        status: x.status,
      }));

      setKpiRows(rows);
    } catch (e: any) {
      setErr(e.message || "Erro ao buscar tarefas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    fetchRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, q, sector, assignee, status, duePreset, dueFrom, dueTo, plannerName, plannerTplIds]);

  async function toggleDone(runId: string, done: boolean) {
    const now = done ? new Date().toISOString() : null;
    const { error } = await supabase
      .from("task_runs")
      .update({
        status: done ? "done" : "open",
        done_at: now,
      })
      .eq("id", runId);

    if (error) {
      setErr(error.message);
      return;
    }
    fetchRuns();
  }

  async function openEdit(runId: string) {
    setErr("");
    const { data, error } = await supabase
      .from("task_runs")
      .select(
        `id,template_id,due_date,done_at,status,notes,
         template:task_templates(
           id,task_id,title,sector,task_type,frequency,priority,workday_only,schedule_kind,schedule_every,due_day,due_weekday,anchor_date,active,
           classification,planner,assignee_name,assignee_email
         )`
      )
      .eq("id", runId)
      .single();

    if (error) {
      setErr(error.message);
      return;
    }

    const t: any = (data as any)?.template ?? null;

    const item: RunItem = {
      id: data.id,
      template_id: data.template_id,
      due_date: data.due_date,
      done_at: data.done_at,
      status: data.status,
      notes: data.notes ?? null,
      template: t
        ? {
            id: t.id,
            task_id: t.task_id ?? null,
            title: t.title ?? "",
            sector: t.sector ?? null,
            task_type: t.task_type ?? null,
            priority: t.priority ?? null,
            frequency: t.frequency ?? null,
            classification: t.classification ?? null,
            planner: t.planner ?? null,
            workday_only: t.workday_only ?? false,
            due_day: t.due_day ?? null,
            assignee_name: t.assignee_name ?? null,
            assignee_email: t.assignee_email ?? null,
          }
        : null,
    };

    setEditItem(item);
    setEditOpen(true);
  }

  const kpis = useMemo(() => {
    const total = kpiRows.length;
    const done = kpiRows.filter((r) => r.status === "done").length;
    const open = total - done;
    const overdue = kpiRows.filter((r) => r.status === "open" && r.due_date < today).length;
    return { total, done, open, overdue };
  }, [kpiRows, today]);

  if (checkingAuth) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Tasks</h1>
          {plannerName ? (
            <span className={cx("text-xs px-2 py-1 rounded border", badgeClass("chip"))}>Planner: {plannerName}</span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push(ROUTES.KANBAN)}>
            Kanban
          </Button>
          <Button variant="outline" onClick={() => router.push(ROUTES.BOARD)}>
            Board
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm opacity-80">Total (mês)</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-3xl font-semibold tabular-nums">{kpis.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm opacity-80">Done (mês)</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-3xl font-semibold tabular-nums text-emerald-700">{kpis.done}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm opacity-80">Open (mês)</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-3xl font-semibold tabular-nums text-amber-700">{kpis.open}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm opacity-80">Overdue (mês)</CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <div className="text-3xl font-semibold tabular-nums text-rose-700">{kpis.overdue}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm opacity-80">Filters</CardTitle>
        </CardHeader>
        <CardContent className="pb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <div className="text-xs opacity-70 mb-1">Search (title / task_id)</div>
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setUrl({ q: e.target.value });
                }}
                placeholder="ex: fechamento, TSK-001..."
              />
            </div>

            <div>
              <div className="text-xs opacity-70 mb-1">Sector</div>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={sector}
                onChange={(e) => {
                  setSector(e.target.value);
                  setUrl({ sector: e.target.value });
                }}
              >
                <option value="">All</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs opacity-70 mb-1">Assignee</div>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={assignee}
                onChange={(e) => {
                  setAssignee(e.target.value);
                  setUrl({ assignee: e.target.value });
                }}
              >
                <option value="">All</option>
                {assignees.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.name ? `${a.name} (${a.email})` : a.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs opacity-70 mb-1">Status</div>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as any);
                  setUrl({ status: e.target.value });
                }}
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="done">Done</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <div className="text-xs opacity-70 mb-1">Due preset</div>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={duePreset}
                onChange={(e) => applyDuePreset(e.target.value)}
              >
                <option value="all">All</option>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="next7">Next 7 days</option>
                <option value="month">This month</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {duePreset === "custom" ? (
              <>
                <div>
                  <div className="text-xs opacity-70 mb-1">From</div>
                  <Input
                    type="date"
                    value={dueFrom}
                    onChange={(e) => {
                      setDueFrom(e.target.value);
                      setUrl({ from: e.target.value, due: "custom" });
                    }}
                  />
                </div>

                <div>
                  <div className="text-xs opacity-70 mb-1">To</div>
                  <Input
                    type="date"
                    value={dueTo}
                    onChange={(e) => {
                      setDueTo(e.target.value);
                      setUrl({ to: e.target.value, due: "custom" });
                    }}
                  />
                </div>

                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => fetchRuns()} disabled={loading}>
                    Apply
                  </Button>
                </div>
              </>
            ) : (
              <div className="md:col-span-3 flex justify-end">
                <Button variant="outline" onClick={() => fetchRuns()} disabled={loading}>
                  Refresh
                </Button>
              </div>
            )}
          </div>

          {err ? <div className="text-sm text-rose-600">{err}</div> : null}
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm opacity-80">
            List {loading ? <span className="opacity-60"> (loading...)</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="overflow-auto border rounded-lg">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="p-3">Due</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Task</th>
                  <th className="p-3">Sector</th>
                  <th className="p-3">Frequency</th>
                  <th className="p-3">Classification</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Assignee</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const t = r.template;
                  const overdue = r.status === "open" && r.due_date < today;

                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">
                        <span
                          className={cx(
                            "inline-flex px-2 py-1 rounded border text-xs tabular-nums",
                            overdue ? badgeClass("overdue") : badgeClass(r.status)
                          )}
                        >
                          {r.due_date}
                        </span>
                      </td>

                      <td className="p-3">
                        <span className={cx("inline-flex px-2 py-1 rounded border text-xs", badgeClass(overdue ? "overdue" : r.status))}>
                          {overdue ? "overdue" : r.status}
                        </span>
                      </td>

                      <td className="p-3">
                        <div className="font-medium leading-snug break-words">{t?.title || ""}</div>
                        <div className="text-xs opacity-70">{t?.task_id || ""}</div>
                      </td>

                      <td className="p-3">{t?.sector || ""}</td>
                      <td className="p-3">{t?.frequency || ""}</td>
                      <td className="p-3">{t?.classification || ""}</td>
                      <td className="p-3">{t?.priority ?? ""}</td>

                      <td className="p-3">
                        <div className="text-xs">{t?.assignee_name || ""}</div>
                        <div className="text-xs opacity-70">{t?.assignee_email || ""}</div>
                      </td>

                      <td className="p-3">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="h-8" onClick={() => openEdit(r.id)}>
                            Edit
                          </Button>

                          {r.status === "open" ? (
                            <Button size="sm" onClick={() => toggleDone(r.id, true)} className="h-8">
                              Complete
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => toggleDone(r.id, false)} className="h-8">
                              Reopen
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {runs.length === 0 && !loading ? <div className="text-sm opacity-70 mt-3">No tasks found.</div> : null}
        </CardContent>
      </Card>

      <TaskDrawer
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) setEditItem(null);
        }}
        item={editItem}
        onChanged={fetchRuns}
      />
    </div>
  );
}