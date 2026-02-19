"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Template = {
  id: string;
  task_id: string | null;
  title: string;
  sector: string | null;
  task_type: string | null;
  frequency: string | null;
  priority: number | null;
  workday_only: boolean;

  schedule_kind: string | null; // daily | weekly | biweekly | monthly | once
  schedule_every: number | null;
  due_day: number | null; // monthly: N do dia útil (quando workday_only=true) OU dia do mês (quando workday_only=false)
  due_weekday: number | null; // 1..7 (Mon..Sun)
  anchor_date: string | null; // YYYY-MM-DD
  active: boolean;
};

type Run = {
  id: string;
  user_id: string;
  template_id: string;
  due_date: string | null;
  start_date: string | null;
  done_at: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  task_templates?: Template | null;
};

function isoToDate(iso: string) {
  // sempre UTC pra não dar treta
  return new Date(`${iso}T00:00:00Z`);
}
function dateToISO(d: Date) {
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return dateToISO(new Date());
}
function addDaysISO(iso: string, days: number) {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToISO(d);
}
function weekday1to7(iso: string) {
  const d = isoToDate(iso);
  const js = d.getUTCDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js; // 1=Mon..7=Sun
}
function isWorkday(iso: string) {
  const wd = weekday1to7(iso);
  return wd >= 1 && wd <= 5;
}
function daysBetween(aISO: string, bISO: string) {
  const a = isoToDate(aISO).getTime();
  const b = isoToDate(bISO).getTime();
  return Math.floor((b - a) / 86400000);
}
function startOfWeekMondayISO(iso: string) {
  const wd = weekday1to7(iso); // 1..7
  return addDaysISO(iso, -(wd - 1));
}
function weeksBetween(aISO: string, bISO: string) {
  const a = startOfWeekMondayISO(aISO);
  const b = startOfWeekMondayISO(bISO);
  return Math.floor(daysBetween(a, b) / 7);
}
function daysInMonthUTC(year: number, month1to12: number) {
  // month1to12: 1..12
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}
function nthWorkdayOfMonthISO(year: number, month1to12: number, n: number) {
  let count = 0;
  const dim = daysInMonthUTC(year, month1to12);
  for (let day = 1; day <= dim; day++) {
    const iso = `${year}-${String(month1to12).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (isWorkday(iso)) {
      count++;
      if (count === n) return iso;
    }
  }
  return null;
}
function occurrenceOfWeekdayInMonth(iso: string, targetWeekday: number) {
  // iso é o dia candidato; conta quantas vezes aquele weekday apareceu no mês até aquele dia
  const d = isoToDate(iso);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;

  const day = d.getUTCDate();
  let count = 0;
  for (let i = 1; i <= day; i++) {
    const cur = `${year}-${String(month).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    if (weekday1to7(cur) === targetWeekday) count++;
  }
  return count; // 1,2,3...
}
function monthsBetween(aISO: string, bISO: string) {
  const a = isoToDate(aISO);
  const b = isoToDate(bISO);
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

function dueDateForMonthly(t: Template, year: number, month1to12: number) {
  const dueDay = t.due_day ?? 5;

  if (t.workday_only) {
    return nthWorkdayOfMonthISO(year, month1to12, dueDay);
  }

  const dim = daysInMonthUTC(year, month1to12);
  if (dueDay < 1 || dueDay > dim) return null;
  return `${year}-${String(month1to12).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
}

export default function RunsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [busyGen, setBusyGen] = useState(false);
  const [busyClear, setBusyClear] = useState(false);
  const [busyClearAll, setBusyClearAll] = useState(false);

  async function requireUser() {
    const { data: sessData, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    const u = sessData.session?.user;
    if (!u) {
      router.replace("/login");
      return null;
    }
    return u;
  }

  async function loadRuns() {
    setErrorMsg("");
    setLoading(true);

    const u = await requireUser();
    if (!u) return;

    const { data, error } = await supabase
      .from("task_runs")
      .select(
        "id,user_id,template_id,due_date,start_date,done_at,status,notes,created_at,task_templates(id,task_id,title,sector,task_type,frequency,priority,workday_only,schedule_kind,schedule_every,due_day,due_weekday,anchor_date,active)"
      )
      .eq("user_id", u.id)
      .order("due_date", { ascending: true });

    if (error) setErrorMsg(error.message);
    setRuns((data || []) as any);
    setLoading(false);
  }

  useEffect(() => {
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleDone(r: Run) {
    setErrorMsg("");
    const u = await requireUser();
    if (!u) return;

    const isDone = r.status === "done";
    const nextStatus = isDone ? "open" : "done";
    const nextDoneAt = isDone ? null : new Date().toISOString();

    const { error } = await supabase
      .from("task_runs")
      .update({ status: nextStatus, done_at: nextDoneAt })
      .eq("id", r.id)
      .eq("user_id", u.id);

    if (error) return setErrorMsg(error.message);
    await loadRuns();
  }

  // ✅ NOVO: delete genérico (range OU tudo)
  async function clearRuns(opts?: { from?: string; to?: string }) {
    setErrorMsg("");
    const u = await requireUser();
    if (!u) return;

    const from = (opts?.from || "").trim();
    const to = (opts?.to || "").trim();

    const scopeText =
      from || to
        ? `no range:\n${from || "(sem início)"} até ${to || "(sem fim)"}`
        : `TODAS as runs do seu usuário (sem filtro de data)`;

    // conta antes (pra confirmar com número real)
    let countQuery = supabase
      .from("task_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", u.id);

    if (from) countQuery = countQuery.gte("due_date", from);
    if (to) countQuery = countQuery.lte("due_date", to);

    const { count, error: countErr } = await countQuery;
    if (countErr) {
      setErrorMsg(countErr.message);
      return;
    }

    const ok = confirm(`Vai apagar ${count ?? 0} runs ${scopeText}.\n\nConfirma?`);
    if (!ok) return;

    // flags de busy (pra UI)
    if (from || to) setBusyClear(true);
    else setBusyClearAll(true);

    try {
      let delQuery = supabase.from("task_runs").delete().eq("user_id", u.id);
      if (from) delQuery = delQuery.gte("due_date", from);
      if (to) delQuery = delQuery.lte("due_date", to);

      const { error } = await delQuery;
      if (error) throw new Error(error.message);

      await loadRuns();
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
    } finally {
      setBusyClear(false);
      setBusyClearAll(false);
    }
  }

  async function clearRunsRange() {
    const start = todayISO();
    const end = addDaysISO(start, rangeDays);
    await clearRuns({ from: start, to: end });
  }

  async function clearRunsAll() {
    await clearRuns(); // sem from/to => apaga tudo
  }

  async function generateRuns() {
    setErrorMsg("");
    setBusyGen(true);

    try {
      const u = await requireUser();
      if (!u) return;

      const start = todayISO();
      const end = addDaysISO(start, rangeDays);

      // templates ativos do usuário
      const { data: templates, error: tErr } = await supabase
        .from("task_templates")
        .select(
          "id,user_id,task_id,title,sector,task_type,frequency,priority,workday_only,active,schedule_kind,schedule_every,due_day,due_weekday,anchor_date"
        )
        .eq("user_id", u.id)
        .eq("active", true);

      if (tErr) throw new Error(tErr.message);

      // runs já existentes no range
      const { data: existing, error: eErr } = await supabase
        .from("task_runs")
        .select("template_id,due_date")
        .eq("user_id", u.id)
        .gte("due_date", start)
        .lte("due_date", end);

      if (eErr) throw new Error(eErr.message);

      const existingSet = new Set<string>(
        (existing || []).map((r: any) => `${r.template_id}|${r.due_date}`)
      );

      const inserts: any[] = [];

      for (const t of (templates || []) as any as Template[]) {
        const kind = (t.schedule_kind || "monthly").toLowerCase();
        const every = Math.max(1, t.schedule_every ?? 1);
        const anchor = t.anchor_date || start;

        for (let i = 0; i <= rangeDays; i++) {
          const d = addDaysISO(start, i);

          let shouldCreate = false;

          // regras por kind
          if (kind === "daily") {
            if (t.workday_only && !isWorkday(d)) {
              shouldCreate = false;
            } else {
              const diff = daysBetween(anchor, d);
              shouldCreate = diff >= 0 && diff % every === 0;
            }
          } else if (kind === "weekly") {
            const wd = t.due_weekday ?? 5; // default Friday
            if (weekday1to7(d) !== wd) {
              shouldCreate = false;
            } else if (t.workday_only && wd > 5) {
              shouldCreate = false;
            } else {
              const wdiff = weeksBetween(anchor, d);
              shouldCreate = wdiff >= 0 && wdiff % every === 0;
            }
          } else if (kind === "biweekly") {
            // 1ª e 3ª ocorrência do weekday no mês (ex: 1ª e 3ª sexta)
            const wd = t.due_weekday ?? 5;
            if (weekday1to7(d) !== wd) {
              shouldCreate = false;
            } else if (t.workday_only && wd > 5) {
              shouldCreate = false;
            } else {
              // opcional: respeita "every" por mês (normalmente 1)
              const mdiff = monthsBetween(anchor, d);
              if (mdiff < 0 || mdiff % every !== 0) {
                shouldCreate = false;
              } else {
                const occ = occurrenceOfWeekdayInMonth(d, wd);
                shouldCreate = occ === 1 || occ === 3;
              }
            }
          } else if (kind === "monthly") {
            const mdiff = monthsBetween(anchor, d);
            if (mdiff < 0 || mdiff % every !== 0) {
              shouldCreate = false;
            } else {
              const dt = isoToDate(d);
              const year = dt.getUTCFullYear();
              const month = dt.getUTCMonth() + 1;

              const due = dueDateForMonthly(t, year, month);
              shouldCreate = due === d;
            }
          } else if (kind === "once") {
            // pontual: usa anchor_date como a data
            shouldCreate = d === anchor;
          }

          if (!shouldCreate) continue;

          const key = `${t.id}|${d}`;
          if (existingSet.has(key)) continue;

          inserts.push({
            user_id: u.id,
            template_id: t.id,
            due_date: d,
            start_date: null,
            done_at: null,
            status: "open",
            notes: null,
          });
        }
      }

      if (inserts.length === 0) {
        setErrorMsg("Nada pra gerar (ou já existe tudo no range).");
        return;
      }

      // insere em lotes
      const chunkSize = 200;
      for (let i = 0; i < inserts.length; i += chunkSize) {
        const chunk = inserts.slice(i, i + chunkSize);
        const { error } = await supabase.from("task_runs").insert(chunk);
        if (error) throw new Error(error.message);
      }

      await loadRuns();
    } catch (e: any) {
      setErrorMsg(e?.message || String(e));
    } finally {
      setBusyGen(false);
    }
  }

  const ordered = useMemo(() => runs, [runs]);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Runs (Vencimentos)</CardTitle>
              <div className="text-xs opacity-70">
                Geração respeita: daily/weekly/biweekly/monthly + workday_only + schedule_every.
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <div className="flex items-center gap-2">
                <div className="text-xs opacity-70">Range (days)</div>
                <Input
                  type="number"
                  className="w-24"
                  value={rangeDays}
                  onChange={(e) =>
                    setRangeDays(Math.max(1, Math.min(365, Number(e.target.value || 30))))
                  }
                />
              </div>

              <Button onClick={generateRuns} disabled={busyGen}>
                {busyGen ? "Generating..." : `Generate runs (${rangeDays}d)`}
              </Button>

              <Button variant="outline" onClick={clearRunsRange} disabled={busyClear || busyClearAll}>
                {busyClear ? "Clearing..." : `Clear runs (${rangeDays}d)`}
              </Button>

              {/* ✅ NOVO BOTÃO: APAGAR TUDO */}
              <Button variant="destructive" onClick={clearRunsAll} disabled={busyClear || busyClearAll}>
                {busyClearAll ? "Deleting..." : "Delete ALL"}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}
            <div className="text-sm opacity-70">{loading ? "Loading..." : `${ordered.length} run(s)`}</div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Task_ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Meta</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {ordered.map((r) => {
                    const t = r.task_templates;
                    const st = r.status === "done" ? "DONE" : "OPEN";

                    const sch =
                      t?.schedule_kind
                        ? `${t.schedule_kind}${t.schedule_every && t.schedule_every > 1 ? `/${t.schedule_every}` : ""}`
                        : "-";

                    const dueRule =
                      t?.schedule_kind === "monthly"
                        ? `due_day=${t.due_day ?? "-"}${t.workday_only ? " (workday)" : ""}`
                        : t?.schedule_kind === "weekly" || t?.schedule_kind === "biweekly"
                        ? `weekday=${t.due_weekday ?? "-"}`
                        : "";

                    return (
                      <TableRow key={r.id} className={st === "DONE" ? "opacity-70" : ""}>
                        <TableCell>
                          <Badge variant={st === "DONE" ? "secondary" : "default"}>{st}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{t?.task_id || "-"}</TableCell>
                        <TableCell className="font-medium">{t?.title || "-"}</TableCell>
                        <TableCell>{r.due_date || "-"}</TableCell>
                        <TableCell className="text-xs opacity-80">
                          <div>{t?.sector ? `Sector: ${t.sector}` : ""}</div>
                          <div>{t?.frequency ? `Frequency: ${t.frequency}` : ""}</div>
                          <div>{`Sched: ${sch}${dueRule ? ` | ${dueRule}` : ""}`}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => toggleDone(r)}>
                            {r.status === "done" ? "Reopen" : "Complete"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {!loading && ordered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm opacity-70 py-10">
                        No runs yet. Click <b>Generate runs</b>.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
