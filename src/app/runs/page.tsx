"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  task_templates?: {
    task_id: string | null;
    title: string;
    sector: string | null;
    task_type: string | null;
    frequency: string | null;
    priority: number | null;
    workday_only: boolean;
    active: boolean;
    schedule_kind?: string | null;
    due_day?: number | null;
    due_weekday?: number | null;
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

function weekday1to7(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const js = d.getDay(); // 0=Sun..6=Sat
  return js === 0 ? 7 : js; // 1=Mon..7=Sun
}

function daysInMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0).getDate();
}

function nthWorkdayOfMonth(year: number, month1to12: number, n: number) {
  // retorna YYYY-MM-DD do n-ésimo dia útil (Mon-Fri) do mês
  let count = 0;
  for (let day = 1; day <= daysInMonth(year, month1to12); day++) {
    const iso = `${year}-${String(month1to12).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const wd = weekday1to7(iso);
    if (wd >= 1 && wd <= 5) {
      count++;
      if (count === n) return iso;
    }
  }
  return null;
}

export default function RunsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [runs, setRuns] = useState<Run[]>([]);

  async function loadRuns() {
    setErrorMsg("");
    setLoading(true);

    const { data: sessData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) {
      setErrorMsg(sessErr.message);
      setLoading(false);
      return;
    }

    const u = sessData.session?.user;
    if (!u) {
      router.replace("/login");
      return;
    }
    setUserId(u.id);

    // join com templates para mostrar info
    const { data, error } = await supabase
      .from("task_runs")
      .select(
        "*, task_templates(task_id,title,sector,task_type,frequency,priority,workday_only,active,schedule_kind,due_day,due_weekday)"
      )
      .order("due_date", { ascending: true });

    if (error) setErrorMsg(error.message);
    setRuns((data || []) as Run[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geração real: cria runs para os próximos 30 dias respeitando schedule_kind
  async function generateRunsMVP() {
    setErrorMsg("");

    const { data: sessData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) return setErrorMsg(sessErr.message);

    const u = sessData.session?.user;
    if (!u) return router.replace("/login");

    const uid = u.id;

    // Busca templates ativos + regras
    const { data: templates, error: tErr } = await supabase
      .from("task_templates")
      .select("id, user_id, workday_only, active, schedule_kind, due_day, due_weekday")
      .eq("active", true);

    if (tErr) return setErrorMsg(tErr.message);

    const start = todayISO();
    const days = 30;

    // pega runs já existentes no range (para evitar duplicar)
    const end = addDays(start, days);
    const { data: existing, error: eErr } = await supabase
      .from("task_runs")
      .select("template_id, due_date")
      .gte("due_date", start)
      .lte("due_date", end);

    if (eErr) return setErrorMsg(eErr.message);

    const existingSet = new Set<string>(
      (existing || []).map((r: any) => `${r.template_id}|${r.due_date}`)
    );

    const inserts: any[] = [];

    for (const t of (templates || []) as any[]) {
      // RLS: só pode inserir pra você mesmo
      if (t.user_id !== uid) continue;

      const kind = (t.schedule_kind || "monthly") as string;
      const dueDay = typeof t.due_day === "number" ? t.due_day : null;
      const dueWk = typeof t.due_weekday === "number" ? t.due_weekday : null;

      for (let i = 0; i <= days; i++) {
        const d = addDays(start, i);
        let shouldCreate = false;

        if (kind === "daily") {
          shouldCreate = true;
        } else if (kind === "weekly") {
          if (dueWk && weekday1to7(d) === dueWk) shouldCreate = true;
        } else if (kind === "monthly") {
          // due_day = dia do mês, ou se workday_only=true, due_day = nº dia útil
          const dt = new Date(d + "T00:00:00");
          const year = dt.getFullYear();
          const month = dt.getMonth() + 1;

          if (dueDay) {
            if (t.workday_only) {
              const nth = nthWorkdayOfMonth(year, month, dueDay);
              if (nth === d) shouldCreate = true;
            } else {
              const dim = daysInMonth(year, month);
              if (dueDay <= dim) {
                const isoDue = `${year}-${String(month).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
                if (isoDue === d) shouldCreate = true;
              }
            }
          }
        } else if (kind === "once") {
          // MVP: cria só no dia definido (due_day) dentro do range
          if (dueDay) {
            const dt = new Date(d + "T00:00:00");
            const year = dt.getFullYear();
            const month = dt.getMonth() + 1;
            const dim = daysInMonth(year, month);
            if (dueDay <= dim) {
              const isoOnce = `${year}-${String(month).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
              if (isoOnce === d) shouldCreate = true;
            }
          }
        }

        if (!shouldCreate) continue;

        const key = `${t.id}|${d}`;
        if (existingSet.has(key)) continue; // já existe

        inserts.push({
          user_id: uid,
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
      setErrorMsg("No runs to generate (or all already exist).");
      return;
    }

    // Insere em lotes pra não estourar limite
    const chunkSize = 200;
    for (let i = 0; i < inserts.length; i += chunkSize) {
      const chunk = inserts.slice(i, i + chunkSize);
      const { error } = await supabase.from("task_runs").insert(chunk);
      if (error) {
        setErrorMsg(error.message);
        return;
      }
    }

    await loadRuns();
  }

  async function toggleDone(r: Run) {
    setErrorMsg("");
    const isDone = r.status === "done";
    const patch = isDone
      ? { status: "open", done_at: null }
      : { status: "done", done_at: new Date().toISOString() };

    const { error } = await supabase.from("task_runs").update(patch).eq("id", r.id);
    if (error) return setErrorMsg(error.message);

    await loadRuns();
  }

  const ordered = useMemo(() => runs, [runs]);

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Runs (Vencimentos)</CardTitle>
              <div className="text-xs opacity-70">
                Generate runs based on template schedules (daily/weekly/monthly/once).
              </div>
            </div>
            <Button onClick={generateRunsMVP}>Generate runs (30d)</Button>
          </CardHeader>

          <CardContent className="space-y-3">
            {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}
            <div className="text-sm opacity-70">
              {loading ? "Loading..." : `${ordered.length} run(s)`}
            </div>

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
                          <div>{t?.task_type ? `Type: ${t.task_type}` : ""}</div>
                          <div>{t?.frequency ? `Frequency: ${t.frequency}` : ""}</div>
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
                        No runs yet. Click <b>Generate runs (30d)</b>.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next step</CardTitle>
          </CardHeader>
          <CardContent className="text-sm opacity-80">
            Próximo passo: colocar isso no ar (Vercel) e depois criar a importação do Excel (templates + runs).
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
