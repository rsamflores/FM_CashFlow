export type Scope = "personal" | "business";

export function isValidScope(s: string): s is Scope {
  return s === "personal" || s === "business";
}

export const SCOPE_LABEL: Record<Scope, string> = {
  personal: "Personal",
  business: "Empresarial",
};
