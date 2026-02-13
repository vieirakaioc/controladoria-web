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

type Template = {
  id: string;
  user_id: string;
  task_id: string | null;
  planner: string;
  sector: string | null;
  task_type: string | null;
  title: string;
  notes: string | null;
  priority: number | null;
  frequency: string | null;
  classification: string | null;
  workday_only: boolean;
  active: boolean;
  created_at: string;
};

const PRIORITY_LABEL: Record<number, string> = {
  0: "Urgent",
  1: "Important",
  2: "Medium",
  3: "Low",
};

export default function TemplatesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");

  const [items, setItems] = useState<Template[]>([]);
  const [errorMsg, setErrorMsg] = useState("");

  // modal new
  const [openNew, setOpenNew] = useState(false);
  const [planner, setPlanner] = useState("Check List");
  const [sector, setSector] = useState("");
  const [taskType, setTaskType] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<string>("2");
  const [frequency, setFrequency] = useState("");
  const [classification, setClassification] = useState("");
  const [workdayOnly, setWorkdayOnly] = useState(true);
  const [active, setActive] = useState(true);

  // filtro simples
  const [fActive, setFActive] = useState<"all" | "active" | "inactive">("active");

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function loadData() {
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
    setUserEmail(u.email || "");

    const { data, error } = await supabase
      .from("task_templates")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) setErrorMsg(error.message);
    setItems((data || []) as Template[]);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return items.filter((t) => {
      if (fActive === "all") return true;
      return fActive === "active" ? t.active : !t.active;
    });
  }, [items, fActive]);

  async function createTemplate() {
    setErrorMsg("");

    if (!title.trim()) return setErrorMsg("Title is required.");
    if (!sector.trim()) return setErrorMsg("Sector is required.");
    if (!userId) return setErrorMsg("Not authenticated.");

    const payload = {
      user_id: userId,
      planner: planner.trim() || "Check List",
      sector: sector.trim(),
      task_type: taskType.trim() || null,
      title: title.trim(),
      notes: notes.trim() ? notes.trim() : null,
      priority: Number.isFinite(Number(priority)) ? Number(priority) : null,
      frequency: frequency.trim() || null,
      classification: classification.trim() || null,
      workday_only: !!workdayOnly,
      active: !!active,
      // task_id fica vazio: Supabase trigger gera automático
      task_id: null,
    };

    const { error } = await supabase.from("task_templates").insert(payload);
    if (error) return setErrorMsg(error.message);

    setPlanner("Check List");
    setSector("");
    setTaskType("");
    setTitle("");
    setNotes("");
    setPriority("2");
    setFrequency("");
    setClassification("");
    setWorkdayOnly(true);
    setActive(true);

    setOpenNew(false);
    await loadData();
  }

  async function toggleActive(t: Template) {
    setErrorMsg("");
    const { error } = await supabase
      .from("task_templates")
      .update({ active: !t.active })
      .eq("id", t.id);
    if (error) return setErrorMsg(error.message);
    await loadData();
  }

  return (
    <main className="min-h-screen p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle>Task Templates</CardTitle>
              <div className="text-xs opacity-70">
                Logged as: {userEmail || "..."} • This is your routine catalog (Excel “Lista”).
              </div>
            </div>

            <div className="flex gap-2">
              <Dialog open={openNew} onOpenChange={setOpenNew}>
                <DialogTrigger asChild>
                  <Button>New template</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create template</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Planner</div>
                        <Input value={planner} onChange={(e) => setPlanner(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Sector *</div>
                        <Input value={sector} onChange={(e) => setSector(e.target.value)} placeholder="e.g. Contas a Pagar" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Title *</div>
                      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Baixar por perda" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Type</div>
                        <Input value={taskType} onChange={(e) => setTaskType(e.target.value)} placeholder="Entrega/Recebimento" />
                      </div>

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
                        <div className="text-sm font-medium">Frequency</div>
                        <Input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="Diária, Mensal..." />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Classification</div>
                        <Input value={classification} onChange={(e) => setClassification(e.target.value)} placeholder="Rotina, Fechamento..." />
                      </div>

                      <div className="space-y-2">
                        <div className="text-sm font-medium">Flags</div>
                        <div className="flex items-center gap-4 pt-2">
                          <div className="flex items-center gap-2">
                            <Checkbox checked={workdayOnly} onCheckedChange={(v) => setWorkdayOnly(Boolean(v))} />
                            <span className="text-sm opacity-80">Workday only</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Checkbox checked={active} onCheckedChange={(v) => setActive(Boolean(v))} />
                            <span className="text-sm opacity-80">Active</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Notes</div>
                      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>

                    {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}

                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setOpenNew(false)}>
                        Cancel
                      </Button>
                      <Button onClick={createTemplate}>Create</Button>
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
            <div className="flex items-center gap-2">
              <div className="text-sm opacity-70 mr-2">Filter:</div>
              <Select value={fActive} onValueChange={(v) => setFActive(v as any)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Active filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>

              <div className="ml-auto text-sm opacity-70">
                {loading ? "Loading..." : `${filtered.length} template(s)`}
              </div>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task_ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Meta</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((t) => (
                    <TableRow key={t.id} className={!t.active ? "opacity-70" : ""}>
                      <TableCell className="font-mono text-xs">
                        {t.task_id ? t.task_id : <span className="opacity-60">generating...</span>}
                      </TableCell>

                      <TableCell className="font-medium">{t.title}</TableCell>

                      <TableCell className="text-xs opacity-80">
                        <div>Planner: {t.planner}</div>
                        <div>Sector: {t.sector || "-"}</div>
                        <div>Type: {t.task_type || "-"}</div>
                        <div>Priority: {(t.priority ?? 2)} ({PRIORITY_LABEL[t.priority ?? 2] || "n/a"})</div>
                        <div>Frequency: {t.frequency || "-"}</div>
                        <div>Class: {t.classification || "-"}</div>
                        <div>{t.workday_only ? "Workday only" : "Any day"}</div>
                      </TableCell>

                      <TableCell>
                        <Badge variant={t.active ? "default" : "secondary"}>
                          {t.active ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => toggleActive(t)}>
                          {t.active ? "Disable" : "Enable"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}

                  {!loading && filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-sm opacity-70 py-10">
                        No templates yet. Click <b>New template</b>.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>

            {errorMsg ? <div className="text-sm text-red-600">{errorMsg}</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Next</CardTitle>
          </CardHeader>
          <CardContent className="text-sm opacity-80">
            Próximo passo: gerar as execuções (Runs) e criar a tela <b>/runs</b> com vencimentos.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
