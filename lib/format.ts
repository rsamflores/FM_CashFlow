import { format as formatDate } from "date-fns";
import { es } from "date-fns/locale";

const LOCALE = "es-SV";
const TZ = "America/El_Salvador";

const currencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const signedCurrencyFormatter = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "USD",
  signDisplay: "always",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatSignedCurrency(value: number): string {
  return signedCurrencyFormatter.format(value);
}

// Parse a date-only string (YYYY-MM-DD) as local noon to avoid UTC offset shifting the day.
function parseDateString(date: Date | string): Date {
  if (typeof date !== "string") return date;
  // "2025-05-14" → treat as local time, not UTC midnight
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return new Date(date + "T12:00:00");
  return new Date(date);
}

export function formatDay(date: Date | string): string {
  return formatDate(parseDateString(date), "dd/MM/yyyy", { locale: es });
}

export function formatShortDay(date: Date | string): string {
  return formatDate(parseDateString(date), "dd MMM", { locale: es });
}

export function formatMonth(date: Date | string): string {
  return formatDate(parseDateString(date), "MMMM yyyy", { locale: es });
}

export const APP_LOCALE = LOCALE;
export const APP_TZ = TZ;

/**
 * Returns the current date components in El Salvador timezone (GMT-6).
 * Use instead of `new Date()` whenever computing "current month" or "today"
 * to avoid UTC midnight bleeding into the wrong calendar day.
 */
export function svToday(): { year: number; month: number; day: number; dateStr: string } {
  const dateStr = new Date().toLocaleDateString("en-CA", { timeZone: TZ }); // "YYYY-MM-DD"
  const [y, m, d] = dateStr.split("-").map(Number);
  return { year: y, month: m - 1, day: d, dateStr }; // month is 0-indexed like JS Date
}
