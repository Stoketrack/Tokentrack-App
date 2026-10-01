import { useEffect, useRef, useState } from "react";
import { fmtPhp, fmtUsd, useTokenTrack } from "@/lib/tokentrack/store";
import type { Platform, PlatformStatus } from "@/lib/tokentrack/types";

const STATUSES: PlatformStatus[] = ["active", "testing", "inactive"];

const field =
  "w-full rounded-md border border-input bg-console px-2 py-1.5 text-xs outline-none focus:border-ring h-8";

/** Same parsing every platform's token-value box uses — never platform-specific. */
function parseTokenValue(raw: string): number | null {
  if (raw.trim() === "" || raw === "-" || raw === "." || raw === "-.") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * The box shows exactly what you typed, not a round-trip through Number().
 * Feeding the parsed number straight back into the input's value (as the
 * old inline version did) turns "0." into "0" the instant you type the
 * decimal point — Number("0.") is 0, and 0 renders back as "0" — which
 * makes it impossible to type any rate starting with "0." at all,
 * on any platform. Local text state avoids that: the number is still
 * parsed and saved on every keystroke, but the box's own text is never
 * overwritten by the numeric result.
 */
function TokenValueField({
  platform,
  onCommit,
}: {
  platform: Platform;
  onCommit: (v: number | null) => void;
}) {
  const [raw, setRaw] = useState(() =>
    platform.tokenValueUsd !== null && platform.tokenValueUsd !== undefined
      ? String(platform.tokenValueUsd)
      : "",
  );

  // Re-sync if the saved value changes from outside this box (e.g. loading
  // a different platform's data) without fighting whatever is mid-typing.
  useEffect(() => {
    if (parseTokenValue(raw) === platform.tokenValueUsd) return;
    setRaw(
      platform.tokenValueUsd !== null && platform.tokenValueUsd !== undefined
        ? String(platform.tokenValueUsd)
        : "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform.tokenValueUsd]);

  return (
    <input
      className={`${field} numeric`}
      inputMode="decimal"
      value={raw}
      placeholder="—"
      onChange={(e) => {
        const next = e.target.value;
        if (!/^-?\d*\.?\d*$/.test(next)) return; // only ever what a decimal number can look like mid-entry
        setRaw(next);
        onCommit(parseTokenValue(next));
      }}
    />
  );
}

export function PlatformSettings() {
  const {
    platforms,
    updatePlatform,
    usdPhpRate,
    rateIsLive,
    rateUpdatedAt,
    backgroundImageUrl,
    uploadBackgroundImage,
    removeBackgroundImage,
  } = useTokenTrack();
  const [bgUploading, setBgUploading] = useState(false);
  const [bgError, setBgError] = useState<string | null>(null);
  const bgFileRef = useRef<HTMLInputElement | null>(null);

  const onPickBackground = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBgError(null);
    setBgUploading(true);
    try {
      await uploadBackgroundImage(file);
    } catch (err) {
      setBgError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBgUploading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Platform configuration</h1>
          <p className="text-xs text-muted-foreground">
            Six configurable profiles. Everything here drives the dashboard cards automatically.
          </p>
        </div>
        <div className="rounded-md border border-border bg-panel px-3 py-2 text-right">
          <p className="label-micro">Live USD → PHP</p>
          <p className="numeric text-sm">
            {fmtUsd(1)} = {fmtPhp(usdPhpRate)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {rateIsLive
              ? `Auto-updated${rateUpdatedAt ? ` ${new Date(rateUpdatedAt).toLocaleString()}` : ""}`
              : "Fetching current rate…"}
          </p>
        </div>
      </header>

      <div className="space-y-3">
        {platforms.map((p) => (
          <section key={p.id} className="rounded-xl border border-border bg-panel p-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <Labelled label="Display name">
                <input
                  className={field}
                  value={p.displayName}
                  onChange={(e) => updatePlatform(p.id, { displayName: e.target.value })}
                />
              </Labelled>
              <Labelled label="Platform identity">
                <input
                  className={field}
                  value={p.name}
                  onChange={(e) => updatePlatform(p.id, { name: e.target.value })}
                />
              </Labelled>
              <Labelled label="Status">
                <select
                  className={field}
                  value={p.status}
                  onChange={(e) =>
                    updatePlatform(p.id, { status: e.target.value as PlatformStatus })
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ))}
                </select>
              </Labelled>
              <Labelled label="Token value (USD)">
                <TokenValueField
                  platform={p}
                  onCommit={(v) => updatePlatform(p.id, { tokenValueUsd: v })}
                />
              </Labelled>
              <Labelled label="Payment destination">
                <input
                  className={field}
                  value={p.payoutDestination ?? ""}
                  placeholder="Coins.ph / Wise"
                  onChange={(e) => updatePlatform(p.id, { payoutDestination: e.target.value })}
                />
              </Labelled>
              <Labelled label="Payout information" className="col-span-2">
                <textarea
                  className="min-h-16 w-full resize-y rounded-md border border-input bg-console px-2 py-1.5 text-xs leading-snug outline-none focus:border-ring"
                  rows={3}
                  value={p.payoutInfo ?? ""}
                  placeholder="Account ref, schedule, minimum, timelines…"
                  onChange={(e) => updatePlatform(p.id, { payoutInfo: e.target.value })}
                />
              </Labelled>
              <Labelled label="Dashboard position">
                <select
                  className={`${field} numeric`}
                  value={p.slot}
                  onChange={(e) => updatePlatform(p.id, { slot: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Labelled>
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-panel p-3">
        <p className="label-micro mb-1">Dashboard Background Photo</p>
        <p className="mb-2 text-xs text-muted-foreground">
          Shown behind the dashboard cards, which float on top of it.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {backgroundImageUrl && (
            <img
              src={backgroundImageUrl}
              alt=""
              className="h-14 w-24 rounded-md border border-border object-cover"
            />
          )}
          <input
            ref={bgFileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPickBackground}
          />
          <button
            type="button"
            onClick={() => bgFileRef.current?.click()}
            disabled={bgUploading}
            className="rounded-md border border-border bg-console px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-60"
          >
            {bgUploading
              ? "Uploading…"
              : backgroundImageUrl
                ? "Change background photo"
                : "Dashboard Background Photo"}
          </button>
          {backgroundImageUrl && (
            <button
              type="button"
              onClick={removeBackgroundImage}
              className="text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
            >
              Remove background
            </button>
          )}
        </div>
        {bgError && <p className="mt-2 text-[11px] text-token">{bgError}</p>}
        <p className="mt-2 text-[10px] text-muted-foreground">JPG, PNG, or WebP.</p>
      </section>

      <p className="text-[11px] text-muted-foreground">
        Token values are platform-specific — there is no global conversion rate. The USD/PHP rate is
        fetched automatically and never edited by hand; recorded USD earnings never change when it
        moves.
      </p>
    </div>
  );
}

function Labelled({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label-micro mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export type { Platform };
