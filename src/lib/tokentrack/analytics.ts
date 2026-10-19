import type { DerivedRow, EntryRow } from "./types";
import { deriveRow } from "./store";

export type MetricKey = "usd" | "tokens" | "usdPerHour" | "tokensPerHour" | "followers" | "hours";

export const METRIC_LABELS: Record<MetricKey, string> = {
  usd: "USD earned",
  tokens: "Tokens",
  usdPerHour: "USD / hour",
  tokensPerHour: "Tokens / hour",
  followers: "Follower change",
  hours: "Hours streamed",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function toDerived(rows: EntryRow[]): DerivedRow[] {
  return rows.map(deriveRow);
}

export function rowsInRange(
  rows: EntryRow[],
  platformId: string | "all",
  start: string,
  end: string,
): EntryRow[] {
  return rows.filter(
    (r) =>
      (platformId === "all" || r.platformId === platformId) && r.date >= start && r.date <= end,
  );
}

function sortChrono(rows: DerivedRow[]): DerivedRow[] {
  return [...rows].sort((a, b) =>
    a.date === b.date
      ? (a.startTime ?? "").localeCompare(b.startTime ?? "")
      : a.date.localeCompare(b.date),
  );
}

export interface PlatformPeriodStats {
  platformId: string;
  sessionCount: number;
  totalUsd: number;
  /** Null when no session in range recorded a token figure at all (as opposed to 0 tokens). */
  totalTokens: number | null;
  totalMinutes: number;
  totalHours: number;
  /** Null when there's no duration data to divide by. */
  avgUsdPerHour: number | null;
  /** Null when there's no duration data, or no session recorded tokens. */
  avgTokensPerHour: number | null;
  followerStart: number | null;
  followerEnd: number | null;
  /** Null unless at least one session in range has both a start and end follower snapshot. */
  followerChange: number | null;
}

/** Real, stored-data-only stats for one platform over one date range. Never fabricates a figure. */
export function computePlatformStats(
  rows: EntryRow[],
  platformId: string,
  start: string,
  end: string,
): PlatformPeriodStats {
  const derived = sortChrono(toDerived(rowsInRange(rows, platformId, start, end)));

  const totalUsd = round2(derived.reduce((s, r) => s + r.usdValue, 0));
  const tokenRows = derived.filter((r) => r.tokens !== null && r.tokens !== undefined);
  const totalTokens =
    tokenRows.length > 0 ? tokenRows.reduce((s, r) => s + (r.tokens ?? 0), 0) : null;
  const totalMinutes = derived.reduce((s, r) => s + r.minutesValue, 0);
  const totalHours = round2(totalMinutes / 60);

  const avgUsdPerHour = totalHours > 0 ? round2(totalUsd / totalHours) : null;
  const avgTokensPerHour =
    totalHours > 0 && totalTokens !== null ? round2(totalTokens / totalHours) : null;

  const followerRows = derived.filter(
    (r) =>
      r.followersStart !== null &&
      r.followersStart !== undefined &&
      r.followersEnd !== null &&
      r.followersEnd !== undefined,
  );
  const followerStart = followerRows.length > 0 ? (followerRows[0]?.followersStart ?? null) : null;
  const followerEnd =
    followerRows.length > 0 ? (followerRows[followerRows.length - 1]?.followersEnd ?? null) : null;
  const followerChange =
    followerStart !== null && followerEnd !== null ? followerEnd - followerStart : null;

  return {
    platformId,
    sessionCount: derived.length,
    totalUsd,
    totalTokens,
    totalMinutes,
    totalHours,
    avgUsdPerHour,
    avgTokensPerHour,
    followerStart,
    followerEnd,
    followerChange,
  };
}

export type Trend = "up" | "down" | "flat" | "insufficient";

export interface MetricMovement {
  current: number | null;
  previous: number | null;
  /** Null when a percentage can't be meaningfully computed (e.g. previous was zero). */
  pctChange: number | null;
  trend: Trend;
}

const FLAT_THRESHOLD_PCT = 2;

function movement(current: number | null, previous: number | null): MetricMovement {
  if (current === null || previous === null) {
    return { current, previous, pctChange: null, trend: "insufficient" };
  }
  if (previous === 0) {
    if (current === 0) return { current, previous, pctChange: 0, trend: "flat" };
    return { current, previous, pctChange: null, trend: current > 0 ? "up" : "down" };
  }
  const pctChange = round2(((current - previous) / Math.abs(previous)) * 100);
  const trend: Trend =
    Math.abs(pctChange) < FLAT_THRESHOLD_PCT ? "flat" : pctChange > 0 ? "up" : "down";
  return { current, previous, pctChange, trend };
}

export interface PlatformMovement {
  platformId: string;
  usd: MetricMovement;
  tokens: MetricMovement;
  usdPerHour: MetricMovement;
  tokensPerHour: MetricMovement;
  followers: MetricMovement;
  hours: MetricMovement;
  /** True only when both the current AND the prior comparable period have at least one logged session. */
  hasEnoughData: boolean;
}

/** The immediately preceding period of the same length, for a like-for-like comparison. */
export function previousPeriod(start: string, end: string): { start: string; end: string } {
  // UTC-safe parsing, same fix and same reason as daysBetweenInclusive above.
  const s = new Date(start);
  const e = new Date(end);
  const spanDays = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  const prevEnd = new Date(s.getTime() - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (spanDays - 1) * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(prevStart), end: iso(prevEnd) };
}

export function computePlatformMovement(
  rows: EntryRow[],
  platformId: string,
  start: string,
  end: string,
): PlatformMovement {
  const cur = computePlatformStats(rows, platformId, start, end);
  const prevRange = previousPeriod(start, end);
  const prev = computePlatformStats(rows, platformId, prevRange.start, prevRange.end);
  const hasEnoughData = cur.sessionCount > 0 && prev.sessionCount > 0;
  return {
    platformId,
    usd: movement(cur.totalUsd, prev.totalUsd),
    tokens: movement(cur.totalTokens, prev.totalTokens),
    usdPerHour: movement(cur.avgUsdPerHour, prev.avgUsdPerHour),
    tokensPerHour: movement(cur.avgTokensPerHour, prev.avgTokensPerHour),
    followers: movement(cur.followerChange, prev.followerChange),
    hours: movement(cur.totalHours, prev.totalHours),
    hasEnoughData,
  };
}

/** Highest total USD earned in range among platforms with at least one session. Null if none have data. */
export function bestPerformingPlatform(stats: PlatformPeriodStats[]): string | null {
  const withData = stats.filter((s) => s.sessionCount > 0);
  if (withData.length === 0) return null;
  return withData.reduce((best, s) => (s.totalUsd > best.totalUsd ? s : best)).platformId;
}

/** Largest positive USD % change vs. the prior period. Requires real data on both sides. */
export function strongestImprovement(movements: PlatformMovement[]): string | null {
  const withData = movements.filter((m) => m.hasEnoughData && m.usd.pctChange !== null);
  if (withData.length === 0) return null;
  const best = withData.reduce((b, m) =>
    (m.usd.pctChange ?? -Infinity) > (b.usd.pctChange ?? -Infinity) ? m : b,
  );
  return best.usd.pctChange !== null && best.usd.pctChange > 0 ? best.platformId : null;
}

/** Largest negative USD % change vs. the prior period. Requires real data on both sides. */
export function biggestDecline(movements: PlatformMovement[]): string | null {
  const withData = movements.filter((m) => m.hasEnoughData && m.usd.pctChange !== null);
  if (withData.length === 0) return null;
  const worst = withData.reduce((w, m) =>
    (m.usd.pctChange ?? Infinity) < (w.usd.pctChange ?? Infinity) ? m : w,
  );
  return worst.usd.pctChange !== null && worst.usd.pctChange < 0 ? worst.platformId : null;
}

// ── Time-series bucketing for the historical chart ───────────────────────

export type BucketGranularity = "day" | "week" | "month";

function daysBetweenInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  // Date-only strings parse as UTC midnight per spec (unlike "...T00:00:00",
  // which parses as LOCAL midnight) — matching store.tsx's shiftDateUTC
  // convention exactly, so a bucket for "2026-09-19" always stays labeled
  // "2026-09-19" regardless of the browser's timezone offset.
  let d = new Date(start);
  const endD = new Date(end);
  // Guard against a corrupt/reversed range running away.
  let safety = 0;
  while (d <= endD && safety < 3660) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
    safety += 1;
  }
  return out;
}

