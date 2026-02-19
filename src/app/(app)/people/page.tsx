"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Person = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  created_at: string;
};

function norm(s: any) {
  return String(s ?? "").trim();
}

export default function PeoplePage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userId, setUserId] = useState("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [people, setPeople] = useState<Person[]>([]);

  // form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  async function checkSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setErr(error.message);
      return;
    }
    const u = data.session?.user;
    if (!u) {
      router.replace("/login");
      return;
    }
    setUserId(u.id);
    setCheckingAuth(false);
  }

  async function load() {
    if (!userId) return;
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("people")
      .select("id,name,email,active,created_at")
      .eq("user_id", userId)
      .order("active", { ascending: false })
      .order("name", { ascending: true });

    if (error) setErr(error.message);
    setPeople((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function addPerson() {
    const n = norm(name);
    const e = norm(email).toLowerCase();

    if (!n) return alert("Name is required.");
    if (!e) return alert("Email is required.");

    setLoading(true);
    setErr("");

    // RLS exige user_id = auth.uid()
    const { error } = await supabase.from("people").upsert(
      [{ user_id: userId, name: n, email: e, active: true }],
      { onConflict: "user_id,email" }
    );

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    setName("");
    setEmail("");
    await load();
    setLoading(false);
  }

  async function toggleActive(p: Person) {
    setLoading(true);
    setErr("");

    const { error } = await supabase
      .from("people")
      .update({ active: !p.active })
      .eq("id", p.id);

    if (error) setErr(error.message);
    await load();
    setLoading(false);
  }

  async function removePerson(p: Person) {
    if (!confirm(`Delete ${p.name} (${p.email})?`)) return;

    setLoading(true);
    setErr("");

    const { error } = await supabase.from("people").delete().eq("id", p.id);
    if (error) setErr(error.message);

    await load();
    setLoading(false);
  }

  const activeCount = useMemo(() => people.filter((p) => p.active).length, [people]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm opacity-70">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">People</h1>
          <div className="text-sm opacity-70">
            Cadastro de responsáveis (usado no Kanban e filtros). Ativos: <b>{activeCount}</b>
          </div>
        </div>

        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Add person</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-12 items-end">
          <div className="md:col-span-4">
            <div className="text-xs opacity-70 mb-1">Name</div>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Kaio Vieira" />
          </div>

          <div className="md:col-span-4">
            <div className="text-xs opacity-70 mb-1">Email</div>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ex: kaio@empresa.com.br" />
          </div>

          <div className="md:col-span-4 flex gap-2">
            <Button onClick={addPerson} disabled={loading}>
              Add / Update
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setName("");
                setEmail("");
              }}
              disabled={loading}
            >
              Clear
            </Button>
          </div>

          {err && (
            <div className="md:col-span-12 text-sm text-rose-600 border border-rose-200 bg-rose-50 rounded-md p-3">
              {err}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">List</CardTitle>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-sm opacity-70">Loading...</div>
          ) : people.length === 0 ? (
            <div className="text-sm opacity-70">No people yet.</div>
          ) : (
            <div className="overflow-auto border rounded-md">
              <table className="min-w-[780px] w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="p-3">Name</th>
                    <th className="p-3">Email</th>
                    <th className="p-3">Active</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="p-3 font-medium">{p.name}</td>
                      <td className="p-3">{p.email}</td>
                      <td className="p-3">{p.active ? "Yes" : "No"}</td>
                      <td className="p-3 flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => toggleActive(p)} disabled={loading}>
                          {p.active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => removePerson(p)} disabled={loading}>
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
