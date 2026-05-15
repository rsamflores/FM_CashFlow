"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import type { Scope } from "@/lib/scope";

const CategorySchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  kind: z.enum(["income", "expense"]),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  is_tax_exempt: z.preprocess((v) => v === "true" || v === true, z.boolean()).default(false),
});

export type CategoryRow = {
  id: string;
  scope: Scope;
  kind: "income" | "expense";
  name: string;
  color: string | null;
  icon: string | null;
  is_tax_exempt: boolean;
  archived_at: string | null;
  created_at: string;
};

export async function getCategories(scope: Scope): Promise<CategoryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("scope", scope)
    .is("archived_at", null)
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CategoryRow[];
}

export async function createCategory(scope: Scope, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = CategorySchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    color: formData.get("color") || null,
    icon: formData.get("icon") || null,
    is_tax_exempt: formData.get("is_tax_exempt"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("categories")
    .insert({ ...parsed.data, scope });

  if (error) return { error: error.message };
  revalidatePath(`/${scope}/categories`);
  return { success: true };
}

export async function updateCategory(
  id: string,
  scope: Scope,
  formData: FormData,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado" };

  const parsed = CategorySchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    color: formData.get("color") || null,
    icon: formData.get("icon") || null,
    is_tax_exempt: formData.get("is_tax_exempt"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { error } = await supabase
    .from("categories")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: error.message };
  revalidatePath(`/${scope}/categories`);
  return { success: true };
}

export async function deleteCategory(id: string, scope: Scope) {
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/${scope}/categories`);
  return { success: true };
}
