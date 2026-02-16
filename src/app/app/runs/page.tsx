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
  task_id: string | null;
  title: string;
  sector: string | null;
  task_type: string | null;
  frequency: string | null;
  priority: number | null;
  workday_only: boolean;
  active: boolean;
};

type RunRow = {
  id: string;
  user_id: string;
  template_id: string;
  due_date: string | null;
  start_date: string | null;
  done_at: string | null;
  status: "open" | "done" | string;
  notes: string | null;
  created_at?: string;
  task_templates?: Template | Template[] | null;
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

function getTpl(t: RunRow["task_templates"]) {
  if (!t) return null;
  return Array.isArray(t) ? t[0] ?? null : t;
}

export default function RunsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [runs, setRuns] = useState<RunRow[]>([]);

  // UI state
  const [statusFilter, setStatusFilter] = useState<"open" | "done" | "overdue" | "all">("open");
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [search, setSearch] = useState<string>("");
  const [sector, setSector] = useState<string>("all");
  const [frequency, setFrequency] = useState<string>("all");

  async function loadRuns() {
    setErrorMsg("");
    setLoading(true);

    const { data: sessData } = await supabase.auth.getSession();
    const u = sessData.session?.user;
    if (!u) {
      router.replace("/login");
      return;
    }

    const t0 = todayISO();
    let q = supabase
      .from("task_runs")
      .select(
        "id,user_id,template_id,due_date,start_date,done_at,status,notes, task_templates(task_id,title,sector,task_type,frequency,priority,workday_only,active)"
      );

    // Overdue é um caso especial (puxa tudo atrasado, não só o range)
    if (statusFilter === "overdue") {
      q = q.eq("status", "open").lt("due_date", t0).order("due_date", { ascending: true }).limit(500);
    } else {
      const start = addDays(t0, -7);
      const end = addDays(t0, rangeDays);

      q = q.gte("due_date", start).lte("due_date", end).order("due_date", { ascending: true });

      if (statusFilter === "open") q = q.eq("status", "open");
      if (statusFilter === "done") q = q.eq("status", "done");
    }

    const { data, error } = await q;
    if (error) setErrorMsg(error.message);

    setRuns((data || []) as any);
    setLoading(false);
  }

  useEffect(() => {
    loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, rangeDays]);

  async function toggleDone(r: RunRow) {
    setErrorMsg("");

    const next = r.status === "done" ? "open" : "done";
    const patch: any = { status: next };

    if (next === "done") patch.done_at = new Date().toISOString();
    else patch.done_at = null;

    const { error } = await supabase.from("task_runs").update(patch).eq("id", r.id);
    if (error) return setErrorMsg(error.message);

    await loadRuns();
  }

  // (mantive simples) botão só pra refresh manual
  async function refresh() {
    await loadRuns();
  }

  const derived = useMemo(() => {
    const t0 = todayISO();

    const items = runs.map((r) => {
      const tpl = getTpl(r.task_templates);
      const due = r.due_date || "";
      const isOverdue = r.status === "open" && !!due && due < t0;
      const isToday = r.status === "open" && due === t0;

      return {
        ...r,
        tpl,
        isOverdue,
        isToday,
      };
    });

    // filter: search + sector + frequency (client-side)
    const s = search.trim().toLowerCase();

    const filtered = items.filter((x) => {
      const tpl = x.tpl;
      if (!tpl) return true;

      if (sector !== "all" && (tpl.sector || "Sem setor") !== sector) return false;
      if (frequency !== "all" && (tpl.frequency || "Sem frequência") !== frequency) return false;

      if (!s) return true;

      const hay = `${tpl.task_id || ""} ${tpl.title || ""} ${tpl.sector || ""} ${tpl.frequency || ""}`.toLowerCase();
      return hay.includes(s);
    });

    const openCount = items.filter((x) => x.status === "open").length;
    const doneCount = items.filter((x) => x.status === "done").length;
    const overdueCount = items.filter((x) => x.isOverdue).length;
    const todayCount = items.filter((x) => x.isToday).length;

    const sectors = Array.from(
      new Set(items.map((x) => (x.tpl?.sector || "Sem setor")).filter(Boolean))
    ).sort();

    const freqs = Array.from(
      new Set(items.map((x) => (x.tpl?.frequency || "Sem frequência")).filter(Boolean))
    ).sort();

    return {
      items,
      filtered,
      openCount,
      doneCount,
      overdueCount,
      todayCount,
      sectors,
      freqs,
    };
  }, [runs, search, sector, frequency]);

  return (
    <main className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Runs</h1>
          <div className="text-sm opacity-70">
            {loading ? "Loading..." : `${derived.filtered.length} item(s)`} •{" "}
            <span className="font-medium">Open:</span> {derived.openCount} •{" "}
            <span className="font-medium">Today:</span> {derived.todayCount} •{" "}
            <span className="font-medium">Overdue:</span>{" "}
            <span className={derived.overdueCount ? "text-red-600 font-semibold" : ""}>
              {derived.overdueCount}
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push("/dashboard")}>
            Dashboard
          </Button>
          <Button variant="outline" onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-sm">Filters</CardTitle>

          <div className="flex flex-wrap gap-2 items-center">
            {/* Status filter */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={statusFilter === "open" ? "default" : "outline"}
                onClick={() => setStatusFilter("open")}
              >
                Open
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "done" ? "default" : "outline"}
                onClick={() => setStatusFilter("done")}
              >
                Done
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "overdue" ? "default" : "outline"}
                onClick={() => setStatusFilter("overdue")}
              >
                Overdue
              </Button>
              <Button
                size="sm"
                variant={statusFilter === "all" ? "default" : "outline"}
                onClick={() => setStatusFilter("all")}
              >
                All
              </Button>
            </div>

            {/* Range */}
            <div className="flex items-center gap-2">
              <span className="text-xs opacity-70">Range</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={rangeDays}
                onChange={(e) => setRangeDays(parseInt(e.target.value, 10))}
                disabled={statusFilter === "overdue"} // overdue ignora range
              >
                <option value={7}>Next 7d</option>
                <option value={30}>Next 30d</option>
                <option value={60}>Next 60d</option>
                <option value={90}>Next 90d</option>
              </select>
            </div>

            {/* Search */}
            <div className="min-w-[220px] flex-1">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Task_ID / title / sector..."
              />
            </div>

            {/* Sector */}
            <div className="flex items-center gap-2">
              <span className="text-xs opacity-70">Sector</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={sector}
                onChange={(e) => setSector(e.target.value)}
              >
                <option value="all">All</option>
                {derived.sectors.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Frequency */}
            <div className="flex items-center gap-2">
              <span className="text-xs opacity-70">Frequency</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
              >
                <option value="all">All</option>
                {derived.freqs.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>

        <CardContent>
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
                {derived.filtered.map((r) => {
                  const t = r.tpl;

                  const st = r.status === "done" ? "DONE" : r.isOverdue ? "OVERDUE" : "OPEN";

                  return (
                    <TableRow key={r.id} className={r.status === "done" ? "opacity-70" : ""}>
                      <TableCell>
                        <Badge
                          variant={
                            st === "DONE" ? "secondary" : st === "OVERDUE" ? "destructive" : "default"
                          }
                        >
                          {st}
                        </Badge>
                      </TableCell>

                      <TableCell className="font-mono text-xs">{t?.task_id || "-"}</TableCell>

                      <TableCell className="font-medium">{t?.title || "-"}</TableCell>

                      <TableCell className={r.isToday ? "font-semibold" : ""}>
                        {r.due_date || "-"}
                      </TableCell>

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

                {!loading && derived.filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm opacity-70 py-10">
                      Nothing here (filters may be hiding results).
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          <div className="text-xs opacity-70 mt-3">
            Tip: use <b>Overdue</b> to see atrasadas (puxa até 500).
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
