"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string } | null;

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error, data } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  // If all memberships are recorder role, send to the recorder UI
  const { data: memberships } = await supabase
    .from("memberships")
    .select("scope, role")
    .eq("user_id", data.user.id);

  const isRecorderOnly =
    memberships &&
    memberships.length > 0 &&
    memberships.every((m) => m.role === "recorder");

  if (isRecorderOnly) {
    const firstScope = memberships[0].scope;
    redirect(`/${firstScope}/recorder`);
  }

  redirect("/personal/dashboard");
}

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const fullName = String(formData.get("full_name") ?? "");

  if (password !== confirm) return { error: "Las contraseñas no coinciden" };
  if (password.length < 8)
    return { error: "La contraseña debe tener al menos 8 caracteres" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) return { error: error.message };
  redirect("/personal/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
