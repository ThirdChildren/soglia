// Sun position, pure: no imports from @iwsdk/core or three, no dependency (D54 in docs/plans/M5.md).
//
// The formulas are the standard low-accuracy solar coordinates of Meeus, "Astronomical Algorithms" (chapters 7, 12,
// 25, 28), the same series the NOAA Solar Calculator uses: geometric mean longitude and anomaly, equation of the
// centre, apparent longitude, obliquity, declination, equation of time, hour angle. Written from the published
// formulas; no code was copied. Accuracy is about 0.01 degrees for the years 1900-2100. There is NO atmospheric
// refraction (it adds under 0.6 degrees near the horizon), so "above the horizon" means the geometric altitude > 0.
//
// Time zone: the demo houses are in Italy, so a local wall-clock time is read with the European Union rule
// (UTC+1, UTC+2 from the last Sunday of March 01:00 UTC to the last Sunday of October 01:00 UTC). Other zones are
// out of scope.

const DEG = Math.PI / 180;
const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/** The sun as seen from a place: azimuth clockwise from true north, altitude above the geometric horizon. */
export interface SunPosition {
  readonly azimuthDeg: number;
  readonly altitudeDeg: number;
}

const mod = (a: number, n: number): number => ((a % n) + n) % n;

/** Where the sun is at `utcMs` (ms since the epoch) for a place at `latDeg` north and `lonDeg` east. */
export function sunPosition(utcMs: number, latDeg: number, lonDeg: number): SunPosition {
  const jd = utcMs / MS_PER_DAY + 2440587.5;
  const t = (jd - 2451545) / 36525; // Julian centuries since J2000.0

  const meanLong = mod(280.46646 + t * (36000.76983 + t * 0.0003032), 360); // L0
  const meanAnom = 357.52911 + t * (35999.05029 - 0.0001537 * t); // M
  const ecc = 0.016708634 - t * (0.000042037 + 0.0000001267 * t); // e
  const m = meanAnom * DEG;
  const center =
    Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m) * 0.000289;
  const trueLong = meanLong + center;
  const omega = (125.04 - 1934.136 * t) * DEG;
  const apparentLong = (trueLong - 0.00569 - 0.00478 * Math.sin(omega)) * DEG;
  const meanObliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliq = (meanObliq + 0.00256 * Math.cos(omega)) * DEG;
  const declination = Math.asin(Math.sin(obliq) * Math.sin(apparentLong));

  const y = Math.tan(obliq / 2) ** 2;
  const l0 = meanLong * DEG;
  const equationOfTimeMin =
    4 *
    (180 / Math.PI) *
    (y * Math.sin(2 * l0) -
      2 * ecc * Math.sin(m) +
      4 * ecc * y * Math.sin(m) * Math.cos(2 * l0) -
      0.5 * y * y * Math.sin(4 * l0) -
      1.25 * ecc * ecc * Math.sin(2 * m));

  const utcMinutes = mod(utcMs, MS_PER_DAY) / MS_PER_MINUTE;
  const trueSolarMin = mod(utcMinutes + equationOfTimeMin + 4 * lonDeg, 1440);
  const hourAngle = (trueSolarMin / 4 - 180) * DEG;

  const lat = latDeg * DEG;
  const sinAlt =
    Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  // Azimuth from the south, positive towards the west; +180 turns it into "clockwise from north".
  const fromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat),
  );
  return { azimuthDeg: mod(fromSouth / DEG + 180, 360), altitudeDeg: altitude / DEG };
}

// ---------------------------------------------------------------------------------------------------------------
// Local time (Italy, European Union rule)

/** The UTC instant of the last Sunday of `month` (1-based) at 01:00 UTC. */
function lastSundayAt01Utc(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dow = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay(); // 0 = Sunday
  return Date.UTC(year, month - 1, lastDay - dow, 1, 0, 0);
}

