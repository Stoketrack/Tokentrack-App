import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { fmtNum, fmtUsd, todayISO, useTokenTrack } from "@/lib/tokentrack/store";
import { AddPayoutDialog } from "@/components/tokentrack/AddPayoutDialog";

export function Payouts() {
  const { platforms, payouts, currentTotalFor } = useTokenTrack();
  const [recordFor, setRecordFor] = useState<string>(platforms[0]?.id ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);

  const platformName = (id: string) =>
    platforms.find((p) => p.id === id)?.displayName?.trim() ||
    platforms.find((p) => p.id === id)?.name ||
    id;

  const sorted = useMemo(
    () =>
      [...payouts].sort((a, b) =>
        a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
      ),
    [payouts],
  );

  const recordPlatform = platforms.find((p) => p.id === recordFor);

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Payouts</h1>
          <p className="text-xs text-muted-foreground">
            Every recorded withdrawal, across all platforms. Recording a payout reduces that
            platform's current balance — the underlying earnings history is never touched.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={recordFor}
            onChange={(e) => setRecordFor(e.target.value)}
            className="rounded-md border border-input bg-console px-2 py-1.5 text-xs outline-none focus:border-ring"
          >
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName?.trim() || p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            disabled={!recordPlatform}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="size-3.5" /> Record payout
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {platforms.map((p) => (
          <div key={p.id} className="rounded-lg border border-border bg-panel px-3 py-2.5">
            <p className="label-micro truncate">{p.displayName?.trim() || p.name}</p>
            <p className="numeric mt-0.5 text-sm font-semibold leading-none">
              {fmtUsd(currentTotalFor(p.id))}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-panel">
        {sorted.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">No payouts recorded yet.</p>
        ) : (
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="sticky top-0 bg-panel-header">
              <tr className="label-micro">
                <th className="px-3 py-2 font-semibold">Platform</th>
                <th className="px-2 py-2 font-semibold">Date</th>
                <th className="px-2 py-2 font-semibold">Time</th>
                <th className="px-2 py-2 font-semibold">USD</th>
                <th className="px-2 py-2 font-semibold">Tokens</th>
                <th className="px-2 py-2 font-semibold">Destination</th>
                <th className="px-2 py-2 font-semibold">Note</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2 font-medium">{platformName(p.platformId)}</td>
                  <td className="numeric px-2 py-2 text-muted-foreground">{p.date}</td>
                  <td className="numeric px-2 py-2 text-muted-foreground">{p.time ?? "—"}</td>
                  <td className="numeric px-2 py-2">{fmtUsd(p.amountUsd)}</td>
                  <td className="numeric px-2 py-2 text-token">
                    {p.tokensAmount !== null ? fmtNum(p.tokensAmount) : "—"}
                  </td>
                  <td className="px-2 py-2">{p.destination}</td>
                  <td
                    className="max-w-[240px] truncate px-2 py-2 text-muted-foreground"
                    title={p.note}
                  >
                    {p.note || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialogOpen && recordPlatform && (
        <AddPayoutDialog
          platform={recordPlatform}
          date={todayISO()}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}
