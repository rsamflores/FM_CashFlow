import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/Topbar";
import { isValidScope, SCOPE_LABEL } from "@/lib/scope";
import { getCategories } from "@/lib/actions/categories";
import { CategoriesClient } from "./CategoriesClient";

export default async function CategoriesPage({
  params,
}: {
  params: Promise<{ scope: string }>;
}) {
  const { scope } = await params;
  if (!isValidScope(scope)) notFound();

  const categories = await getCategories(scope);

  return (
    <>
      <Topbar title="Categorías" subtitle={SCOPE_LABEL[scope]} />
      <CategoriesClient scope={scope} categories={categories} />
    </>
  );
}
