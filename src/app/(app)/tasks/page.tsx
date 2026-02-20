"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

  const [sectors, setSectors] = useState<string[]>([]);
  const [assignees, setAssignees] = useState<Array<{ email: string; name?: string }>>([]);

  const today = useMemo(() => localISO(new Date()), []);
  const next7 = useMemo(() => addDaysISO(today, 7), [today]);

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
  }, [sp]);

  function applyCommonFilters(query: any) {
    // ✅ filtro automático por planner (tabela relacionada)
    if (plannerName) query = query.eq("task_templates.planner", plannerName);

    // setor / responsavel (filtros em tabela relacionada)
    if (sector) query = query.eq("task_templates.sector", sector);
    if (assignee) query = query.eq("task_templates.assignee_email", assignee);

    // busca (related table) — task_id e title
    const qq = q.trim();
    if (qq) {
      query = query.or(`title.ilike.%${qq}%,task_id.ilike.%${qq}%`, {
        foreignTable: "task_templates",
      });
    }

    // due/date presets
    if (duePreset === "overdue") {
      query = query.lt("due_date", today);
    } else if (duePreset === "today") {
      query = query.eq("due_date", today);
    } else if (duePreset === "next7") {
      query = query.gte("due_date", today).lte("due_date", next7);
    } else if (duePreset === "month") {
      const a = startOfMonthISO(today);
      const b = endOfMonthISO(today);
      query = query.gte("due_date", a).lte("due_date", b);
    } else if (duePreset === "custom") {
      if (dueFrom) query = query.gte("due_date", dueFrom);
      if (dueTo) query = query.lte("due_date", dueTo);
    }

    return query;
  }

  async function fetchRuns() {
    if (!userId) return;

    setLoading(true);
    setErr("");

    try {
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
            planner
          )
        `
        )
        .eq("user_id", userId)
        .order("due_date", { ascending: true });

      listQuery = applyCommonFilters(listQuery);

      if (status !== "all") listQuery = listQuery.eq("status", status);

      // 2) QUERY DOS KPIs (ignora status pra contadores ficarem “reais”)
      let kpiQuery = supabase
        .from("task_runs")
        .select(
          `
          id,
          due_date,
          status,
          template:task_templates!inner(id, planner)
        `
        )
        .eq("user_id", userId);

      kpiQuery = applyCommonFilters(kpiQuery);

      const [{ data: listData, error: listErr }, { data: kpiData, error: kpiErr }] =
        await Promise.all([listQuery, kpiQuery]);

      if (listErr) throw new Error(listErr.message);
      if (kpiErr) throw new Error(kpiErr.message);

      const normalized: Run[] = (listData as RunRow[]).map((r) => {
        const t = Array.isArray(r.template) ? r.template[0] : r.template;
        return {
          id: r.id,
          template_id: r.template_id,
          due_date: r.due_date,
          done_at: r.done_at,
          status: r.status,
          template: t ?? null,
        };
      });

      const kpiNormalized: KpiRow[] = ((kpiData || []) as any[]).map((r) => ({
        id: r.id,
        due_date: r.due_date,
        status: r.status,
      }));

      setRuns(normalized);
      setKpiRows(kpiNormalized);
    } catch (e: any) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    fetchRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, plannerName, q0, sector0, assignee0, status0, preset0, from0, to0]);

  // KPIs baseados no kpiRows (não no runs) pra não “sumir done”
  const kpis = useMemo(() => {
    const total = kpiRows.length;
    const open = kpiRows.filter((r) => r.status === "open").length;
    const done = kpiRows.filter((r) => r.status === "done").length;
    const overdue = kpiRows.filter((r) => r.status === "open" && r.due_date < today).length;
    const dueToday = kpiRows.filter((r) => r.status === "open" && r.due_date === today).length;
    const next7c = kpiRows.filter((r) => r.status === "open" && r.due_date >= today && r.due_date <= next7).length;
    return { total, open, done, overdue, dueToday, next7: next7c };
  }, [kpiRows, today, next7]);

  function goKpi(kind: "total" | "open" | "overdue" | "today" | "next7" | "done") {
    if (kind === "total") return setUrl({ status: "all", due: "all" });
    if (kind === "open") return setUrl({ status: "open", due: "all" });
    if (kind === "done") return setUrl({ status: "done", due: "all" });
    if (kind === "overdue") return setUrl({ status: "open", due: "overdue" });
    if (kind === "today") return setUrl({ status: "open", due: "today" });
    if (kind === "next7") return setUrl({ status: "open", due: "next7" });
  }

  function kpiActive(kind: "total" | "open" | "overdue" | "today" | "next7" | "done") {
    if (kind === "total") return status === "all" && duePreset === "all";
    if (kind === "open") return status === "open" && duePreset === "all";
    if (kind === "done") return status === "done" && duePreset === "all";
    if (kind === "overdue") return status === "open" && duePreset === "overdue";
    if (kind === "today") return status === "open" && duePreset === "today";
    if (kind === "next7") return status === "open" && duePreset === "next7";
    return false;
  }

  async function toggleDone(runId: string, makeDone: boolean) {
    // otimista (pra ficar rápido)
    setRuns((prev) =>
      prev.map((r) =>
        r.id === runId
          ? {
              ...r,
              status: makeDone ? "done" : "open",
              done_at: makeDone ? new Date().toISOString() : null,
            }
          : r
      )
    );

    setKpiRows((prev) =>
      prev.map((r) =>
        r.id === runId
          ? {
              ...r,
              status: makeDone ? "done" : "open",
            }
          : r
      )
    );

    const patch = makeDone
      ? { status: "done", done_at: new Date().toISOString() }
      : { status: "open", done_at: null };

    const { error } = await supabase.from("task_runs").update(patch).eq("id", runId);
    if (error) {
      await fetchRuns();
      alert("Erro ao atualizar: " + error.message);
    }
  }

  function clearFilters() {
    setUrl({
      q: "",
      sector: "",
      assignee: "",
      status: "open",
      due: "all",
      from: "",
      to: "",
    });
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
        <div>
          <h1 className="text-xl font-semibold">Tasks</h1>
          <div className="text-sm opacity-70">
            Lista de execuções (runs) com filtros estilo ClickUp.
          </div>
        </div>

        {/* KPIs CLICÁVEIS */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => goKpi("total")}
            className={cx(
              "text-xs px-2 py-1 rounded border transition hover:bg-muted/60",
              badgeClass("chip"),
              kpiActive("total") && "ring-2 ring-primary/40"
            )}
            title="Show everything (status=all, due=all)"
          >
            Total: <b>{kpis.total}</b>
          </button>

          <button
            type="button"
            onClick={() => goKpi("open")}
            className={cx(
              "text-xs px-2 py-1 rounded border transition hover:bg-muted/60",
              badgeClass("open"),
              kpiActive("open") && "ring-2 ring-primary/40"
            )}
            title="Show open tasks"
          >
            Open: <b>{kpis.open}</b>
          </button>

          <button
            type="button"
            onClick={() => goKpi("overdue")}
            className={cx(
              "text-xs px-2 py-1 rounded border transition hover:bg-muted/60",
              badgeClass("overdue"),
              kpiActive("overdue") && "ring-2 ring-primary/40"
            )}
            title="Show overdue open tasks"
          >
            Overdue: <b>{kpis.overdue}</b>
          </button>

          <button
            type="button"
            onClick={() => goKpi("today")}
            className={cx(
              "text-xs px-2 py-1 rounded border transition hover:bg-muted/60",
              badgeClass("chip"),
              kpiActive("today") && "ring-2 ring-primary/40"
            )}
            title="Show open tasks due today"
          >
            Today: <b>{kpis.dueToday}</b>
          </button>

          <button
            type="button"
            onClick={() => goKpi("next7")}
            className={cx(
              "text-xs px-2 py-1 rounded border transition hover:bg-muted/60",
              badgeClass("chip"),
              kpiActive("next7") && "ring-2 ring-primary/40"
            )}
            title="Show open tasks due in the next 7 days"
          >
            Next 7d: <b>{kpis.next7}</b>
          </button>

          <button
            type="button"
            onClick={() => goKpi("done")}
            className={cx(
              "text-xs px-2 py-1 rounded border transition hover:bg-muted/60",
              badgeClass("done"),
              kpiActive("done") && "ring-2 ring-primary/40"
            )}
            title="Show done tasks"
          >
            Done: <b>{kpis.done}</b>
          </button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="grid grid-cols-12 gap-2">
            {/* Search */}
            <div className="col-span-12 lg:col-span-4">
              <div className="text-xs opacity-70 mb-1">Search (Task_ID or Title)</div>
              <div className="flex gap-2">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ex: CL-DE-000011 ou conciliação..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setUrl({ q: q.trim() });
                  }}
                />
                <Button variant="secondary" onClick={() => setUrl({ q: q.trim() })}>
                  Apply
                </Button>
              </div>
            </div>

            {/* Sector */}
            <div className="col-span-12 sm:col-span-6 lg:col-span-2">
              <div className="text-xs opacity-70 mb-1">Sector</div>
              <select
                value={sector}
                onChange={(e) => setUrl({ sector: e.target.value })}
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">All</option>
                {sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Assignee */}
            <div className="col-span-12 sm:col-span-6 lg:col-span-3">
              <div className="text-xs opacity-70 mb-1">Assignee</div>
              <select
                value={assignee}
                onChange={(e) => setUrl({ assignee: e.target.value })}
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">All</option>
                {assignees.map((a) => (
                  <option key={a.email} value={a.email}>
                    {a.name ? `${a.name} — ${a.email}` : a.email}
                  </option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="col-span-12 sm:col-span-6 lg:col-span-1">
              <div className="text-xs opacity-70 mb-1">Status</div>
              <select
                value={status}
                onChange={(e) => setUrl({ status: e.target.value })}
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="open">Open</option>
                <option value="done">Done</option>
                <option value="all">All</option>
              </select>
            </div>

            {/* Due preset */}
            <div className="col-span-12 sm:col-span-6 lg:col-span-2">
              <div className="text-xs opacity-70 mb-1">Due</div>
              <select
                value={duePreset}
                onChange={(e) => applyDuePreset(e.target.value)}
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              >
                <option value="all">All</option>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="next7">Next 7 days</option>
                <option value="month">This month</option>
                <option value="custom">Custom range</option>
              </select>
            </div>

            {/* Custom range */}
            {duePreset === "custom" && (
              <div className="col-span-12 lg:col-span-4">
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
            )}

            {/* Actions */}
            <div className="col-span-12 flex items-end gap-2">
              <Button variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
              <Button variant="outline" onClick={fetchRuns} disabled={loading}>
                Refresh
              </Button>
            </div>
          </div>

          {err && (
            <div className="text-sm text-rose-600 border border-rose-200 bg-rose-50 rounded-md p-3">
              {err}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Results</CardTitle>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-sm opacity-70">Loading...</div>
          ) : runs.length === 0 ? (
            <div className="text-sm opacity-70">Nada encontrado com esses filtros.</div>
          ) : (
            <div className="overflow-auto border rounded-md">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3">Status</th>
                    <th className="p-3">Due</th>
                    <th className="p-3">Task_ID</th>
                    <th className="p-3">Title</th>
                    <th className="p-3">Sector</th>
                    <th className="p-3">Frequency</th>
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
                              "text-xs px-2 py-1 rounded border",
                              overdue ? badgeClass("overdue") : badgeClass(r.status)
                            )}
                          >
                            {overdue ? "OVERDUE" : r.status.toUpperCase()}
                          </span>
                        </td>

                        <td className="p-3 font-medium">{r.due_date}</td>

                        <td className="p-3">
                          <span className="font-mono text-xs">{t?.task_id ?? "—"}</span>
                        </td>

                        <td className="p-3">
                          <div className="font-medium">{t?.title ?? "—"}</div>
                          <div className="text-xs opacity-70">
                            {t?.classification ? `Class: ${t.classification}` : ""}
                          </div>
                        </td>

                        <td className="p-3">{t?.sector ?? "—"}</td>
                        <td className="p-3">{t?.frequency ?? "—"}</td>

                        <td className="p-3">
                          <div className="text-sm">{t?.assignee_name || "—"}</div>
                          <div className="text-xs opacity-70">{t?.assignee_email || ""}</div>
                        </td>

                        <td className="p-3">
                          {r.status === "open" ? (
                            <Button size="sm" onClick={() => toggleDone(r.id, true)} className="h-8">
                              Complete
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => toggleDone(r.id, false)}
                              className="h-8"
                            >
                              Reopen
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
