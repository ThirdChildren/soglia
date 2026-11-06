// The time the sun is shown at (D54 in docs/plans/M5.md): a local wall-clock text `YYYY-MM-DDTHH:MM` of the house
// (Italy, see sun.ts). Pure; the real clock is injected by the caller, never read here.

import {
  daysInMonth,
  formatLocalDateTime,
  localToUtcMs,
  parseLocalDateTime,
  sunPosition,
  utcToLocalText,
} from './sun';
import type { LocalDateTime } from './sun';

/** The hour shown when the real time is at night, so the first look at the house has light. */
export const FALLBACK_HOUR = 10;

/** Where a sun time came from (the `source=` of the `sun set` log line). */
export type SunTimeSource = 'url' | 'saved' | 'default' | 'ui';

/** The text unchanged when it is a real `YYYY-MM-DDTHH:MM` local date-time (1900-2100), else null. */
export function parseSunTime(text: unknown): string | null {
  const t = parseLocalDateTime(text);
  return t ? formatLocalDateTime(t) : null;
}

/** A `time` URL value (`2026-12-21T10:00`, seconds allowed) as a sun time, dropping the seconds; null if invalid. */
export function sunTimeFromParam(time: string | null | undefined): string | null {
  if (typeof time !== 'string') return null;
  return parseSunTime(time.length === 19 ? time.slice(0, 16) : time);
}

/** True when the sun is above the geometric horizon at `sunTime` in the place. */
export function isSunUp(sunTime: string, lat: number, lon: number): boolean {
  const utc = localToUtcMs(sunTime);
  return utc !== null && sunPosition(utc, lat, lon).altitudeDeg > 0;
}

/**
 * The sun time to start from when nothing was asked or saved: the local time of the house now, rounded to the
 * hour; at night, 10:00 of the same day.
 */
export function defaultSunTime(clockMs: number, lat: number, lon: number): string {
  const hourMs = 3_600_000;
  const rounded = Math.round(clockMs / hourMs) * hourMs;
  const text = utcToLocalText(rounded);
  const t = parseLocalDateTime(text);
  // Rounding in UTC keeps the minutes at 00 for whole-hour offsets, as in Italy.
  const nowText = t ? formatLocalDateTime({ ...t, minute: 0 }) : text;
  if (isSunUp(nowText, lat, lon)) return nowText;
  const parts = parseLocalDateTime(nowText);
  return parts ? formatLocalDateTime({ ...parts, hour: FALLBACK_HOUR, minute: 0 }) : nowText;
}

function parts(sunTime: string): LocalDateTime {
  const t = parseLocalDateTime(sunTime);
  if (!t) throw new Error(`not a sun time: ${String(sunTime)}`);
  return t;
}

/** `delta` hours later (or earlier), wrapping around 24 on the SAME day. */
export function stepHour(sunTime: string, delta: number): string {
  const t = parts(sunTime);
  const hour = (((t.hour + Math.trunc(delta)) % 24) + 24) % 24;
  return formatLocalDateTime({ ...t, hour });
}

/** `delta` months later (or earlier), wrapping December to January WITHOUT changing the year; the day is clamped. */
export function stepMonth(sunTime: string, delta: number): string {
  const t = parts(sunTime);
  const month = ((((t.month - 1 + Math.trunc(delta)) % 12) + 12) % 12) + 1;
  const day = Math.min(t.day, daysInMonth(t.year, month));
  return formatLocalDateTime({ ...t, month, day });
}

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** `10:00` of a sun time. */
export function hourLabel(sunTime: string): string {
  const t = parts(sunTime);
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
}

/** `Dec` of a sun time. */
export function monthLabel(sunTime: string): string {
  return MONTH_NAMES[parts(sunTime).month - 1];
}