export function pickGranularity(start: string, end: string): BucketGranularity {
  const days = daysBetweenInclusive(start, end).length;
  if (days <= 45) return "day";
  if (days <= 210) return "week";
  return "month";
}

function bucketKeyFor(date: string, granularity: BucketGranularity): string {
  if (granularity === "day") return date;
  if (granularity === "month") return date.slice(0, 7);
  // UTC-safe, matching daysBetweenInclusive — a local-time parse here would
  // shift week-start boundaries by a day for any positive UTC-offset user.
  const d = new Date(date);
  const dow = d.getUTCDay() || 7; // Monday = 1 .. Sunday = 7
  d.setUTCDate(d.getUTCDate() - dow + 1);
  return d.toISOString().slice(0, 10);
}

function formatBucketLabel(key: string, granularity: BucketGranularity): string {
  if (granularity === "month") {
    const [y, m] = key.split("-").map(Number);
    return new Date(y ?? 2026, (m ?? 1) - 1, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
  }
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function generateBucketKeys(start: string, end: string, granularity: BucketGranularity): string[] {
  const days = daysBetweenInclusive(start, end);
  if (granularity === "day") return days;
  const keys = new Set<string>();
  days.forEach((d) => keys.add(bucketKeyFor(d, granularity)));
  return Array.from(keys);
}

function metricValueForGroup(group: DerivedRow[], metric: MetricKey): number | null {
  switch (metric) {
    case "usd":
      return round2(group.reduce((s, r) => s + r.usdValue, 0));
    case "tokens": {
      const t = group.filter((r) => r.tokens !== null && r.tokens !== undefined);
      return t.length > 0 ? t.reduce((s, r) => s + (r.tokens ?? 0), 0) : null;
    }
    case "hours":
      return round2(group.reduce((s, r) => s + r.minutesValue, 0) / 60);
    case "usdPerHour": {
      const hours = group.reduce((s, r) => s + r.minutesValue, 0) / 60;
      if (hours <= 0) return null;
      const usd = group.reduce((s, r) => s + r.usdValue, 0);
      return round2(usd / hours);
    }
    case "tokensPerHour": {
      const hours = group.reduce((s, r) => s + r.minutesValue, 0) / 60;
      const t = group.filter((r) => r.tokens !== null && r.tokens !== undefined);
      if (hours <= 0 || t.length === 0) return null;
      const tok = t.reduce((s, r) => s + (r.tokens ?? 0), 0);
      return round2(tok / hours);
    }
    case "followers": {
      const f = group.filter(
        (r) =>
          r.followersStart !== null &&
          r.followersStart !== undefined &&
          r.followersEnd !== null &&
          r.followersEnd !== undefined,
      );
      if (f.length === 0) return null;
      const firstStart = f[0]?.followersStart ?? null;
      const lastEnd = f[f.length - 1]?.followersEnd ?? null;
      return firstStart !== null && lastEnd !== null ? lastEnd - firstStart : null;
    }
    default:
      return null;
  }
}

export interface SeriesPoint {
  bucket: string;
  label: string;
  values: Record<string, number | null>;
}

/**
 * Builds one point per time bucket across the full range (including empty
 * buckets, so gaps in streaming show up as gaps rather than being skipped),
 * with each requested platform's real metric value for that bucket.
 */
export function buildTimeSeries(
  rows: EntryRow[],
  platformIds: string[],
  metric: MetricKey,
  start: string,
  end: string,
): { points: SeriesPoint[]; granularity: BucketGranularity } {
  const granularity = pickGranularity(start, end);
  const bucketKeys = generateBucketKeys(start, end, granularity);
  const points: Record<string, SeriesPoint> = {};
  bucketKeys.forEach((k) => {
    points[k] = { bucket: k, label: formatBucketLabel(k, granularity), values: {} };
  });

  for (const pid of platformIds) {
    const derived = sortChrono(toDerived(rowsInRange(rows, pid, start, end)));
    const byBucket = new Map<string, DerivedRow[]>();
    derived.forEach((r) => {
      const k = bucketKeyFor(r.date, granularity);
      const list = byBucket.get(k) ?? [];
      list.push(r);
      byBucket.set(k, list);
    });
    bucketKeys.forEach((k) => {
      const group = byBucket.get(k);
      const point = points[k];
      if (!point) return;
      point.values[pid] = group
        ? metricValueForGroup(group, metric)
        : metric === "tokens" ||
            metric === "followers" ||
            metric === "usdPerHour" ||
            metric === "tokensPerHour"
          ? null
          : 0;
    });
  }

  return {
    points: bucketKeys.map((k) => points[k]).filter((p): p is SeriesPoint => p !== undefined),
    granularity,
  };
}

export function earliestDate(rows: EntryRow[], fallback: string): string {
  if (rows.length === 0) return fallback;
  return rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0]?.date ?? fallback);
}

