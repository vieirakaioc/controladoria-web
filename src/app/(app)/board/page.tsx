"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import TaskDrawer, { RunItem } from "@/components/tasks/TaskDrawer";

import { ROUTES } from "@/lib/routes";

type RunRow = {
  id: string;
  user_id?: string;
  template_id: string;
  due_date: string; // YYYY-MM-DD
  status: "open" | "in_progress" | "done" | string;
  done_at: string | null;
  task_templates?: any; // relation pode vir objeto OU array
};

type Tpl = {
  id?: string;
  task_id: string | null;
  title: string;
  sector: string | null;
  frequency: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  planner?: string | null; // usado no filtro automático
};

type TemplateLite = {
  id: string;
  title: string | null;
  task_id: string | null;
  sector: string | null;
  planner: string | null;
};

type Person = {
  name: string;
  email: string;
  active: boolean;
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

  const due = dueDate;
  const dueDt = toLocalDate(due);
  const todayDt = toLocalDate(todayYMD);

  const next7 = addDays(todayDt, 7);

  if (dueDt < todayDt) return "overdue";
  if (due === todayYMD) return "today";
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

export default function KanbanStatusPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [busy, setBusy] = useState(false);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userId, setUserId] = useState<string>("");

  const [err, setErr] = useState("");

  // filtros (agora tudo select)
  const [planner, setPlanner] = useState<string>(() => (sp.get("planner") || "").trim());
  const [sector, setSector] = useState<string>(() => (sp.get("sector") || "").trim());
  const [taskKey, setTaskKey] = useState<string>(() => (sp.get("task") || "").trim());

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [templates, setTemplates] = useState<TemplateLite[]>([]);
  const [people, setPeople] = useState<Person[]>([]);

  // board filters
  const [statusFilter, setStatusFilter] = useState("all"); // all|open|in_progress|done
  const [dueFilter, setDueFilter] = useState("all"); // all|overdue|today|next7|later

  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<RunItem | null>(null);

  // New task drawer
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState<string>(() => ymdLocal(new Date()));
  const [newSector, setNewSector] = useState<string>("Geral");
  const [newAssignee, setNewAssignee] = useState<string>(""); // email
  const [newPlanner, setNewPlanner] = useState<string>("Ad-hoc"); // ✅ padrão
  const [newPriority, setNewPriority] = useState<string>("");
  const [newFrequency, setNewFrequency] = useState<string>("Pontual");
  const [newDiaUtil, setNewDiaUtil] = useState<string>("");
  const [newClassification, setNewClassification] = useState<string>("Ad-hoc");

  function readPlannerFromCtx() {
    const qp = (sp.get("planner") || "").trim();
    if (qp) return qp;

    try {
      const ls = (localStorage.getItem("ctx.plannerName") || "").trim();
      return ls;
    } catch {
      return "";
    }
  }

  function persistPlannerToCtx(v: string) {
    try {
      localStorage.setItem("ctx.plannerName", v);
    } catch {}
  }

  useEffect(() => {
    const p = readPlannerFromCtx();
    if (p && !planner) setPlanner(p);
    if (p && sp.get("planner")) persistPlannerToCtx(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  function setUrl(next: Partial<Record<string, string>>) {
    const params = new URLSearchParams(sp.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (!v) params.delete(k);
      else params.set(k, v);
    });
    const qs = params.toString();
    router.replace(`/kanban${qs ? `?${qs}` : ""}`);
  }

  async function requireUser() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setErr(error.message);
      return null;
    }
    const u = data.session?.user ?? null;
    if (!u) {
      router.replace("/login");
      return null;
    }
    return u;
  }

  async function checkSession() {
    const u = await requireUser();
    if (!u) return;
    setUserId(u.id);
    setCheckingAuth(false);
  }

  useEffect(() => {
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPeople() {
    if (!userId) return;
    const { data, error } = await supabase
      .from("people")
      .select("name,email,active")
      .eq("user_id", userId)
      .order("name");
    if (error) return;
    setPeople((data || []) as any);
  }

  // ✅ carrega as opções dos dropdowns a partir dos templates (não depende do filtro)
  async function loadTemplates() {
    if (!userId) return;

    const { data, error } = await supabase
      .from("task_templates")
      .select("id,title,task_id,sector,planner")
      .eq("user_id", userId);

    if (error) return;
    setTemplates((data || []) as any);
  }

  async function load() {
    if (!userId) return;

    setBusy(true);
    setErr("");

    try {
      let qry = supabase
        .from("task_runs")
        .select(
          `
          id,
          template_id,
          due_date,
          status,
          done_at,
          task_templates!inner(
            task_id,
            title,
            sector,
            frequency,
            assignee_name,
            assignee_email,
            planner
          )
        `
        )
        .eq("user_id", userId)
        .order("due_date", { ascending: true });

      const pp = planner.trim();
      if (pp) qry = qry.eq("task_templates.planner", pp);

      const ss = sector.trim();
      if (ss) qry = qry.eq("task_templates.sector", ss);

      const tk = taskKey.trim();
      if (tk) {
        const [title, task_id] = tk.split("|||");
        if (task_id) qry = qry.eq("task_templates.task_id", task_id);
        else if (title) qry = qry.eq("task_templates.title", title);
      }

      const { data, error } = await qry;
      if (error) throw error;

      setRuns((data || []) as any);
    } catch (e: any) {
      setErr(e.message || "Erro ao carregar.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!userId) return;
    load();
    loadPeople();
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskKey, planner, sector]);

  async function setStatus(runId: string, status: string) {
    const upd: any = { status };
    if (status === "done") upd.done_at = new Date().toISOString();
    if (status !== "done") upd.done_at = null;

    const { error } = await supabase.from("task_runs").update(upd).eq("id", runId);
    if (error) {
      alert(error.message);
      return;
    }
    load();
  }

  async function openEdit(runId: string) {
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
      alert(error.message);
      return;
    }

    const t: any = (data as any)?.template ?? null;

    const item: RunItem = {
      id: data.id,
      template_id: data.template_id,
      due_date: data.due_date,
      done_at: data.done_at,
      status: (data.status as any) === "done" ? "done" : "open",
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

  // ✅ dropdown options (vem dos templates)
  const plannerOptions = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => {
      const p = (t.planner || "").trim();
      if (p) set.add(p);
    });
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (!arr.includes("Ad-hoc")) arr.unshift("Ad-hoc");
    return arr;
  }, [templates]);

  const sectorOptions = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => {
      const s = (t.sector || "").trim();
      if (s) set.add(s);
    });
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    if (!arr.includes("Geral")) arr.unshift("Geral");
    return arr;
  }, [templates]);

  const taskOptions = useMemo(() => {
    const map = new Map<string, { title: string; task_id: string }>();
    templates.forEach((t) => {
      const title = String(t.title || "").trim();
      const task_id = String(t.task_id || "").trim();
      if (!title && !task_id) return;

      const key = `${title}|||${task_id}`;
      if (!map.has(key)) map.set(key, { title, task_id });
    });

    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  }, [templates]);

  async function createNewTask() {
    const u = await requireUser();
    if (!u) return;

    const title = newTitle.trim();
    const due = (newDue || "").trim();
    const sec = (newSector || "").trim() || "Geral";

    if (!title) {
      alert("Title obrigatório.");
      return;
    }
    if (!due) {
      alert("Due Date obrigatório.");
      return;
    }

    const person = people.find((p) => p.email === newAssignee);
    const assignee_name = person?.name ?? null;
    const assignee_email = person?.email ?? null;

    // ✅ Planner SEMPRE dropdown e default Ad-hoc
    const plannerName = (newPlanner || "Ad-hoc").trim();

    try {
      // 1) tenta reaproveitar template (planner/sector/title)
      const { data: existingTpl, error: findErr } = await supabase
        .from("task_templates")
        .select("id")
        .eq("user_id", u.id)
        .eq("planner", plannerName)
        .eq("sector", sec)
        .eq("title", title)
        .limit(1)
        .maybeSingle();

      if (findErr && (findErr as any).code !== "PGRST116") {
        throw new Error(findErr.message);
      }

      let templateId = existingTpl?.id as string | undefined;

      // 2) se não existir, cria template com os campos do ListBox
      if (!templateId) {
        const dueDt = toLocalDate(due);
        const dueWeekday = dueDt.getDay(); // 0-6 (Sun-Sat)
        const dayOfMonth = dueDt.getDate(); // 1-31

        const diaUtilN = (newDiaUtil || "").trim() ? parseInt(newDiaUtil, 10) : null;

        // regra: Dia útil em branco => usa a data da atividade (dia do mês)
        const useWorkday = diaUtilN !== null && !Number.isNaN(diaUtilN);

        // mapeia frequência -> schedule
        const freq = (newFrequency || "Pontual").trim();
        let schedule_kind: "once" | "daily" | "weekly" | "biweekly" | "monthly" = "once";
        let schedule_every = 1;
        let due_weekday: number | null = null;
        let due_day: number | null = null;
        let workday_only = false;
        let active = false;

        if (freq === "Pontual") {
          schedule_kind = "once";
          schedule_every = 1;
          due_weekday = null;
          due_day = null;
          workday_only = false;
          active = false;
        } else if (freq === "Diária") {
          schedule_kind = "daily";
          schedule_every = 1;
          due_weekday = null;
          due_day = null;
          workday_only = true;
          active = true;
        } else if (freq === "Semanal") {
          schedule_kind = "weekly";
          schedule_every = 1;
          due_weekday = dueWeekday;
          due_day = null;
          workday_only = true;
          active = true;
        } else if (freq === "Quinzenal") {
          schedule_kind = "biweekly";
          schedule_every = 1;
          due_weekday = dueWeekday;
          due_day = null;
          workday_only = true;
          active = true;
        } else if (freq === "Mensal") {
          schedule_kind = "monthly";
          schedule_every = 1;
          due_weekday = null;
          due_day = useWorkday ? diaUtilN : dayOfMonth;
          workday_only = useWorkday ? true : false;
          active = true;
        } else if (freq === "Bimestral") {
          schedule_kind = "monthly";
          schedule_every = 2;
          due_weekday = null;
          due_day = useWorkday ? diaUtilN : dayOfMonth;
          workday_only = useWorkday ? true : false;
          active = true;
        } else if (freq === "Trimestral") {
          schedule_kind = "monthly";
          schedule_every = 3;
          due_weekday = null;
          due_day = useWorkday ? diaUtilN : dayOfMonth;
          workday_only = useWorkday ? true : false;
          active = true;
        } else if (freq === "Anual") {
          schedule_kind = "monthly";
          schedule_every = 12;
          due_weekday = null;
          due_day = useWorkday ? diaUtilN : dayOfMonth;
          workday_only = useWorkday ? true : false;
          active = true;
        }

        const tplPayload: any = {
          user_id: u.id,
          planner: plannerName,
          sector: sec,
          title,

          task_type: "ad-hoc",
          notes: null,
          priority: newPriority ? parseInt(newPriority, 10) : null,
          frequency: freq,
          classification: (newClassification || "Ad-hoc").trim() || null,

          assignee_name,
          assignee_email,

          // não regenerar por Generate Runs (aqui vira automático se frequência != Pontual)
          active,

          workday_only,
          schedule_kind,
          schedule_every,
          due_weekday,
          due_day,
          anchor_date: due,

          task_id: null,
        };

        const { data: tplIns, error: tplErr } = await supabase
          .from("task_templates")
          .insert(tplPayload)
          .select("id")
          .single();

        if (tplErr) throw new Error(tplErr.message);
        templateId = tplIns.id;
      }

      // 3) cria a task_run do dia
      const { error: runErr } = await supabase.from("task_runs").insert({
        user_id: u.id,
        template_id: templateId,
        due_date: due,
        status: "open",
        done_at: null,
        start_date: due, // compatibilidade
      });

      if (runErr) throw new Error(runErr.message);

      setNewOpen(false);
      setNewTitle("");
      setNewDue(ymdLocal(new Date()));
      setNewSector("Geral");
      setNewAssignee("");
      setNewPlanner("Ad-hoc"); // ✅ volta pro padrão
      setNewPriority("");
      setNewFrequency("Pontual");
      setNewDiaUtil("");
      setNewClassification("Ad-hoc");

      await loadTemplates(); // atualiza dropdowns
      load();
    } catch (e: any) {
      alert(e.message || "Erro ao criar.");
    }
  }

  const filteredRuns = useMemo(() => {
    return runs.filter((r) => {
      const st = normalizeStatus(String(r.status));
      const bucket = dueBucket(r.due_date);

      const okStatus = statusFilter === "all" ? true : st === statusFilter;
      const okDue = dueFilter === "all" ? true : bucket === dueFilter;

      return okStatus && okDue;
    });
  }, [runs, statusFilter, dueFilter]);

  const stats = useMemo(() => {
    let open = 0;
    let prog = 0;
    let done = 0;
    let overdue = 0;

    const today = ymdLocal(new Date());

    filteredRuns.forEach((r) => {
      const st = normalizeStatus(String(r.status));
      if (st === "done") done++;
      else if (st === "in_progress") prog++;
      else open++;

      if (st !== "done" && r.due_date < today) overdue++;
    });

    return { open, prog, done, overdue, total: filteredRuns.length };
  }, [filteredRuns]);

  // agrupamento
  const buckets = useMemo(() => ["overdue", "today", "next7", "later"] as const, []);
  const grouped = useMemo(() => {
    const g: Record<string, RunRow[]> = { overdue: [], today: [], next7: [], later: [] };
    filteredRuns.forEach((r) => g[dueBucket(r.due_date)].push(r));
    return g;
  }, [filteredRuns]);

  if (checkingAuth) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">Kanban</h1>
          {planner ? <span className="text-xs px-2 py-1 rounded border bg-muted/40">Planner: {planner}</span> : null}
        </div>

        <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => router.push(ROUTES.LIST)}>
          List
        </Button>
        <Button variant="outline" onClick={() => router.push(ROUTES.KANBAN)}>
          Kanban
        </Button>

          <Sheet open={newOpen} onOpenChange={setNewOpen}>
            <SheetTrigger asChild>
              <Button>New task</Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-full sm:max-w-xl">
              <SheetHeader>
                <SheetTitle>New task</SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="text-xs opacity-70 mb-1">Title</div>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Ex: Conciliação bancos"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-xs opacity-70 mb-1">Due date</div>
                    <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
                  </div>

                  <div>
                    <div className="text-xs opacity-70 mb-1">Sector</div>
                    <select
                      className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                      value={newSector}
                      onChange={(e) => setNewSector(e.target.value)}
                    >
                      {sectorOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="text-xs opacity-70 mb-1">Assignee</div>
                  <select
                    className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                    value={newAssignee}
                    onChange={(e) => setNewAssignee(e.target.value)}
                  >
                    <option value="">(none)</option>
                    {people
                      .filter((p) => p.active)
                      .map((p) => (
                        <option key={p.email} value={p.email}>
                          {p.name} ({p.email})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="mt-3 space-y-3">
                  <div>
                    <div className="text-xs opacity-70 mb-1">Planner</div>
                    <select
                      className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                      value={newPlanner}
                      onChange={(e) => setNewPlanner(e.target.value)}
                    >
                      {plannerOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs opacity-70 mb-1">Priority</div>
                      <select
                        className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value)}
                      >
                        <option value="">—</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                      </select>
                    </div>

                    <div>
                      <div className="text-xs opacity-70 mb-1">Frequency</div>
                      <select
                        className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                        value={newFrequency}
                        onChange={(e) => setNewFrequency(e.target.value)}
                      >
                        <option value="Pontual">Pontual</option>
                        <option value="Diária">Diária</option>
                        <option value="Semanal">Semanal</option>
                        <option value="Quinzenal">Quinzenal</option>
                        <option value="Mensal">Mensal</option>
                        <option value="Bimestral">Bimestral</option>
                        <option value="Trimestral">Trimestral</option>
                        <option value="Anual">Anual</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-xs opacity-70 mb-1">Dia útil (N)</div>
                      <Input
                        type="number"
                        value={newDiaUtil}
                        onChange={(e) => setNewDiaUtil(e.target.value)}
                        placeholder="(blank = use due date)"
                      />
                    </div>

                    <div>
                      <div className="text-xs opacity-70 mb-1">Classification</div>
                      <Input
                        value={newClassification}
                        onChange={(e) => setNewClassification(e.target.value)}
                        placeholder="Ex: Rotina / Fechamento / Ad-hoc"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={createNewTask}>Create</Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm opacity-80">Filters</CardTitle>
        </CardHeader>

        <CardContent className="pb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* TASK */}
            <div>
              <div className="text-xs opacity-70 mb-1">Task</div>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={taskKey}
                onChange={(e) => {
                  setTaskKey(e.target.value);
                  setUrl({ task: e.target.value });
                }}
              >
                <option value="">All</option>
                {taskOptions.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.title || "(no title)"}{t.task_id ? ` — ${t.task_id}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* PLANNER */}
            <div>
              <div className="text-xs opacity-70 mb-1">Planner</div>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={planner}
                onChange={(e) => {
                  setPlanner(e.target.value);
                  setUrl({ planner: e.target.value });
                }}
              >
                <option value="">All</option>
                {plannerOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* SECTOR */}
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
                {sectorOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="text-xs opacity-70 mb-1">Status</div>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <div className="text-xs opacity-70 mb-1">Due</div>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={dueFilter}
                onChange={(e) => setDueFilter(e.target.value)}
              >
                <option value="all">All</option>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="next7">Next 7</option>
                <option value="later">Later</option>
              </select>
            </div>
          </div>

          {err ? <div className="text-sm text-rose-600">{err}</div> : null}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="flex flex-wrap gap-2">
        <StatPill label="Total" value={stats.total} tone="neutral" />
        <StatPill label="Open" value={stats.open} tone="warn" />
        <StatPill label="In progress" value={stats.prog} tone="neutral" />
        <StatPill label="Done" value={stats.done} tone="success" />
        <StatPill label="Overdue" value={stats.overdue} tone="danger" />
      </div>

      {/* Board */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {buckets.map((b) => (
          <Card key={b}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm capitalize opacity-80">
                {b} {busy ? <span className="opacity-60">(loading)</span> : null}
              </CardTitle>
            </CardHeader>

            <CardContent className="pb-4 space-y-3">
              {(grouped[b] || []).map((r) => {
                const t = tplOf(r);
                const st = normalizeStatus(String(r.status));

                return (
                  <div key={r.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs opacity-70 tabular-nums">{r.due_date}</div>
                        <div className="font-medium leading-snug break-words">{t?.title || "Sem título"}</div>
                        <div className="text-xs opacity-70">{t?.task_id || ""}</div>
                      </div>

                      <div className="flex flex-col gap-2 items-end">
                        {st === "open" ? (
                          <Button size="sm" onClick={() => setStatus(r.id, "in_progress")}>
                            Start
                          </Button>
                        ) : null}

                        {st === "in_progress" ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "open")}>
                              Back
                            </Button>
                            <Button size="sm" onClick={() => setStatus(r.id, "done")}>
                              Complete
                            </Button>
                          </>
                        ) : null}

                        <Button size="sm" variant="outline" onClick={() => openEdit(r.id)}>
                          Edit
                        </Button>

                        {st === "done" ? (
                          <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "open")}>
                            Reopen
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="text-xs opacity-80 flex flex-wrap gap-2">
                      {t?.sector ? <span className="px-2 py-1 rounded bg-muted/40">{t.sector}</span> : null}
                      {t?.frequency ? <span className="px-2 py-1 rounded bg-muted/40">{t.frequency}</span> : null}
                      {t?.assignee_name ? <span className="px-2 py-1 rounded bg-muted/40">{t.assignee_name}</span> : null}
                    </div>
                  </div>
                );
              })}

              {(grouped[b] || []).length === 0 ? <div className="text-xs opacity-60">—</div> : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <TaskDrawer
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) setEditItem(null);
        }}
        item={editItem}
        onChanged={load}
      />
    </div>
  );
}