"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

function isOverdue(dueDate: string) {
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const d = new Date(dueDate + "T00:00:00");
  return d < t;
}

export type TemplateJoin = {
  id: string;
  task_id: string | null;
  title: string;
  sector: string | null;
  task_type: string | null;
  priority: number | null;
  frequency: string | null;
  classification: string | null;
  planner: string | null;
  assignee_name: string | null;
  assignee_email: string | null;
};

export type RunItem = {
  id: string;
  template_id: string;
  due_date: string;
  done_at: string | null;
  status: "open" | "done";
  notes: string | null;
  template: TemplateJoin | null;
};

export default function TaskDrawer({
  open,
  onOpenChange,
  item,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: RunItem | null;
  onChanged?: () => void;
}) {
  const [saving, setSaving] = useState(false);

  const [runNotes, setRunNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [status, setStatus] = useState<"open" | "done">("open");

  const [tplTitle, setTplTitle] = useState("");
  const [tplTaskId, setTplTaskId] = useState("");
  const [tplSector, setTplSector] = useState("");
  const [tplAssignee, setTplAssignee] = useState("");
  const [tplEmail, setTplEmail] = useState("");

  const overdue = useMemo(() => (item?.due_date ? isOverdue(item.due_date) : false), [item?.due_date]);

  useEffect(() => {
    if (!item) return;
    setRunNotes(item.notes || "");
    setDueDate(item.due_date || "");
    setStatus(item.status);

    const t = item.template;
    setTplTitle(t?.title || "");
    setTplTaskId(t?.task_id || "");
    setTplSector(t?.sector || "");
    setTplAssignee(t?.assignee_name || "");
    setTplEmail(t?.assignee_email || "");
  }, [item]);

  async function saveRun() {
    if (!item) return;
    setSaving(true);
    try {
      const done_at =
        status === "done" ? new Date().toISOString() : null;

      const { error } = await supabase
        .from("task_runs")
        .update({
          due_date: dueDate,
          status,
          done_at,
          notes: runNotes || null,
        })
        .eq("id", item.id);

      if (error) throw error;
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate() {
    if (!item?.template) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("task_templates")
        .update({
          title: tplTitle,
          task_id: tplTaskId || null,
          sector: tplSector || null,
          assignee_name: tplAssignee || null,
          assignee_email: tplEmail || null,
        })
        .eq("id", item.template.id);

      if (error) throw error;
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function completeNow() {
    setStatus("done");
    await saveRun();
  }

  if (!item) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="truncate">{item.template?.title || "Task"}</span>
            {item.template?.task_id ? (
              <Badge variant="secondary">{item.template.task_id}</Badge>
            ) : null}
            {overdue && item.status === "open" ? (
              <Badge variant="destructive">Overdue</Badge>
            ) : null}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Quick actions */}
          <div className="flex gap-2">
            <Button onClick={completeNow} disabled={saving || status === "done"}>
              {status === "done" ? "Completed" : "Complete"}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setStatus("open");
                setSaving(false);
              }}
              disabled={saving}
            >
              Set Open
            </Button>
          </div>

          {/* Run info */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-xs opacity-70">Run (execution)</div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs opacity-70 mb-1">Due date</div>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>

              <div>
                <div className="text-xs opacity-70 mb-1">Status</div>
                <Input value={status} readOnly />
              </div>
            </div>

            <div>
              <div className="text-xs opacity-70 mb-1">Notes (run)</div>
              <Textarea value={runNotes} onChange={(e) => setRunNotes(e.target.value)} rows={4} />
            </div>

            <div className="flex justify-end">
              <Button variant="secondary" onClick={saveRun} disabled={saving}>
                Save run
              </Button>
            </div>
          </div>

          {/* Template info */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-xs opacity-70">Template (master task)</div>

            <div>
              <div className="text-xs opacity-70 mb-1">Title</div>
              <Input value={tplTitle} onChange={(e) => setTplTitle(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs opacity-70 mb-1">Task_ID</div>
                <Input value={tplTaskId} onChange={(e) => setTplTaskId(e.target.value)} />
              </div>
              <div>
                <div className="text-xs opacity-70 mb-1">Sector</div>
                <Input value={tplSector} onChange={(e) => setTplSector(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs opacity-70 mb-1">Assignee</div>
                <Input value={tplAssignee} onChange={(e) => setTplAssignee(e.target.value)} />
              </div>
              <div>
                <div className="text-xs opacity-70 mb-1">Email</div>
                <Input value={tplEmail} onChange={(e) => setTplEmail(e.target.value)} />
              </div>
            </div>

            <div className="text-xs opacity-70">
              {item.template?.frequency ? `Frequency: ${item.template.frequency}` : ""}
              {item.template?.sector ? ` • Sector: ${item.template.sector}` : ""}
            </div>

            <div className="flex justify-end">
              <Button variant="secondary" onClick={saveTemplate} disabled={saving}>
                Save template
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
