import { useRef, useState } from "react";
import {
  looksLikePayoutHeaders,
  parseTokenTrackCsv,
  parseTokenTrackPayoutCsv,
  sniffCsvHeaders,
} from "@/lib/tokentrack/csvImport";
import { parseBackupFile } from "@/lib/tokentrack/backup";
import { useTokenTrack } from "@/lib/tokentrack/store";

interface EntryImportSummary {
  kind: "entries";
  fileName: string;
  inserted: number;
  enriched: number;
  unchanged: number;
  skipped: number;
  missingHeaders: string[];
  unknownPlatformIds: string[];
}

interface PayoutImportSummary {
  kind: "payouts";
  fileName: string;
  inserted: number;
  skipped: number;
  missingHeaders: string[];
}

type ImportSummary = EntryImportSummary | PayoutImportSummary;

interface RestoreSummary {
  fileName: string;
  platformsUpserted: number;
  entriesInserted: number;
  entriesEnriched: number;
  entriesUnchanged: number;
  payoutsInserted: number;
  payoutsSkipped: number;
}

export function BackupsImport() {
  const { platforms, rows, payouts, importRows, importPayouts, createBackup, restoreBackup } =
    useTokenTrack();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<RestoreSummary | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const knownPlatformIds = new Set(platforms.map((p) => p.id));
  const tokenRateByPlatform = Object.fromEntries(platforms.map((p) => [p.id, p.tokenValueUsd]));

  const handleCreateBackup = () => {
    const backup = createBackup();
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = backup.exportedAt.slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `tokentrack-backup-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleRestoreFile = async (file: File) => {
    setRestoreBusy(true);
    setRestoreError(null);
    setRestoreSummary(null);
    try {
      const text = await file.text();
      const result = parseBackupFile(text);
      if (!result.ok) {
        setRestoreError(result.error);
        return;
      }
      const stats = restoreBackup(result.backup);
      setRestoreSummary({ fileName: file.name, ...stats });
    } catch {
      setRestoreError("Couldn't read that file as a TokenTrack backup. Nothing was restored.");
    } finally {
      setRestoreBusy(false);
    }
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const text = await file.text();
      const headers = sniffCsvHeaders(text);

      if (looksLikePayoutHeaders(headers)) {
        const {
          rows: payoutRows,
          skipped,
          missingRequiredHeaders,
        } = parseTokenTrackPayoutCsv(text, tokenRateByPlatform);

        if (payoutRows.length === 0) {
          setError(
            missingRequiredHeaders.length > 0
              ? `This file is missing expected column(s): ${missingRequiredHeaders.join(", ")}`
              : "No usable rows found in this file — every row was missing a platform_id, date, or amount_usd.",
          );
          return;
        }

        const stats = importPayouts(payoutRows);

        setSummary({
          kind: "payouts",
          fileName: file.name,
          inserted: stats.inserted,
          skipped: stats.skipped + skipped,
          missingHeaders: missingRequiredHeaders,
        });
        return;
      }

      const { rows: entryRows, skipped, missingHeaders } = parseTokenTrackCsv(text);

      if (entryRows.length === 0) {
        setError(
          missingHeaders.length > 0
            ? `This file is missing expected column(s): ${missingHeaders.join(", ")}`
            : "No usable rows found in this file — every row was missing a platform_id or date.",
        );
        return;
      }

      const unknownPlatformIds = Array.from(
        new Set(entryRows.map((r) => r.platformId).filter((id) => !knownPlatformIds.has(id))),
      );

      const batchId = `import-${Date.now()}`;
      const stats = importRows(entryRows, batchId);

      setSummary({
        kind: "entries",
        fileName: file.name,
        inserted: stats.inserted,
        enriched: stats.enriched,
        unchanged: stats.unchanged,
        skipped,
        missingHeaders,
        unknownPlatformIds,
      });
    } catch {
      setError("Couldn't read that file as CSV. Nothing was imported.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[900px] space-y-6 p-6">
      <header>
        <h1 className="text-base font-semibold tracking-tight">Backups &amp; import</h1>
      </header>

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Full backup</h2>
          <p className="text-xs text-muted-foreground">
            A complete TokenTrack backup — every platform, entry, and payout — in a single file you
            keep yourself. Restoring never deletes or overwrites anything already recorded: platform
            settings are upserted, entries and payouts are added only if they're not already
            present.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-panel p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCreateBackup}
              className="rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/80"
            >
              Create full backup…
            </button>
            <span className="text-xs text-muted-foreground">
              {platforms.length} platforms · {rows.length} entries · {payouts.length} payouts
            </span>
          </div>

          <div>
            <input
              ref={restoreInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleRestoreFile(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={restoreBusy}
              onClick={() => restoreInputRef.current?.click()}
              className="rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-50"
            >
              {restoreBusy ? "Restoring…" : "Restore from backup file…"}
            </button>

            {restoreError && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {restoreError}
              </p>
            )}

            {restoreSummary && (
              <div className="mt-3 space-y-1 rounded-md border border-border bg-console px-3 py-2 text-xs">
                <p className="font-medium text-foreground">{restoreSummary.fileName}</p>
                <p className="text-muted-foreground">
                  {restoreSummary.platformsUpserted} platform
                  {restoreSummary.platformsUpserted === 1 ? "" : "s"} updated ·{" "}
                  {restoreSummary.entriesInserted} entr
                  {restoreSummary.entriesInserted === 1 ? "y" : "ies"} added ·{" "}
                  {restoreSummary.entriesEnriched} enriched · {restoreSummary.entriesUnchanged}{" "}
                  already up to date · {restoreSummary.payoutsInserted} payout
                  {restoreSummary.payoutsInserted === 1 ? "" : "s"} added
                  {restoreSummary.payoutsSkipped > 0 &&
                    ` · ${restoreSummary.payoutsSkipped} payouts already present`}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">CSV import</h2>
          <p className="text-xs text-muted-foreground">
            Load a TokenTrack entries or payouts CSV export. Entry rows are matched by their
            platform + date + start time. Payout rows are matched by their original id — new payouts
            are added, already-imported ones are skipped. Nothing already recorded is ever deleted
            or overwritten with different figures.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-panel p-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary/80 disabled:opacity-50"
          >
            {busy ? "Importing…" : "Choose CSV file…"}
          </button>

          {error && (
            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {summary && summary.kind === "entries" && (
            <div className="mt-3 space-y-1 rounded-md border border-border bg-console px-3 py-2 text-xs">
              <p className="font-medium text-foreground">{summary.fileName}</p>
              <p className="text-muted-foreground">
                {summary.inserted} row{summary.inserted === 1 ? "" : "s"} added · {summary.enriched}{" "}
                enriched · {summary.unchanged} already up to date
                {summary.skipped > 0 && ` · ${summary.skipped} skipped (missing platform_id/date)`}
              </p>
              {summary.unknownPlatformIds.length > 0 && (
                <p className="text-amber-500">
                  Note: these rows imported fine but use a platform_id not currently configured in
                  Settings, so they won&apos;t show on a dashboard card yet:{" "}
                  {summary.unknownPlatformIds.join(", ")}
                </p>
              )}
            </div>
          )}

          {summary && summary.kind === "payouts" && (
            <div className="mt-3 space-y-1 rounded-md border border-border bg-console px-3 py-2 text-xs">
              <p className="font-medium text-foreground">{summary.fileName}</p>
              <p className="text-muted-foreground">
                {summary.inserted} payout{summary.inserted === 1 ? "" : "s"} added
                {summary.skipped > 0 && ` · ${summary.skipped} already imported or unusable`}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
