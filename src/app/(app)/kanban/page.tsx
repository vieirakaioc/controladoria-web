"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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
  task_id: string | null;
  title: string;
  sector: string | null;
  frequency: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
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

  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [people, setPeople] = useState<Person[]>([]);

  // filtros (estilo /board)
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("all");
  const [assigneeEmail, setAssigneeEmail] = useState("all"); // ✅ agora filtra por email
  const [statusFilter, setStatusFilter] = useState("all"); // all|open|in_progress|done
  const [dueFilter, setDueFilter] = useState("all"); // all|overdue|today|next7|later

  // New task drawer
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState<string>(() => ymdLocal(new Date()));
  const [newSector, setNewSector] = useState<string>("Geral");
  const [newAssignee, setNewAssignee] = useState<string>(""); // email

  async function requireUser() {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    if (!u) {
      router.replace("/login");
      return null;
    }
    return u;
  }

  async function loadPeople(userId: string) {
    // people ativos
    const { data, error } = await supabase
      .from("people")
      .select("name,email,active")
      .eq("user_id", userId)
      .eq("active", true)
      .order("name", { ascending: true });

    if (!error) setPeople((data as any) ?? []);
  }

  async function load() {
    setBusy(true);
    try {
      const u = await requireUser();
      if (!u) return;

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
        .eq("user_id", u.id) // ✅ importante
        .order("due_date", { ascending: true })
        .limit(5000);

      if (error) throw new Error(error.message);

      setRuns((data as any) ?? []);
      await loadPeople(u.id);
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
    for (const r of runs) {
      const t = tplOf(r);
      if (t?.sector) sectors.add(t.sector);
    }

    return {
      sectors: Array.from(sectors).sort(),
    };
  }, [runs]);

  function clearFilters() {
    setSearch("");
    setSector("all");
    setAssigneeEmail("all");
    setStatusFilter("all");
    setDueFilter("all");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return runs.filter((r) => {
      const t = tplOf(r);

      // sector
      if (sector !== "all" && (t?.sector || "") !== sector) return false;

      // assignee (por email)
      const email = (t?.assignee_email || "").trim().toLowerCase();
      if (assigneeEmail !== "all" && email !== assigneeEmail.toLowerCase()) return false;

      // status
      const stNorm = normalizeStatus(r.status || "open");
      if (statusFilter !== "all" && stNorm !== statusFilter) return false;

      // due bucket
      if (dueFilter !== "all") {
        const b = dueBucket(r.due_date);
        if (b !== dueFilter) return false;
      }

      // search
      if (!q) return true;
      const taskId = (t?.task_id || "").toLowerCase();
      const title = (t?.title || "").toLowerCase();
      return taskId.includes(q) || title.includes(q);
    });
  }, [runs, search, sector, assigneeEmail, statusFilter, dueFilter]);

  const stats = useMemo(() => {
    let open = 0;
    let done = 0;
    let overdue = 0;
    let today = 0;
    let next7 = 0;

    for (const r of filtered) {
      const stNorm = normalizeStatus(r.status || "open");
      const isDone = stNorm === "done";

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

  const buckets = useMemo(() => {
    const open: RunRow[] = [];
    const inprog: RunRow[] = [];
    const done: RunRow[] = [];

    for (const r of filtered) {
      const st = normalizeStatus(r.status || "open");
      if (st === "done") done.push(r);
      else if (st === "in_progress") inprog.push(r);
      else open.push(r);
    }

    return { open, inprog, done };
  }, [filtered]);

  async function setStatus(runId: string, next: "open" | "in_progress" | "done") {
    const u = await requireUser();
    if (!u) return;

    const patch: any = { status: next };
    if (next === "done") patch.done_at = new Date().toISOString();
    if (next !== "done") patch.done_at = null;

    const { error } = await supabase
      .from("task_runs")
      .update(patch)
      .eq("id", runId)
      .eq("user_id", u.id);

    if (error) {
      alert(error.message);
      return;
    }

    setRuns((prev) => prev.map((r) => (r.id === runId ? { ...r, ...patch } : r)));
  }

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

    try {
      // 1) tenta reaproveitar template (planner/sector/title)
      const planner = "Ad-hoc";

      const { data: existingTpl, error: findErr } = await supabase
        .from("task_templates")
        .select("id")
        .eq("user_id", u.id)
        .eq("planner", planner)
        .eq("sector", sec)
        .eq("title", title)
        .limit(1)
        .maybeSingle();

      if (findErr && (findErr as any).code !== "PGRST116") {
        throw new Error(findErr.message);
      }

      let templateId = existingTpl?.id as string | undefined;

      // 2) se não existir, cria template once (inactive)
      if (!templateId) {
        const tplPayload: any = {
          user_id: u.id,
          planner,
          sector: sec,
          title,

          task_type: "ad-hoc",
          notes: null,
          priority: null,
          frequency: "Pontual",
          classification: "Ad-hoc",

          assignee_name,
          assignee_email,

          // ✅ não regenerar por Generate Runs
          active: false,

          workday_only: false,
          schedule_kind: "once",
          schedule_every: 1,
          due_weekday: null,
          due_day: null,
          anchor_date: due,

          task_id: null, // trigger gera
        };

        const { data: insTpl, error: insErr } = await supabase
          .from("task_templates")
          .insert(tplPayload)
          .select("id")
          .single();

        if (insErr) throw new Error(insErr.message);
        templateId = insTpl.id;
      }

      // 3) cria a run (due_date obrigatório)
      const runPayload: any = {
        user_id: u.id,
        template_id: templateId,
        due_date: due,
        start_date: null,
        done_at: null,
        status: "open",
        notes: null,
      };

      const { error: runErr } = await supabase.from("task_runs").insert(runPayload);
      if (runErr) throw new Error(runErr.message);

      // reload
      setNewOpen(false);
      setNewTitle("");
      setNewDue(ymdLocal(new Date()));
      setNewSector(sec);
      setNewAssignee("");

      await load();
    } catch (e: any) {
      alert(e?.message || String(e));
    }
  }

  function Column({
    title,
    items,
    tone,
  }: {
    title: string;
    items: RunRow[];
    tone?: "muted" | "info" | "success";
  }) {
    return (
      <div className="flex-1 min-w-[300px]">
        <div className="sticky top-0 z-10">
          <div
            className={cx(
              "flex items-center justify-between rounded-lg border px-3 py-2 bg-background",
              tone === "info" && "border-blue-200",
              tone === "success" && "border-emerald-200"
            )}
          >
            <div className="font-medium">{title}</div>
            <div className="text-xs opacity-70">{items.length}</div>
          </div>
        </div>

        <div className="mt-2 h-[calc(100vh-360px)] overflow-y-auto pr-1 space-y-2">
          {items.map((r) => {
            const t = tplOf(r);
            const ass = (t?.assignee_name || t?.assignee_email || "").trim();
            const st = normalizeStatus(r.status || "open");

            return (
              <Card key={r.id} className="shadow-sm">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs opacity-70">
                        {t?.task_id || "—"} • {r.due_date}
                      </div>
                      <div className="font-medium leading-snug break-words">
                        {t?.title || "Sem título"}
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      {st === "open" && (
                        <Button size="sm" variant="secondary" onClick={() => setStatus(r.id, "in_progress")}>
                          Start
                        </Button>
                      )}

                      {st === "in_progress" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "open")}>
                            Back
                          </Button>
                          <Button size="sm" onClick={() => setStatus(r.id, "done")}>
                            Complete
                          </Button>
                        </>
                      )}

                      {st === "done" && (
                        <Button size="sm" variant="outline" onClick={() => setStatus(r.id, "open")}>
                          Reopen
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="text-xs opacity-80 flex flex-wrap gap-2">
                    <span className="px-2 py-1 rounded bg-muted">
                      {t?.sector ? `Sector: ${t.sector}` : "Sector: —"}
                    </span>
                    <span className="px-2 py-1 rounded bg-muted">{t?.frequency || "—"}</span>
                    <span className="px-2 py-1 rounded bg-muted">{ass || "Sem responsável"}</span>
                    <span className="px-2 py-1 rounded bg-muted">Due: {dueBucket(r.due_date)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {items.length === 0 ? (
            <div className="text-sm opacity-60 px-1 py-4">Nada aqui.</div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Kanban</h1>
          <div className="text-sm opacity-70">
            Kanban por status (Open / In progress / Done) com filtros estilo Board.
          </div>
        </div>

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
            <Button variant="outline" onClick={() => router.push("/board")}>
              Go to Board (Due)
            </Button>

            {/* ✅ New task → cria Run + Template once */}
            <Sheet open={newOpen} onOpenChange={setNewOpen}>
              <SheetTrigger asChild>
                <Button>New task</Button>
              </SheetTrigger>

              <SheetContent side="right" className="w-[420px] sm:w-[480px]">
                <SheetHeader>
                  <SheetTitle>New task</SheetTitle>
                </SheetHeader>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="text-xs opacity-70 mb-1">Title *</div>
                    <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Reunião Gerencial" />
                  </div>

                  <div>
                    <div className="text-xs opacity-70 mb-1">Due Date *</div>
                    <Input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
                  </div>

                  <div>
                    <div className="text-xs opacity-70 mb-1">Sector</div>
                    <select
                      className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                      value={newSector}
                      onChange={(e) => setNewSector(e.target.value)}
                    >
                      {/* mantém padrão */}
                      <option value="Geral">Geral</option>
                      {filters.sectors.map((s) => (
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
                      value={newAssignee}
                      onChange={(e) => setNewAssignee(e.target.value)}
                    >
                      <option value="">—</option>
                      {people.map((p) => (
                        <option key={p.email} value={p.email}>
                          {p.name} — {p.email}
                        </option>
                      ))}
                    </select>
                    <div className="text-[11px] opacity-60 mt-1">
                      (Email é puxado automaticamente pelo cadastro em People)
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button onClick={createNewTask}>Create</Button>
                    <Button variant="outline" onClick={() => setNewOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>

        <CardContent className="grid gap-3 md:grid-cols-12 items-end">
          <div className="md:col-span-4">
            <div className="text-xs opacity-70 mb-1">Search (Task_ID or Title)</div>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ex: CL-DE-000011 ou conciliação..."
            />
          </div>

          <div className="md:col-span-2">
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
              value={assigneeEmail}
              onChange={(e) => setAssigneeEmail(e.target.value)}
            >
              <option value="all">All</option>
              {people.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name} — {p.email}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-1">
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

          <div className="md:col-span-2">
            <div className="text-xs opacity-70 mb-1">Due</div>
            <select
              className="w-full h-9 rounded-md border bg-background px-2 text-sm"
              value={dueFilter}
              onChange={(e) => setDueFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="next7">Next 7d</option>
              <option value="later">Later</option>
            </select>
          </div>

          <div className="md:col-span-12 flex gap-2 pt-1">
            <Button variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
            <Button variant="outline" onClick={load} disabled={busy}>
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-muted/20 p-3">
        <div className="flex gap-4 overflow-x-auto pb-2 items-start w-full">
          <Column title="Open" items={buckets.open} />
          <Column title="In progress" items={buckets.inprog} tone="info" />
          <Column title="Done" items={buckets.done} tone="success" />
        </div>
      </div>
    </div>
  );
}