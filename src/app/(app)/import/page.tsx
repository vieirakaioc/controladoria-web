"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Row = Record<string, any>;

function stripAccentsLower(v: any) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function norm(v: any) {
  return String(v ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function asInt(v: any): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseWeekday(v: any): number | null {
  if (v === null || v === undefined) return null;

  const n = asInt(v);
  if (n && n >= 1 && n <= 7) return n;

  const s = stripAccentsLower(v);
  if (!s) return null;

  const map: Record<string, number> = {
    seg: 1, segunda: 1, monday: 1, mon: 1,
    ter: 2, terca: 2, tuesday: 2, tue: 2,
    qua: 3, quarta: 3, wednesday: 3, wed: 3,
    qui: 4, quinta: 4, thursday: 4, thu: 4,
    sex: 5, sexta: 5, friday: 5, fri: 5,
    sab: 6, sabado: 6, saturday: 6, sat: 6,
    dom: 7, domingo: 7, sunday: 7, sun: 7,
  };

  const first = s.split(/[\s\-_/]+/)[0];
  return map[first] ?? null;
}

function toISODate(v: any): string | null {
  if (!v) return null;

  if (v instanceof Date && !isNaN(v.getTime())) {
    const yyyy = v.getFullYear();
    const mm = String(v.getMonth() + 1).padStart(2, "0");
    const dd = String(v.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    const yyyy = d.y;
    const mm = String(d.m).padStart(2, "0");
    const dd = String(d.d).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const dd = String(m[1]).padStart(2, "0");
      const mm = String(m[2]).padStart(2, "0");
      const yyyy = m[3];
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  return null;
}

function tplKey(planner: string, sector: string, title: string) {
  return `${planner}|${sector}|${title}`.toLowerCase();
}
function runKey(templateId: string, dueDate: string) {
  return `${templateId}|${dueDate}`;
}

function freqToSchedule(freqRaw: string, diaUtilN: number | null, diaSemana: number | null) {
  const f = stripAccentsLower(freqRaw);

  const defaultWorkdayN = diaUtilN ?? 5;
  const defaultWeekday = diaSemana ?? 5;

  if (f.includes("diaria")) {
    return { schedule_kind: "daily", schedule_every: 1, due_weekday: null, due_day: null, workday_only: true };
  }
  if (f.includes("quinzenal")) {
    return { schedule_kind: "biweekly", schedule_every: 1, due_weekday: defaultWeekday, due_day: null, workday_only: true };
  }
  if (f.includes("semanal")) {
    return { schedule_kind: "weekly", schedule_every: 1, due_weekday: defaultWeekday, due_day: null, workday_only: true };
  }
  if (f.includes("bimestral")) {
    return { schedule_kind: "monthly", schedule_every: 2, due_weekday: null, due_day: defaultWorkdayN, workday_only: true };
  }
  if (f.includes("trimestral")) {
    return { schedule_kind: "monthly", schedule_every: 3, due_weekday: null, due_day: defaultWorkdayN, workday_only: true };
  }
  if (f.includes("anual")) {
    return { schedule_kind: "monthly", schedule_every: 12, due_weekday: null, due_day: defaultWorkdayN, workday_only: true };
  }
  if (f.includes("mensal")) {
    return { schedule_kind: "monthly", schedule_every: 1, due_weekday: null, due_day: defaultWorkdayN, workday_only: true };
  }
  if (f.includes("pontual")) {
    return { schedule_kind: "once", schedule_every: 1, due_weekday: null, due_day: null, workday_only: false };
  }

  return { schedule_kind: "monthly", schedule_every: 1, due_weekday: null, due_day: defaultWorkdayN, workday_only: true };
}

function sheetKey(name: string) {
  return stripAccentsLower(name).replace(/\s+/g, "").replace(/-/g, "_");
}

export default function ImportPage() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [log, setLog] = useState<string>("");
  const [busy, setBusy] = useState(false);

  function append(s: string) {
    setLog((p) => (p ? p + "\n" + s : s));
  }

  async function upsertPeopleFromListBox(wb: XLSX.WorkBook, userId: string) {
    const sheetPeople =
      wb.SheetNames.find((n) => sheetKey(n) === "list_box" || sheetKey(n) === "listbox") || "";

    if (!sheetPeople) {
      append("People: aba List_box não encontrada (ok).");
      return;
    }

    const wsP = wb.Sheets[sheetPeople];
    const rowsP = XLSX.utils.sheet_to_json<Row>(wsP, { defval: "" });

    const list: Array<{ user_id: string; name: string; email: string; active: boolean }> = [];
    const seen = new Set<string>();

    for (const r of rowsP) {
      const name =
        norm(r["Responsável"] || r["Responsavel"] || r["Nome"] || r["Name"] || "");
      const email =
        norm(r["e-mail"] || r["E-mail"] || r["Email"] || r["email"] || "");

      if (!name || !email) continue;

      const key = `${userId}|${email}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      list.push({ user_id: userId, name, email, active: true });
    }

    if (list.length === 0) {
      append(`People: List_box (${rowsP.length} linhas) sem registros válidos.`);
      return;
    }

    append(`People: importando da aba ${sheetPeople} (${list.length} pessoas)...`);

    const chunkSize = 200;
    for (let i = 0; i < list.length; i += chunkSize) {
      const chunk = list.slice(i, i + chunkSize);
      const { error } = await supabase
        .from("people")
        .upsert(chunk, { onConflict: "user_id,email" });

      if (error) throw new Error("People upsert: " + error.message);
    }

    append("People: ✅ atualizado.");
  }

  async function runImport() {
    setLog("");
    setBusy(true);

    try {
      const { data: sessData, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw new Error(sessErr.message);

      const u = sessData.session?.user;
      if (!u) {
        router.replace("/login");
        return;
      }

      if (!file) throw new Error("Escolhe o arquivo Excel primeiro.");

      append("Lendo Excel...");
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });

      // ✅ 0) People (List_box)
      await upsertPeopleFromListBox(wb, u.id);

      const sheetTemplates =
        wb.SheetNames.includes("Lista")
          ? "Lista"
          : wb.SheetNames.includes("Templates")
          ? "Templates"
          : wb.SheetNames[0];

      const wsT = wb.Sheets[sheetTemplates];
      const rowsT = XLSX.utils.sheet_to_json<Row>(wsT, { defval: "" });

      append(`Sheet Templates: ${sheetTemplates} (${rowsT.length} linhas)`);

      // 1) Templates brutos
      const templatesRaw = rowsT
        .map((r) => {
          const planner = norm(r["Planner Name"] || r["Planner"] || r["planner"]);
          const sector = norm(r["Setor"] || r["Sector"] || r["sector"]);
          const title = norm(r["Atividade"] || r["Title"] || r["title"]);
          if (!planner || !sector || !title) return null;

          const task_type = norm(r["Tipo"] || "");
          const notes = norm(r["Notas"] || "");
          const priority = Number.isFinite(Number(r["Prioridade"])) ? Number(r["Prioridade"]) : null;

          const frequency = norm(r["Frequencia"] || r["Frequência"] || "");
          const classification = norm(r["Classificação"] || "");
          const assignee_name = norm(r["Responsável"] || r["Responsavel"] || "");
          const assignee_email = norm(r["e-mail"] || r["e-mail responsavel"] || r["email"] || "");

          const diaUtilN =
            asInt(r["Dia Util"]) ??
            asInt(r["Dia Útil"]) ??
            asInt(r["Dia_Util_N"]) ??
            null;

          const diaSemana =
            parseWeekday(r["Dia Semana"]) ??
            parseWeekday(r["Dia_Semana"]) ??
            parseWeekday(r["due_weekday"]) ??
            null;

          const sch = freqToSchedule(frequency, diaUtilN, diaSemana);

          return {
            user_id: u.id,
            planner,
            sector,
            title,
            task_type: task_type || null,
            notes: notes || null,
            priority,
            frequency: frequency || null,
            classification: classification || null,

            active: true,
            workday_only: sch.workday_only,

            schedule_kind: sch.schedule_kind,
            schedule_every: sch.schedule_every,
            due_weekday: sch.due_weekday,
            due_day: sch.due_day,
            anchor_date: new Date().toISOString().slice(0, 10),

            assignee_name: assignee_name || null,
            assignee_email: assignee_email || null,

            task_id: null,
          };
        })
        .filter(Boolean) as any[];

      append(`Templates preparados (bruto): ${templatesRaw.length}`);

      // 2) Dedup templates
      const tplMap = new Map<string, any>();
      let tplDup = 0;

      for (const t of templatesRaw) {
        const k = tplKey(t.planner, t.sector, t.title);
        if (tplMap.has(k)) {
          tplDup++;
          const prev = tplMap.get(k);

          tplMap.set(k, {
            ...prev,
            ...t,
            task_type: t.task_type ?? prev.task_type,
            notes: t.notes ?? prev.notes,
            priority: t.priority ?? prev.priority,
            frequency: t.frequency ?? prev.frequency,
            classification: t.classification ?? prev.classification,
            assignee_name: t.assignee_name ?? prev.assignee_name,
            assignee_email: t.assignee_email ?? prev.assignee_email,
          });
        } else {
          tplMap.set(k, t);
        }
      }

      const templatesPayload = Array.from(tplMap.values());
      append(`Templates deduplicados: ${templatesPayload.length} (removidos: ${tplDup})`);

      // 3) Upsert templates
      const chunkSize = 200;
      for (let i = 0; i < templatesPayload.length; i += chunkSize) {
        const chunk = templatesPayload.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("task_templates")
          .upsert(chunk, { onConflict: "user_id,planner,sector,title" });

        if (error) throw new Error(error.message);
        append(`Upsert templates: ${Math.min(i + chunkSize, templatesPayload.length)}/${templatesPayload.length}`);
      }

      append("Buscando IDs dos templates pra mapear runs...");
      const { data: allTemplates, error: fetchErr } = await supabase
        .from("task_templates")
        .select("id, planner, sector, title")
        .eq("user_id", u.id);

      if (fetchErr) throw new Error(fetchErr.message);

      const map = new Map<string, string>();
      (allTemplates || []).forEach((t: any) => {
        map.set(tplKey(t.planner, t.sector, t.title), t.id);
      });

      // 4) Runs/histórico (se tiver)
      let runsRows: Row[] = [];
      const sheetRuns = wb.SheetNames.find((n) => ["Runs", "Execucoes", "Execuções"].includes(n)) || "";

      if (sheetRuns) {
        const wsR = wb.Sheets[sheetRuns];
        runsRows = XLSX.utils.sheet_to_json<Row>(wsR, { defval: "" });
        append(`Sheet Runs: ${sheetRuns} (${runsRows.length} linhas)`);
      } else {
        runsRows = rowsT;
        append("Runs: usando as datas da própria Lista (se existirem).");
      }

      const runsRaw = runsRows
        .map((r) => {
          const planner = norm(r["Planner Name"] || r["Planner"] || r["planner"]);
          const sector = norm(r["Setor"] || r["Sector"] || r["sector"]);
          const title = norm(r["Atividade"] || r["Title"] || r["title"]);
          if (!planner || !sector || !title) return null;

          const template_id = map.get(tplKey(planner, sector, title));
          if (!template_id) return null;

          const start_date = toISODate(r["Data Inicial"] || r["Start Date"] || r["start_date"]);
          const due_date = toISODate(r["Data Fim"] || r["Due Date"] || r["due_date"]);
          const done_date = toISODate(r["Data Conclusão"] || r["Done Date"] || r["done_date"]);

          if (!due_date) return null;

          const statusRaw = norm(r["Status"] || "");
          const status = done_date || statusRaw.toLowerCase().includes("concl") ? "done" : "open";

          return {
            user_id: u.id,
            template_id,
            due_date,
            start_date: start_date || null,
            done_at: done_date ? new Date(done_date + "T12:00:00Z").toISOString() : null,
            status,
            notes: norm(r["Notas"] || "") || null,
          };
        })
        .filter(Boolean) as any[];

      append(`Runs detectadas (bruto, com due_date): ${runsRaw.length}`);

      // Dedup runs
      const runMap = new Map<string, any>();
      let runDup = 0;

      for (const r of runsRaw) {
        const k = runKey(r.template_id, r.due_date);
        if (runMap.has(k)) {
          runDup++;
          const prev = runMap.get(k);
          const betterDoneAt = prev.done_at ?? r.done_at;
          const betterStatus = prev.status === "done" || r.status === "done" ? "done" : "open";

          runMap.set(k, {
            ...prev,
            start_date: prev.start_date ?? r.start_date,
            done_at: betterDoneAt,
            status: betterStatus,
            notes: prev.notes ?? r.notes,
          });
        } else {
          runMap.set(k, r);
        }
      }

      const runsPayload = Array.from(runMap.values());
      append(`Runs deduplicadas: ${runsPayload.length} (removidos: ${runDup})`);

      if (runsPayload.length > 0) {
        for (let i = 0; i < runsPayload.length; i += chunkSize) {
          const chunk = runsPayload.slice(i, i + chunkSize);
          const { error } = await supabase
            .from("task_runs")
            .upsert(chunk, { onConflict: "template_id,due_date" });

          if (error) throw new Error(error.message);
          append(`Upsert runs: ${Math.min(i + chunkSize, runsPayload.length)}/${runsPayload.length}`);
        }
      } else {
        append("Nenhuma run com data encontrada (normal se seu Excel não tem Data Fim preenchida).");
      }

      append("✅ Importação concluída!");
      append("Agora vai em /runs e clica Generate runs (30d) pra criar vencimentos automáticos.");
    } catch (e: any) {
      append("❌ ERRO: " + (e?.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Import Excel (Templates + Runs + People)</CardTitle>
          </CardHeader>

          <CardContent className="space-y-3">
            <Input type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] || null)} />

            <div className="flex gap-2">
              <Button onClick={runImport} disabled={!file || busy}>
                {busy ? "Importing..." : "Import all"}
              </Button>

              <Button variant="outline" onClick={() => router.push("/runs")}>
                Go to /runs
              </Button>
            </div>

            <pre className="text-xs whitespace-pre-wrap rounded-md border p-3 min-h-[160px]">
              {log || "Log vai aparecer aqui..."}
            </pre>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
