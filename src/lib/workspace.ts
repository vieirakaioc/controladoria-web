import { supabase } from "@/lib/supabaseClient";

export async function getMyWorkspaceId(): Promise<string | null> {
  const { data: sess } = await supabase.auth.getSession();
  const u = sess.session?.user;
  if (!u) return null;

  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", u.id)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as any)?.workspace_id ?? null;
}