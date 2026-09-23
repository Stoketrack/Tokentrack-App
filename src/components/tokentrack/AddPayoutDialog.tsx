import { useState } from "react";
import { X } from "lucide-react";
import { fmtNum, fmtPhp, fmtUsd, useTokenTrack } from "@/lib/tokentrack/store";
import type { Platform } from "@/lib/tokentrack/types";

interface Props {
  platform: Platform;
  date: string;
  onClose: () => void;
}

const nowHHmm = () => new Date().toISOString().slice(11, 16);

export function AddPayoutDialog({ platform, date, onClose }: Props) {
  const { addPayout, currentTotalFor, currentTokensFor, usdPhpRate } = useTokenTrack();
  const [payoutDate, setPayoutDate] = useState(date);
  const [payoutTime, setPayoutTime] = useState(nowHHmm());
  const [amount, setAmount] = useState("");
  const [tokensAmount, setTokensAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const balance = currentTotalFor(platform.id);
  const tokenBalance = currentTokensFor(platform.id);
  const rate = platform.tokenValueUsd;
  const rawAmount = amount.trim() === "" ? null : Number(amount);
  const rawTokens = tokensAmount.trim() === "" ? null : Number(tokensAmount);
  // Either field is sufficient on its own — whichever one is filled drives
  // the other via the platform's existing configured rate. Never changes
  // that rate; just applies it. If both are filled, both are taken as
  // entered (not forced to reconcile) — someone may know the real figures
  // differ slightly from the theoretical rate.
  const derivedAmount =
    rawAmount !== null
      ? rawAmount
      : rawTokens !== null && rate
        ? Math.round(rawTokens * rate * 100) / 100
        : null;
  const derivedTokens =
    rawTokens !== null ? rawTokens : rawAmount !== null && rate ? Math.round((rawAmount / rate) * 100) / 100 : null;
  const valid = derivedAmount !== null && Number.isFinite(derivedAmount) && derivedAmount > 0;
  const tokensValid = derivedTokens === null || (Number.isFinite(derivedTokens) && derivedTokens >= 0);

  const save = () => {
    if (!valid) {
      setError("Enter a valid payout amount greater than zero.");
      return;
    }
    if (!tokensValid) {
      setError("Tokens must be zero or a positive number, or left blank.");
      return;
    }
    addPayout({
      platformId: platform.id,
      date: payoutDate,
      time: payoutTime || null,
      amountUsd: derivedAmount as number,
      tokensAmount: derivedTokens,
      note,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-[520px] rounded-xl border border-border bg-panel shadow-panel-lift">
        <header className="flex items-center justify-between border-b border-border bg-panel-header px-4 py-2.5">
          <div>
            <p className="label-micro">Add payout</p>
            <h2 className="text-sm font-semibold tracking-tight">{platform.name}</h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </header>

        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-console/60 px-3 py-2">
            <div>
              <p className="label-micro">Destination</p>
              <p className="text-sm font-semibold">{platform.payoutDestination ?? "Unassigned"}</p>
              <p className="text-[10px] text-muted-foreground">Configured in Settings</p>
            </div>
            <div className="text-right">
              <p className="label-micro">Current total</p>
              <p className="numeric text-sm">{fmtUsd(balance)}</p>
              <p className="numeric text-[10px] text-token">
                {tokenBalance > 0 ? `${tokenBalance} tokens` : ""}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="label-micro">Date</span>
              <input
                type="date"
                value={payoutDate}
                onChange={(e) => setPayoutDate(e.target.value)}
                className="numeric h-8 w-full rounded border border-border bg-console px-2 text-sm outline-none focus:border-ring"
              />
            </label>
            <label className="block">
              <span className="label-micro">Time</span>
              <input
                type="time"
                value={payoutTime}
                onChange={(e) => setPayoutTime(e.target.value)}
                className="numeric h-8 w-full rounded border border-border bg-console px-2 text-sm outline-none focus:border-ring"
              />
            </label>
            <label className="block">
              <span className="label-micro">Payout USD</span>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError(null);
                }}
                placeholder={rawTokens !== null && rate ? fmtUsd(rawTokens * rate) : "0.00"}
                className="numeric h-8 w-full rounded border border-border bg-console px-2 text-sm outline-none focus:border-ring"
              />
            </label>
          </div>

          <label className="block">
            <span className="label-micro">Tokens (optional if USD is entered)</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={tokensAmount}
              onChange={(e) => {
                setTokensAmount(e.target.value);
                setError(null);
              }}
              placeholder={rawAmount !== null && rate ? String(Math.round((rawAmount / rate) * 100) / 100) : "Leave blank to calculate from USD"}
              className={`numeric h-8 w-full rounded border bg-console px-2 text-sm outline-none focus:border-ring ${tokensValid ? "border-border" : "border-destructive"}`}
            />
            {rate ? (
              rawTokens === null && rawAmount !== null ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  ≈ {fmtNum(derivedTokens ?? 0)} tokens, calculated at ${rate}/token
                </p>
              ) : rawAmount === null && rawTokens !== null ? (
                <p className="mt-1 text-[10px] text-muted-foreground">
                  ≈ {fmtUsd(derivedAmount ?? 0)}, calculated at ${rate}/token
                </p>
              ) : null
            ) : (
              <p className="mt-1 text-[10px] text-muted-foreground">
                No configured rate for this platform — tokens won't auto-calculate.
              </p>
            )}
          </label>

          <label className="block">
            <span className="label-micro">Note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional reference"
              className="h-8 w-full rounded border border-border bg-console px-2 text-sm outline-none focus:border-ring"
            />
          </label>

          <p className="text-[11px] text-muted-foreground">
            {valid
              ? `${fmtUsd(derivedAmount as number)} · ${fmtPhp((derivedAmount as number) * usdPhpRate)} → remaining ${fmtUsd(balance - (derivedAmount as number))}`
              : "Payout reduces this platform's current total and is stored as a separate transaction."}
          </p>
          {error && <p className="text-[11px] text-token">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!valid || !tokensValid}
              className="rounded bg-secondary px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-foreground disabled:opacity-40"
            >
              Save payout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