// ── Earnings by day of week ────────────────────────────────

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/**
 * A weekday needs at least this many streaming days before it's allowed to
 * be called "best". With one or two nights behind a weekday's average, a
 * single lucky session can make it look like a pattern when it isn't.
 */
export const WEEKDAY_MIN_DAYS = 2;

export interface WeekdayDay {
  date: string;
  usd: number;
}

/** One platform's results on one day of the week. */
export interface WeekdayPlatformStat {
  platformId: string;
  /** Days this platform actually streamed on this weekday (its own count, not the combined one). */
  dayCount: number;
  totalUsd: number;
  /** Average USD per day THIS platform streamed on this weekday; null when it never did. */
  avgUsd: number | null;
  /** This platform's share of the weekday's combined earnings; null when the combined total is <= 0. */
  shareOfTotal: number | null;
}

export interface WeekdayStat {
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  name: string;
  /** Every streaming day behind this weekday's figures, newest first. */
  days: WeekdayDay[];
  dayCount: number;
  totalUsd: number;
  /** Average USD per streaming day (not per calendar day); null when there are none. */
  avgUsd: number | null;
  bestDay: WeekdayDay | null;
  /** Share of this weekday's total that came from its single best day; null when total <= 0. */
  topDayShare: number | null;
  /** Enough streaming days (>= WEEKDAY_MIN_DAYS) to trust the average. */
  reliable: boolean;
  /**
   * The same earnings split by platform — one entry per SELECTED platform, in
   * the order given, including platforms that didn't stream that weekday (so
   * every selected platform is always individually visible).
   */
  platforms: WeekdayPlatformStat[];
}

