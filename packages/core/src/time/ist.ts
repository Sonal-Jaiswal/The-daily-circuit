/**
 * Asia/Kolkata helpers. India has used a fixed UTC+05:30 offset without daylight saving
 * since 1945, so wall-clock conversion is exact. Storage is always UTC; IST is for
 * scheduling decisions and editorial display only.
 */
export const IST_TZ = "Asia/Kolkata";
const IST_OFFSET_MS = 330 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Calendar date (YYYY-MM-DD) in IST for an instant. */
export function istDateString(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function isValidDateString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidHhmm(value: string): boolean {
  return HHMM_RE.test(value);
}

/** Prisma maps `@db.Date` to a JS Date at UTC midnight. */
export function toDbDate(dateString: string): Date {
  if (!isValidDateString(dateString)) throw new Error(`Invalid date: ${dateString}`);
  return new Date(`${dateString}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The UTC instant for an IST wall-clock time on an IST calendar date. */
export function istWallTimeToUtc(dateString: string, hhmm: string): Date {
  if (!isValidDateString(dateString)) throw new Error(`Invalid date: ${dateString}`);
  if (!isValidHhmm(hhmm)) throw new Error(`Invalid time: ${hhmm}`);
  return new Date(`${dateString}T${hhmm}:00+05:30`);
}

export function addMinutes(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * 60_000);
}

export function addDays(dateString: string, days: number): string {
  const d = toDbDate(dateString);
  d.setUTCDate(d.getUTCDate() + days);
  return fromDbDate(d);
}

/** Day of week (0 = Sunday) for an IST calendar date. */
export function istWeekday(dateString: string): number {
  return toDbDate(dateString).getUTCDay();
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-IN", { timeZone: IST_TZ, ...options });
    formatters.set(key, f);
  }
  return f;
}

/** "1 November 2026" */
export function formatIstDate(at: Date): string {
  return formatter("date", { day: "numeric", month: "long", year: "numeric" }).format(at);
}

/** "Sunday, 1 November 2026" */
export function formatIstLongDate(at: Date): string {
  return formatter("longdate", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(at);
}

/** "9:00 pm IST" */
export function formatIstTime(at: Date): string {
  return `${formatter("time", { hour: "numeric", minute: "2-digit", hour12: true }).format(at)} IST`;
}

/** "1 Nov 2026, 9:00 pm IST" */
export function formatIstDateTime(at: Date): string {
  return `${formatter("datetime", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(at)} IST`;
}

/** Edition date string ("2026-11-01") rendered for readers. */
export function formatEditionDate(dateString: string): string {
  return formatIstLongDate(istWallTimeToUtc(dateString, "12:00"));
}
