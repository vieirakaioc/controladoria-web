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
  template_id: string;
  due_date: string;
  status: "open" | "in_progress" | "done" | string;
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
  planner?: string | null;
};

type TemplateLite = {
  id: string;
  title: string | null;
  task_id: string | null;
  sector: string | null;
  planner: string | null;
};

type Person = { name: string; email: string; active: boolean };

function tplOf(r: RunRow): Tpl | null {
  const t = (r as any).task_templates;
  if (!t) return null;
  if (Array.isArray(t)) return (t[0] ?? null) as any;
  return t as any;
}

function ymdLocal(dt: Date) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeStatus(s: string) {
  const st = (s || "open").toLowerCase();
  if (st === "in-progress" || st === "progress") return "in_progress";
  return st;
}

export default function BoardPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [userId, setUserId] = useState("");

  // dropdown filters (URL sync)
  const [taskKey, setTaskKey] = useState<string>(() => (sp.get("task") || "").trim());
  const [planner, setPlanner] = useState<string>(() => (sp.get("planner") || "").trim());
  const [sector, setSector] = useState<string>(() => (sp.get("sector") || "").trim());
  const [assigneeEmail, setAssigneeEmail] = useState<string>(() => (sp.get("assignee") || "").trim());

  const [runs, setRuns] = useState<RunRow[]>([]);
  const [templates, setTemplates] = useState<TemplateLite[]>([]);
  const [people, setPeople] = useState<Person[]>([]);

  // edit drawer
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState<RunItem | null>(null);

  // New task drawer
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState<string>(() => ymdLocal(new Date()));
  const [newSector, setNewSector] = useState<string>("Geral");
  const [newAssignee, setNewAssignee] = useState<string>("");
  const [newPlanner, setNewPlanner] = useState<string>("Ad-hoc"); // ✅ default
  const [newPriority, setNewPriority] = useState<string>("");
  const [newFrequency, setNewFrequency] = useState<string>("Pontual");
  const [newDiaUtil, setNewDiaUtil] = useState<string>("");
  const [newClassification, setNewClassification] = useState<string>("Ad-hoc");

  function setUrl(next: Partial<Record<string, string>>) {
    const params = new URLSearchParams(sp.toString());
    Object.entries(next).forEach(([k, v]) => {
      if (!v) params.delete(k);
      else params.set(k, v);
    });
    const qs = params.toString();
    router.replace(`/board${qs ? `?${qs}` : ""}`);
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

  useEffect(() => {
    (async () => {
      const u = await requireUser();
      if (!u) return;
      setUserId(u.id);
      setCheckingAuth(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPeople() {
    if (!userId) return;
    const { data, error } = await supabase
      .from("people")
      .select("name,email,active")
      .eq("user_id", userId)
      .order("name");
    if (!error) setPeople((data || []) as any);
  }

  async function loadTemplates() {
    if (!userId) return;
    const { data, error } = await supabase
      .from("task_templates")
      .select("id,title,task_id,sector,planner")
      .eq("user_id", userId);
    if (!error) setTemplates((data || []) as any);
  }

  async function loadRuns() {
    if (!userId) return;

    setBusy(true);
    setErr("");

    try {
      let qry = supabase
        .from("task_runs")
        .select(
          `
          id, template_id, due_date, status, done_at,
          task_templates!inner(
            task_id, title, sector, frequency, assignee_name, assignee_email, planner
          )
        `
        )
        .eq("user_id", userId)
        .order("due_date", { ascending: true });

      if (planner) qry = qry.eq("task_templates.planner", planner);
      if (sector) qry = qry.eq("task_templates.sector", sector);
      if (assigneeEmail) qry = qry.eq("task_templates.assignee_email", assigneeEmail);

      if (taskKey) {
        const [title, task_id] = taskKey.split("|||");
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
    loadPeople();
    loadTemplates();
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskKey, planner, sector, assigneeEmail]);

  // dropdown options (vem dos templates)
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

  const assigneeOptions = useMemo(() => {
    return people.filter((p) => p.active).map((p) => ({ email: p.email, name: p.name }));
  }, [people]);

  async function setStatus(runId: string, status: string) {
    const upd: any = { status };
    if (status === "done") upd.done_at = new Date().toISOString();
    if (status !== "done") upd.done_at = null;

    const { error } = await supabase.from("task_runs").update(upd).eq("id", runId);
    if (error) return alert(error.message);
    loadRuns();
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

    if (error) return alert(error.message);

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

  async function createNewTask() {
    const u = await requireUser();
    if (!u) return;

    const title = newTitle.trim();
    const due = (newDue || "").trim();
    const sec = (newSector || "").trim() || "Geral";
    const plannerName = (newPlanner || "Ad-hoc").trim();

    if (!title) return alert("Title obrigatório.");
    if (!due) return alert("Due Date obrigatório.");

    const person = people.find((p) => p.email === newAssignee);
    const assignee_name = person?.name ?? null;
    const assignee_email = person?.email ?? null;

    try {
      const { data: existingTpl, error: findErr } = await supabase
        .from("task_templates")
        .select("id")
        .eq("user_id", u.id)
        .eq("planner", plannerName)
        .eq("sector", sec)
        .eq("title", title)
        .limit(1)
        .maybeSingle();

      if (findErr && (findErr as any).code !== "PGRST116") throw new Error(findErr.message);

      let templateId = existingTpl?.id as string | undefined;

      if (!templateId) {
        const dueDt = new Date(`${due}T00:00:00`);
        const dueWeekday = dueDt.getDay();
        const dayOfMonth = dueDt.getDate();

        const diaUtilN = (newDiaUtil || "").trim() ? parseInt(newDiaUtil, 10) : null;
        const useWorkday = diaUtilN !== null && !Number.isNaN(diaUtilN);

        const freq = (newFrequency || "Pontual").trim();
        let schedule_kind: "once" | "daily" | "weekly" | "biweekly" | "monthly" = "once";
        let schedule_every = 1;
        let due_weekday: number | null = null;
        let due_day: number | null = null;
        let workday_only = false;
        let active = false;

        if (freq === "Pontual") {
          schedule_kind = "once";
          active = false;
        } else if (freq === "Diária") {
          schedule_kind = "daily";
          workday_only = true;
          active = true;
        } else if (freq === "Semanal") {
          schedule_kind = "weekly";
          due_weekday = dueWeekday;
          workday_only = true;
          active = true;
        } else if (freq === "Quinzenal") {
          schedule_kind = "biweekly";
          due_weekday = dueWeekday;
          workday_only = true;
          active = true;
        } else if (freq === "Mensal") {
          schedule_kind = "monthly";
          due_day = useWorkday ? diaUtilN : dayOfMonth;
          workday_only = useWorkday ? true : false;
          active = true;
        } else if (freq === "Bimestral") {
          schedule_kind = "monthly";
          schedule_every = 2;
          due_day = useWorkday ? diaUtilN : dayOfMonth;
          workday_only = useWorkday ? true : false;
          active = true;
        } else if (freq === "Trimestral") {
          schedule_kind = "monthly";
          schedule_every = 3;
          due_day = useWorkday ? diaUtilN : dayOfMonth;
          workday_only = useWorkday ? true : false;
          active = true;
        } else if (freq === "Anual") {
          schedule_kind = "monthly";
          schedule_every = 12;
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

      const { error: runErr } = await supabase.from("task_runs").insert({
        user_id: u.id,
        template_id: templateId,
        due_date: due,
        status: "open",
        done_at: null,
        start_date: due,
      });

      if (runErr) throw new Error(runErr.message);

      setNewOpen(false);
      setNewTitle("");
      setNewDue(ymdLocal(new Date()));
      setNewSector("Geral");
      setNewAssignee("");
      setNewPlanner("Ad-hoc");
      setNewPriority("");
      setNewFrequency("Pontual");
      setNewDiaUtil("");
      setNewClassification("Ad-hoc");

      await loadTemplates();
      loadRuns();
    } catch (e: any) {
      alert(e.message || "Erro ao criar.");
    }
  }

  const cols = useMemo(() => {
    const open: RunRow[] = [];
    const prog: RunRow[] = [];
    const done: RunRow[] = [];

    runs.forEach((r) => {
      const st = normalizeStatus(String(r.status));
      if (st === "done") done.push(r);
      else if (st === "in_progress") prog.push(r);
      else open.push(r);
    });

    return { open, in_progress: prog, done };
  }, [runs]);

  if (checkingAuth) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Board</h1>

        <div className="flex items-center gap-2">
        <Button variant="outline" onClick={() => router.push(ROUTES.LIST)}>
           List
        </Button>
        <Button variant="outline" onClick={() => router.push(ROUTES.BOARD)}>
           Board
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
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
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
                    <Input type="number" value={newDiaUtil} onChange={(e) => setNewDiaUtil(e.target.value)} />
                  </div>
                  <div>
                    <div className="text-xs opacity-70 mb-1">Classification</div>
                    <Input value={newClassification} onChange={(e) => setNewClassification(e.target.value)} />
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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

            <div>
              <div className="text-xs opacity-70 mb-1">Assignee</div>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={assigneeEmail}
                onChange={(e) => {
                  setAssigneeEmail(e.target.value);
                  setUrl({ assignee: e.target.value });
                }}
              >
                <option value="">All</option>
                {assigneeOptions.map((p) => (
                  <option key={p.email} value={p.email}>
                    {p.name} ({p.email})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setTaskKey("");
                setPlanner("");
                setSector("");
                setAssigneeEmail("");
                router.replace("/board");
              }}
            >
              Clear
            </Button>
          </div>

          {err ? <div className="text-sm text-rose-600">{err}</div> : null}
        </CardContent>
      </Card>

      {/* Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(["open", "in_progress", "done"] as const).map((key) => {
          const title = key === "open" ? "Open" : key === "in_progress" ? "In progress" : "Done";
          const list = cols[key];

          return (
            <Card key={key}>
              <CardHeader className="py-3">
                <CardTitle className="text-sm opacity-80">
                  {title} {busy ? <span className="opacity-60">(loading)</span> : null}
                </CardTitle>
              </CardHeader>

              <CardContent className="pb-4 space-y-3">
                {list.map((r) => {
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
                          {st !== "open" ? (
                            <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "open")}>
                              To open
                            </Button>
                          ) : null}

                          {st !== "in_progress" ? (
                            <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "in_progress")}>
                              To progress
                            </Button>
                          ) : null}

                          {st !== "done" ? (
                            <Button size="sm" onClick={() => setStatus(r.id, "done")}>
                              Done
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "open")}>
                              Reopen
                            </Button>
                          )}

                          <Button size="sm" variant="outline" onClick={() => openEdit(r.id)}>
                            Edit
                          </Button>
                        </div>
                      </div>

                      <div className="text-xs opacity-80 flex flex-wrap gap-2">
                        {t?.planner ? <span className="px-2 py-1 rounded bg-muted/40">{t.planner}</span> : null}
                        {t?.sector ? <span className="px-2 py-1 rounded bg-muted/40">{t.sector}</span> : null}
                        {t?.frequency ? <span className="px-2 py-1 rounded bg-muted/40">{t.frequency}</span> : null}
                        {t?.assignee_name ? <span className="px-2 py-1 rounded bg-muted/40">{t.assignee_name}</span> : null}
                      </div>
                    </div>
                  );
                })}

                {list.length === 0 ? <div className="text-xs opacity-60">—</div> : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <TaskDrawer
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) setEditItem(null);
        }}
        item={editItem}
        onChanged={() => {
          loadTemplates();
          loadRuns();
        }}
      />
    </div>
  );
}