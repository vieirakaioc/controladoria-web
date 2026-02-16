"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TaskStatus = "open" | "done";

type Task = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  priority: number | null;
  status: TaskStatus | string; // tolera valores
  due_date: string | null; // YYYY-MM-DD
  sector: string | null;
  task_type: string | null;
  frequency: string | null;
  workday_only: boolean;
  done_at: string | null; // timestamptz
  created_at: string;
};

const PRIORITY_LABEL: Record<number, string> = {
  0: "Urgent",
  1: "Important",
  2: "Medium",
  3: "Low",
};

function fmtDate(yyyy_mm_dd: string | null) {
  if (!yyyy_mm_dd) return "";
  return yyyy_mm_dd;
}

export default function TasksPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>("");
  const [userId, setUserId] = useState<string>("");

  const [tasks, setTasks] = useState<Task[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  // filtros simples
  const [fStatus, setFStatus] = useState<"all" | "open" | "done">("all");
  const [fSector, setFSector] = useState<string>("all");
  const [fType, setFType] = useState<string>("all");

  // form "nova task"
  const [openNew, setOpenNew] = useState(false);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<string>("2");
  const [sector, setSector] = useState("");
  const [taskType, setTaskType] = useState("");
  const [frequency, setFrequency] = useState("");
  const [workdayOnly, setWorkdayOnly] = useState(true);
  const [dueDate, setDueDate] = useState<string>("");

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function loadMeAndTasks() {
    setErrorMsg("");
    setLoading(true);

    const { data: sessData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) {
      setLoading(false);
      setErrorMsg(sessErr.message);
      return;
    }

    const u = sessData.session?.user;
    if (!u) {
      router.replace("/login");
      return;
    }

    setUserEmail(u.email || "");
    setUserId(u.id);

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) setErrorMsg(error.message);
    setTasks((data || []) as Task[]);
    setLoading(false);
  }

  useEffect(() => {
    loadMeAndTasks();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      loadMeAndTasks();
    });

    return () => {
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sectorOptions = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((t) => t.sector && s.add(t.sector));
    return Array.from(s).sort();
  }, [tasks]);

  const typeOptions = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach((t) => t.task_type && s.add(t.task_type));
    return Array.from(s).sort();
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const stOk = fStatus === "all" ? true : (t.status as TaskStatus) === fStatus;
      const secOk = fSector === "all" ? true : (t.sector || "") === fSector;
      const typeOk = fType === "all" ? true : (t.task_type || "") === fType;
      return stOk && secOk && typeOk;
    });
  }, [tasks, fStatus, fSector, fType]);

  async function createTask() {
    setErrorMsg("");

    if (!title.trim()) {
      setErrorMsg("Title is required.");
      return;
    }
    if (!userId) {
      setErrorMsg("Not authenticated.");
      return;
    }

    const payload = {
      user_id: userId, // obrigatório por causa do RLS
      title: title.trim(),
      notes: notes.trim() ? notes.trim() : null,
      priority: Number.isFinite(Number(priority)) ? Number(priority) : null,
      status: "open",
      due_date: dueDate ? dueDate : null,
      sector: sector.trim() ? sector.trim() : null,
      task_type: taskType.trim() ? taskType.trim() : null,
      frequency: frequency.trim() ? frequency.trim() : null,
      workday_only: !!workdayOnly,
      done_at: null,
    };

    const { error } = await supabase.from("tasks").insert(payload);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    // limpa form
    setTitle("");
    setNotes("");
    setPriority("2");
    setSector("");
    setTaskType("");
    setFrequency("");
    setWorkdayOnly(true);
    setDueDate("");

    setOpenNew(false);
    await loadMeAndTasks();
  }

  async function toggleDone(t: Task) {
    setErrorMsg("");
    const isDone = (t.status as TaskStatus) === "done";

    const patch = isDone
      ? { status: "open", done_at: null }
      : { status: "done", done_at: new Date().toISOString() };

    const { error } = await supabase.from("tasks").update(patch).eq("id", t.id);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    await loadMeAndTasks();
  }

  async function deleteTask(t: Task) {
    setErrorMsg("");
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    await loadMeAndTasks();
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Tasks</CardTitle>
              <div className="text-xs opacity-70">Logged as: {userEmail || "..."}</div>
            </div>
            <div className="flex gap-2">
              <Dialog open={openNew} onOpenChange={setOpenNew}>
                <DialogTrigger asChild>
                  <Button>New task</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-xl">
                  <DialogHeader>
                    <DialogTitle>Create task</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-3">
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Title *</div>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Priority</div>
                        <Select value={priority} onValueChange={setPriority}>
                          <SelectTrigger>
                            <SelectValue placeholder="Pick one" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0 - Urgent</SelectItem>
                            <SelectItem value="1">1 - Important</SelectItem>
                            <SelectItem value="2">2 - Medium</SelectItem>
                            <SelectItem value="3">3 - Low</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-medium">Due date</div>
                        <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-medium">Workday only</div>
                        <div className="flex items-center gap-2 pt-2">
                          <Checkbox checked={workdayOnly} onCheckedChange={(v) => setWorkdayOnly(Boolean(v))} />
                          <span className="text-sm opacity-80">Yes</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Sector</div>
                        <Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="e.g. Contas a Pagar" />
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Type</div>
                        <Input value={taskType} onChange={(e) => setTaskType(e.target.value)} placeholder="e.g. Entrega" />
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Frequency</div>
                        <Input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="e.g. Mensal" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Notes</div>
                      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setOpenNew(false)}>
                        Cancel
                      </Button>
                      <Button onClick={createTask}>Create</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Button variant="outline" onClick={signOut}>
                Sign out
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}

            <div className="flex flex-wrap gap-2 items-center">
              <div className="text-sm opacity-70 mr-2">Filters:</div>

              <Select value={fStatus} onValueChange={(v) => setFStatus(v as any)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>

              <Select value={fSector} onValueChange={setFSector}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Sector" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {sectorOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={fType} onValueChange={setFType}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {typeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="ml-auto text-sm opacity-70">
                {loading ? "Loading..." : `${filtered.length} task(s)`}
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Meta</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((t) => {
                    const st = (t.status as TaskStatus) === "done" ? "done" : "open";
                    const pr = t.priority ?? 2;

                    return (
                      <TableRow key={t.id} className={st === "done" ? "opacity-70" : ""}>
                        <TableCell>
                          <Badge variant={st === "done" ? "secondary" : "default"}>
                            {st.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{t.title}</TableCell>
                        <TableCell className="text-xs opacity-80">
                          <div>Priority: {pr} ({PRIORITY_LABEL[pr] || "n/a"})</div>
                          <div>{t.sector ? `Sector: ${t.sector}` : ""}</div>
                          <div>{t.task_type ? `Type: ${t.task_type}` : ""}</div>
                          <div>{t.frequency ? `Frequency: ${t.frequency}` : ""}</div>
                          <div>{t.workday_only ? "Workday only" : "Any day"}</div>
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(t.due_date)}</TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button size="sm" variant="outline" onClick={() => toggleDone(t)}>
                            {st === "done" ? "Reopen" : "Complete"}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteTask(t)}>
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {!loading && filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm opacity-70 py-10">
                        No tasks yet. Click <b>New task</b>.
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
