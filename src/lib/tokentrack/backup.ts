import type { EntryRow, Payout, Platform } from "./types";

/**
 * A complete, self-contained TokenTrack backup: every platform's settings,
 * every recorded entry, and every recorded payout, in the app's own
 * TypeScript shapes (not the Supabase column names) so it round-trips
 * through `createBackup`/`restoreBackup` with full fidelity and needs no
 * remapping to inspect or hand-edit.
 */
export const BACKUP_FORMAT_VERSION = 1;

export interface TokenTrackBackup {
  app: "TokenTrack";
  version: number;
  exportedAt: string;
  platforms: Platform[];
  entries: EntryRow[];
  payouts: Payout[];
}

export type BackupParseResult =
  { ok: true; backup: TokenTrackBackup } | { ok: false; error: string };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Validates the shape of an uploaded backup file before anything in it is
 * used to touch the database. Strict on the presence of the three required
 * arrays — a truncated or hand-edited file missing e.g. `platforms`
 * entirely would otherwise silently restore nothing for that table with no
 * indication why. Permissive on `version`/`exportedAt` so an older or
 * slightly hand-edited backup still restores rather than being rejected
 * outright.
 */
export function parseBackupFile(text: string): BackupParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "This file isn't valid JSON — it doesn't look like a TokenTrack backup.",
    };
  }

  if (!isPlainObject(parsed)) {
    return { ok: false, error: "This file doesn't look like a TokenTrack backup." };
  }
  if (parsed.app !== "TokenTrack") {
    return {
      ok: false,
      error: "This file doesn't look like a TokenTrack backup (missing the app marker).",
    };
  }
  if (
    !Array.isArray(parsed.platforms) ||
    !Array.isArray(parsed.entries) ||
    !Array.isArray(parsed.payouts)
  ) {
    return {
      ok: false,
      error: "This backup is missing one or more of its platforms/entries/payouts sections.",
    };
  }

  return {
    ok: true,
    backup: {
      app: "TokenTrack",
      version: typeof parsed.version === "number" ? parsed.version : BACKUP_FORMAT_VERSION,
      exportedAt:
        typeof parsed.exportedAt === "string" ? parsed.exportedAt : new Date().toISOString(),
      platforms: parsed.platforms as Platform[],
      entries: parsed.entries as EntryRow[],
      payouts: parsed.payouts as Payout[],
    },
  };
}