/** `[start, end)` of summer time in `year`, as UTC instants. */
export function euSummerTimeRange(year: number): readonly [number, number] {
  return [lastSundayAt01Utc(year, 3), lastSundayAt01Utc(year, 10)];
}

/** Offset from UTC (in minutes) in force at the UTC instant `utcMs`: 120 in summer time, 60 otherwise. */
export function euUtcOffsetAtUtc(utcMs: number): number {
  const [start, end] = euSummerTimeRange(new Date(utcMs).getUTCFullYear());
  return utcMs >= start && utcMs < end ? 120 : 60;
}

/**
 * Offset from UTC (in minutes) for the local wall-clock time `year-month-day hour:00`: 60 or 120. On the hour that
 * happens twice (autumn) the first one, in summer time, wins; on the hour that does not exist (spring) the result
 * is the one that moves the time forward.
 */
export function euUtcOffsetMinutes(year: number, month: number, day: number, hour: number): number {
  const wall = Date.UTC(year, month - 1, day, hour, 0, 0);
  const [start, end] = euSummerTimeRange(year);
  const asSummer = wall - 120 * MS_PER_MINUTE;
  return asSummer >= start && asSummer < end ? 120 : 60;
}

/** The years the sun module covers (about 0.01 degrees of accuracy): a local date-time outside them is not valid. */
export const SUN_MIN_YEAR = 1900;
export const SUN_MAX_YEAR = 2100;
const SUN_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** The parts of a local date-time `YYYY-MM-DDTHH:MM` (no seconds, no zone). */
export interface LocalDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

/** Parts of a local date-time text, or null when it is not a real date-time of that exact shape. */
export function parseLocalDateTime(text: unknown): LocalDateTime | null {
  if (typeof text !== 'string') return null;
  const m = SUN_TIME_PATTERN.exec(text);
  if (!m) return null;
  const [year, month, day, hour, minute] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || year < SUN_MIN_YEAR || year > SUN_MAX_YEAR) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day, hour, minute };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

export function formatLocalDateTime(t: LocalDateTime): string {
  return `${pad(t.year, 4)}-${pad(t.month)}-${pad(t.day)}T${pad(t.hour)}:${pad(t.minute)}`;
}

/** The UTC instant of a local date-time text (Italy). Null for text that is not a valid local date-time. */
export function localToUtcMs(text: string): number | null {
  const t = parseLocalDateTime(text);
  if (!t) return null;
  const offset = euUtcOffsetMinutes(t.year, t.month, t.day, t.hour);
  return Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute) - offset * MS_PER_MINUTE;
}

/** The local date-time text (Italy) of a UTC instant. */
export function utcToLocalText(utcMs: number): string {
  const local = new Date(utcMs + euUtcOffsetAtUtc(utcMs) * MS_PER_MINUTE);
  return formatLocalDateTime({
    year: local.getUTCFullYear(),
    month: local.getUTCMonth() + 1,
    day: local.getUTCDate(),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Directions

/**
 * The direction of a compass bearing (clockwise from true north) as an angle clockwise from the plan's "up" (-z),
 * given the house's `northAngleDeg` (clockwise from plan "up" to true north). In [0, 360).
 */
export function sunBearingToPlan(bearingDeg: number, northAngleDeg: number): number {
  return mod(bearingDeg + northAngleDeg, 360);
}

/** The unit vector [x, z] of a plan angle (clockwise from -z): the plan is x right, z towards the viewer. */
export function planAngleToVector(planAngleDeg: number): readonly [number, number] {
  const a = planAngleDeg * DEG;
  return [Math.sin(a), -Math.cos(a)];
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type CompassName = (typeof COMPASS)[number];

/** The eight-point compass name of a bearing: 0 = N, 90 = E, 180 = S, 270 = W. */
export function compassName(bearingDeg: number): CompassName {
  return COMPASS[Math.round(mod(bearingDeg, 360) / 45) % 8];
}