export interface WeekdayAnalysis {
  /** Always seven entries, Monday first. */
  stats: WeekdayStat[];
  /** Index of the highest-average reliable weekday, or null when it can't be called yet. */
  bestWeekday: number | null;
  /** Distinct streaming days across the whole period. */
  streamingDays: number;
  /** At least two weekdays have enough data to be compared against each other. */
  comparable: boolean;
}

/**
 * Weekday of a yyyy-mm-dd date string, Monday = 0. Date-only strings parse
 * as UTC midnight, and the UTC getter is used to match — the same
 * timezone-safe convention as the rest of this file — so a date's weekday
 * never shifts with the viewer's timezone.
 */
function weekdayIndex(date: string): number | null {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return (d.getUTCDay() + 6) % 7;
}

/**
 * Average USD earned per STREAMING day, for each day of the week.
 *
 * Follows the app's existing rules rather than inventing new ones:
 *  - A session belongs to its entry's `date`, wherever it ends (one that
 *    crosses midnight stays on its start date — exactly how the rest of the
 *    app already treats it), so no earnings are ever counted on two days.
 *  - Earnings are deriveRow().usdValue — the same figure the existing
 *    totals use. Payouts are a separate record and never enter this.
 *  - Entries from all selected platforms on one date are combined into one
 *    "streaming day", so the average means "a typical night's take".
 *  - A date only counts as a streaming day if something was actually
 *    recorded on it: earnings, or session time. Averaging over every
 *    calendar day instead would punish weekdays for nights off.
 */
