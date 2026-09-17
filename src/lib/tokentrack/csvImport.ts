import type { EntryRow, Payout } from "./types";

/**
 * Imports a TokenTrack-format CSV export (the same columns this app's own
 * `entryRowToDb` mapping writes to Supabase) back into EntryRow-shaped
 * objects for `importRows`. Every value is carried through exactly as
 * written in the file — this module only converts *types* (string -> number,
 * "True"/"False" -> boolean, full timestamp -> "HHmm" no-colon), it never
 * invents, drops, or reinterprets a figure.
 */

const EXPECTED_HEADERS = [
  "id",
  "platform_id",
  "date",
  "start_time",
  "end_time",
  "time_of_day",
  "room_count",
  "followers_start",
  "followers_end",
  "tokens",
  "usd_actual",
  "followers",
  "minutes",
  "token_value_usd_at_entry",
  "note",
  "origin",
  "verified",
  "import_key",
  "import_batch_id",
  "imported_at",
  "created_at",
  "updated_at",
] as const;

/** Parses one line of RFC4180-ish CSV, handling quoted fields with embedded commas/quotes. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  // Normalise line endings, drop a trailing blank line, keep everything else.
  const lines = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0] ?? "").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = cells[i] ?? "";
    });
    return record;
  });
}

const blankToNull = (v: string | undefined): string | null =>
  v && v.trim() !== "" ? v.trim() : null;

/** "142.0" -> 142, "" -> null. Never rounds or reformats the underlying value. */
const toNumOrNull = (v: string | undefined): number | null => {
  const s = blankToNull(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Export writes Python-style "True"/"False"; also accept lowercase/JSON style. */
const toBool = (v: string | undefined): boolean => {
  const s = (v ?? "").trim().toLowerCase();
  return s === "true" || s === "1";
};

/**
 * The export's start_time/end_time carry a fixed placeholder date
 * ("2026-08-24 09:00:00") — only the time-of-day portion is the real
 * data, the row's actual calendar date lives in its own `date` column.
 * Returned as no-colon "HHmm" ("0900"), matching how the app stores
 * times everywhere else.
 */
const toHHmm = (v: string | undefined): string | null => {
  const s = blankToNull(v);
  if (s === null) return null;
  const match = s.match(/(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, hh, mm] = match;
  return hh && mm ? `${hh}${mm}` : null;
};

export interface CsvImportResult {
  rows: Array<Partial<EntryRow> & Pick<EntryRow, "platformId" | "date">>;
  skipped: number;
  missingHeaders: string[];
}

/** Converts raw CSV text into rows ready for `importRows`. Throws nothing skips a bad line instead — it counts it. */
export function parseTokenTrackCsv(text: string): CsvImportResult {
  const records = parseCsv(text);
  const firstRecord = records[0];
  const missingHeaders = firstRecord ? EXPECTED_HEADERS.filter((h) => !(h in firstRecord)) : [];

  let skipped = 0;
  const rows: Array<Partial<EntryRow> & Pick<EntryRow, "platformId" | "date">> = [];

  for (const r of records) {
    const platformId = blankToNull(r["platform_id"]);
    const date = blankToNull(r["date"]);
    // These two are the only fields importRows strictly requires — everything
    // else is preserved as-is, blank or not.
    if (!platformId || !date) {
      skipped += 1;
      continue;
    }

    const row: Partial<EntryRow> & Pick<EntryRow, "platformId" | "date"> = {
      platformId,
      date,
      startTime: toHHmm(r["start_time"]),
      endTime: toHHmm(r["end_time"]),
      timeOfDay: blankToNull(r["time_of_day"]),
      roomCount: toNumOrNull(r["room_count"]),
      followersStart: toNumOrNull(r["followers_start"]),
      followersEnd: toNumOrNull(r["followers_end"]),
      tokens: toNumOrNull(r["tokens"]),
      usdActual: toNumOrNull(r["usd_actual"]),
      followers: toNumOrNull(r["followers"]),
      minutes: toNumOrNull(r["minutes"]),
      tokenValueUsdAtEntry: toNumOrNull(r["token_value_usd_at_entry"]),
      note: r["note"] ?? "",
      verified: toBool(r["verified"]),
    };

    // Carry the file's own import_key through when present so re-imports of
    // the same export always land on the same rows (matches store.tsx's
    // rowImportKey fallback exactly when absent).
    const importKey = blankToNull(r["import_key"]);
    if (importKey) row.importKey = importKey;

    rows.push(row);
  }

  return { rows, skipped, missingHeaders };
}

// ---------------------------------------------------------------------------
// Payout import
//
// Historical payout backups (e.g. the earlier app version's export) predate
// this app's tokensAmount tracking. tokensAmount is what currentTokensFor
// subtracts to compute a platform's remaining unpaid token balance — a
// payout imported without it still reduces the USD balance correctly (via
// amountUsd) but contributes no token figure, which is fine when the source
// file has no token data. When a rate is available for that platform,
// tokensAmount is derived from amount_usd / rate rather than left at 0,
// since 0 would silently understate how many tokens that payout covers.
// ---------------------------------------------------------------------------

const REQUIRED_PAYOUT_HEADERS = ["platform_id", "date", "amount_usd"] as const;

/** True when a parsed CSV's header row looks like a payout export rather than an entries export. */
export function looksLikePayoutHeaders(headers: string[]): boolean {
  return (
    headers.includes("amount_usd") && !headers.includes("tokens") && !headers.includes("room_count")
  );
}

/** Reads just the header row — used to route a file to the right parser before fully parsing it. */
export function sniffCsvHeaders(text: string): string[] {
  const firstLine = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")[0] ?? "";
  return parseCsvLine(firstLine).map((h) => h.trim());
}

export interface PayoutImportResult {
  rows: Array<
    Pick<Payout, "platformId" | "date" | "amountUsd"> &
      Partial<Omit<Payout, "platformId" | "date" | "amountUsd">>
  >;
  skipped: number;
  missingRequiredHeaders: string[];
}

/**
 * Converts a payout backup CSV into rows ready for `importPayouts`. Accepts
 * both this app's own column names (id, time, tokens_amount) and an older
 * backup's shape (which has neither time nor a tokens figure at all) —
 * every field present in the file is carried through unchanged; only
 * tokensAmount is ever derived, and only when the file doesn't supply it.
 */
export function parseTokenTrackPayoutCsv(
  text: string,
  tokenRateByPlatform: Record<string, number | null>,
): PayoutImportResult {
  const records = parseCsv(text);
  const firstRecord = records[0];
  const missingRequiredHeaders = firstRecord
    ? REQUIRED_PAYOUT_HEADERS.filter((h) => !(h in firstRecord))
    : [];

  let skipped = 0;
  const rows: PayoutImportResult["rows"] = [];

  for (const r of records) {
    const platformId = blankToNull(r["platform_id"]);
    const date = blankToNull(r["date"]);
    const amountUsd = toNumOrNull(r["amount_usd"]);

    if (!platformId || !date || amountUsd === null) {
      skipped += 1;
      continue;
    }

    // Accept this app's own "tokens_amount" column, or an older/other
    // backup's "tokens_deducted" naming, before falling back to deriving one.
    let tokensAmount = toNumOrNull(r["tokens_amount"]) ?? toNumOrNull(r["tokens_deducted"]);
    if (tokensAmount === null) {
      const rate = tokenRateByPlatform[platformId];
      tokensAmount = rate ? Math.round((amountUsd / rate) * 100) / 100 : null;
    }

    const id = blankToNull(r["id"]);
    const destination = blankToNull(r["destination"]);
    const note = blankToNull(r["note"]);
    const createdAt = blankToNull(r["created_at"]);

    rows.push({
      ...(id ? { id } : {}),
      platformId,
      date,
      time: blankToNull(r["time"]) ?? blankToNull(r["payout_time"]),
      amountUsd,
      tokensAmount,
      ...(destination ? { destination } : {}),
      usdPhpRateAtEntry: toNumOrNull(r["usd_php_rate_at_entry"]),
      ...(note ? { note } : {}),
      ...(createdAt ? { createdAt } : {}),
    });
  }

  return { rows, skipped, missingRequiredHeaders };
}