export function computeWeekdayStats(
  rows: EntryRow[],
  platformIds: string[],
  start: string,
  end: string,
): WeekdayAnalysis {
  const ids = new Set(platformIds);
  const byDate = new Map<
    string,
    { usd: number; active: boolean; per: Map<string, { usd: number; active: boolean }> }
  >();

  for (const row of rows) {
    if (!ids.has(row.platformId) || row.date < start || row.date > end) continue;
    const d = deriveRow(row);
    const cur = byDate.get(row.date) ?? { usd: 0, active: false, per: new Map() };
    cur.usd += d.usdValue;
    const worked = d.usdValue !== 0 || d.minutesValue > 0;
    if (worked) cur.active = true;
    const plat = cur.per.get(row.platformId) ?? { usd: 0, active: false };
    plat.usd += d.usdValue;
    if (worked) plat.active = true;
    cur.per.set(row.platformId, plat);
    byDate.set(row.date, cur);
  }

  const buckets: WeekdayDay[][] = WEEKDAY_NAMES.map(() => []);
  let streamingDays = 0;
  for (const [date, v] of byDate) {
    if (!v.active) continue;
    const idx = weekdayIndex(date);
    if (idx === null) continue;
    buckets[idx]?.push({ date, usd: round2(v.usd) });
    streamingDays += 1;
  }

  const stats: WeekdayStat[] = WEEKDAY_NAMES.map((name, weekday) => {
    const days = [...(buckets[weekday] ?? [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    const dayCount = days.length;
    const totalUsd = round2(days.reduce((s, x) => s + x.usd, 0));
    const bestDay = days.reduce<WeekdayDay | null>(
      (best, x) => (best === null || x.usd > best.usd ? x : best),
      null,
    );
    // Platform split for this weekday. Uses the same streaming-day rule per
    // platform, so a platform's average is "per day IT streamed", and the
    // platforms' totals add up to the combined total above.
    const combinedRaw = days.reduce((sum, x) => sum + (byDate.get(x.date)?.usd ?? 0), 0);
    const platformStats: WeekdayPlatformStat[] = [...new Set(platformIds)].map((platformId) => {
      let pDays = 0;
      let pTotal = 0;
      for (const x of days) {
        const p = byDate.get(x.date)?.per.get(platformId);
        if (p && p.active) pDays += 1;
        if (p) pTotal += p.usd;
      }
      return {
        platformId,
        dayCount: pDays,
        totalUsd: round2(pTotal),
        avgUsd: pDays > 0 ? round2(pTotal / pDays) : null,
        shareOfTotal: combinedRaw > 0 ? pTotal / combinedRaw : null,
      };
    });
    return {
      weekday,
      name,
      days,
      dayCount,
      totalUsd,
      avgUsd: dayCount > 0 ? round2(totalUsd / dayCount) : null,
      bestDay,
      topDayShare: bestDay && totalUsd > 0 ? bestDay.usd / totalUsd : null,
      reliable: dayCount >= WEEKDAY_MIN_DAYS,
      platforms: platformStats,
    };
  });

  const reliable = stats.filter((s) => s.reliable && s.avgUsd !== null);
  const comparable = reliable.length >= 2;
  let bestWeekday: number | null = null;
  if (comparable) {
    const top = reliable.reduce((a, b) => ((b.avgUsd ?? 0) > (a.avgUsd ?? 0) ? b : a));
    if ((top.avgUsd ?? 0) > 0) bestWeekday = top.weekday;
  }

  return { stats, bestWeekday, streamingDays, comparable };
}

/**
 * The weekday a single platform earns the most on, or null when there isn't
 * enough history to say. Same standard as the combined "best day": a weekday
 * only qualifies with at least WEEKDAY_MIN_DAYS of that platform's own
 * streaming days, and at least two weekdays must qualify before one is named.
 */
export function bestWeekdayForPlatform(
  stats: WeekdayStat[],
  platformId: string,
): { weekday: number; name: string; avgUsd: number; dayCount: number } | null {
  const qualifying = stats
    .map((s) => ({ s, p: s.platforms.find((x) => x.platformId === platformId) }))
    .filter(
      (x): x is { s: WeekdayStat; p: WeekdayPlatformStat } =>
        x.p !== undefined && x.p.dayCount >= WEEKDAY_MIN_DAYS && x.p.avgUsd !== null,
    );
  if (qualifying.length < 2) return null;
  const top = qualifying.reduce((a, b) => ((b.p.avgUsd ?? 0) > (a.p.avgUsd ?? 0) ? b : a));
  if ((top.p.avgUsd ?? 0) <= 0) return null;
  return {
    weekday: top.s.weekday,
    name: top.s.name,
    avgUsd: top.p.avgUsd ?? 0,
    dayCount: top.p.dayCount,
  };
}
