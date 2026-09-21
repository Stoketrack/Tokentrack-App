import { useState } from "react";
import { Minus, GripVertical, Maximize2, Plus, Banknote } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABEL, fmtNum, fmtPhp, fmtUsd, useTokenTrack } from "@/lib/tokentrack/store";
import type { Platform } from "@/lib/tokentrack/types";

const STATUS_STYLES: Record<Platform["status"], string> = {
  active: "text-status-active border-status-active/30 bg-status-active/10",
  testing: "text-status-testing border-status-testing/30 bg-status-testing/10",
  inactive: "text-status-retired border-status-retired/30 bg-status-retired/10",
};

const PANEL_WIDTH = 340;

/**
 * Minimum pointer movement, in pixels, before a press-and-hold on the drag
 * handle is treated as an actual drag rather than a tap. Without this, any
 * ordinary touch — including the small amount of finger drift a phone
 * screen always registers on a plain tap — would immediately start moving
 * the card.
 */
const DRAG_THRESHOLD = 6;

interface Props {
  platform: Platform;
  /** This card's position among the currently-visible cards (0-based, row-major). */
  gridIndex: number;
  /** How many cards fit per row at the current screen size. */
  columns: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
  /** How many cards are currently visible — used to keep a drop target in range. */
  totalVisible: number;
  bounds: { width: number; height: number };
  /** Called when a drag ends on a new grid position; the parent performs the actual slot swap. */
  onReorder: (targetGridIndex: number) => void;
  onAddRow: () => void;
  onAddPayout: () => void;
  onOpenDetail: () => void;
  onFocus: () => void;
  zIndex: number;
}

export function PlatformPanel({
  platform,
  gridIndex,
  columns,
  cellWidth,
  cellHeight,
  gap,
  totalVisible,
  bounds,
  onReorder,
  onAddRow,
  onAddPayout,
  onOpenDetail,
  onFocus,
  zIndex,
}: Props) {
  const { currentFollowersFor, currentTokensFor, usdPhpRate, setPanel } = useTokenTrack();
  const followers = currentFollowersFor(platform.id);
  // Unpaid token balance: tokens earned minus tokens already covered by
  // recorded payouts. currentTokensFor already implements this correctly
  // (see store.tsx) — reused as-is, not recalculated here.
  const unpaidTokens = currentTokensFor(platform.id);
  const unpaidUsd = unpaidTokens * (platform.tokenValueUsd ?? 0);

  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });

  // A card's resting position is always derived from its grid slot — never
  // stored as a free pixel coordinate — so it's mathematically impossible
  // for two cards to end up overlapping, and the layout is automatically
  // correct on any screen size the moment `columns` changes.
  const col = gridIndex % columns;
  const row = Math.floor(gridIndex / columns);
  const baseX = col * (cellWidth + gap);
  const baseY = row * (cellHeight + gap);

  const startDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    onFocus();
    const start = { px: e.clientX, py: e.clientY };
    let thresholdMet = false;
    (e.target as Element).setPointerCapture?.(e.pointerId);

    // The Y bound must be the full grid's row extent, not the visible
    // canvas viewport — on mobile portrait the 6-card stack is far taller
    // than what's on screen at once, and clamping to the viewport made it
    // impossible to ever drag a card down into row 4/5/6 at all.
    const maxRow = Math.max(0, Math.ceil(totalVisible / columns) - 1);
    const maxY = maxRow * (cellHeight + gap);

    const clamp = (x: number, y: number) => ({
      // X can safely clamp to the visible canvas width — columns are sized
      // to always fit within it, so this never restricts a valid drop.
      x: Math.min(Math.max(x, 0), Math.max(bounds.width - cellWidth, 0)),
      y: Math.min(Math.max(y, 0), maxY),
    });

    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      if (!thresholdMet) {
        // Below the threshold, this might just be a tap — don't touch
        // dragging state yet, so a normal click/tap is never hijacked.
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        thresholdMet = true;
        setDragging(true);
      }
      setDragPos(clamp(baseX + dx, baseY + dy));
    };

    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!thresholdMet) return; // Never became a drag — treat as a plain tap.

      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      const finalPos = clamp(baseX + dx, baseY + dy);
      // Snap to whichever grid cell the card was dropped nearest to.
      const targetCol = Math.round(finalPos.x / (cellWidth + gap));
      const targetRow = Math.round(finalPos.y / (cellHeight + gap));
      const targetIndex = Math.min(
        Math.max(targetRow * columns + targetCol, 0),
        Math.max(totalVisible - 1, 0),
      );
      setDragging(false);
      onReorder(targetIndex);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const dimmed = platform.status === "inactive";

  return (
    <article
      onPointerDown={onFocus}
      style={{
        left: dragging ? dragPos.x : baseX,
        top: dragging ? dragPos.y : baseY,
        width: cellWidth,
        zIndex,
      }}
      className={cn(
        "absolute rounded-xl border border-border bg-panel shadow-panel",
        dragging
          ? "shadow-panel-lift"
          : "transition-[left,top] duration-200 ease-out hover:shadow-panel-lift",
      )}
    >
      <header className="flex items-center justify-between gap-2 rounded-t-xl border-b border-border bg-panel-header px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            onPointerDown={startDrag}
            aria-label={`Drag to reorder ${platform.name}`}
            role="button"
            className={cn(
              "-m-1 shrink-0 touch-none rounded p-1 text-muted-foreground/60 hover:bg-secondary hover:text-foreground",
              dragging ? "cursor-grabbing" : "cursor-grab",
            )}
          >
            <GripVertical className="size-3.5" aria-hidden />
          </span>
          <h2 className="truncate text-sm font-semibold tracking-tight">
            {platform.displayName?.trim() || platform.name}
          </h2>
          <span
            className={cn(
              "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              STATUS_STYLES[platform.status],
            )}
          >
            {STATUS_LABEL[platform.status]}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={`Open ${platform.name} detail`}
            onClick={onOpenDetail}
            className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Maximize2 className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={`Minimise ${platform.name}`}
            onClick={() => setPanel(platform.id, { minimised: true })}
            className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Minus className="size-3.5" />
          </button>
        </div>
      </header>

      <div className={cn("space-y-3 p-3.5", dimmed && "opacity-60")}>
        {/* Priority 2–4: unpaid USD balance (white, largest), PHP equivalent
            (red), then the caption naming what the pair above represents.
            "Current total" heads the block per the hand-drawn reference —
            this is the unpaid balance (since last payout), never a
            calendar-month or lifetime figure. */}
        <div>
          <p className="label-micro">Current total</p>
          <p className="numeric text-3xl font-semibold leading-none text-foreground">
            {fmtUsd(unpaidUsd)}
          </p>
          <p className="numeric mt-1 text-sm font-semibold leading-none text-token">
            {fmtPhp(unpaidUsd * usdPhpRate)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Unpaid balance</p>
        </div>

        {/* Priority 5–6: tokens earned since last payout (red) paired with
            the payout-destination badge. Grouped together deliberately —
            the badge answers "where will these tokens go" right where the
            token count lives, rather than floating separately. The badge
            reads straight off platform.payoutDestination, so it updates on
            its own whenever that field changes; nothing here is hardcoded
            to a specific platform. */}
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-console/60 px-3 py-2">
          <div className="min-w-0">
            <p className="label-micro">Tokens earned</p>
            <p className="numeric truncate text-sm font-semibold leading-none text-token">
              {fmtNum(unpaidTokens)}
            </p>
          </div>
          <PayoutBadge destination={platform.payoutDestination} />
        </div>

        <div className="flex items-center justify-between px-0.5">
          <p className="label-micro">Followers</p>
          <p className="numeric text-xs text-muted-foreground">
            {followers === null ? "—" : fmtNum(followers)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onAddRow}
            className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          >
            <Plus className="size-3.5" /> Add new row
          </button>
          <button
            type="button"
            onClick={onAddPayout}
            className="flex items-center justify-center gap-1.5 rounded-md border border-border py-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          >
            <Banknote className="size-3.5" /> Add payout
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * Compact, visually-secondary pill showing where this platform's payouts
 * currently go. Always driven by platform.payoutDestination — never a
 * hardcoded "Wise" or "Coins.ph" — so it tracks the platform's real
 * settings automatically if that destination is changed later.
 */
function PayoutBadge({ destination }: { destination?: string | null | undefined }) {
  return (
    <div
      className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-panel-header px-2.5 py-1"
      title="Current payout destination"
    >
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        Payout
      </span>
      <span className="text-[9px] text-muted-foreground/70" aria-hidden>
        →
      </span>
      <span className="max-w-[92px] truncate text-[11px] font-semibold text-foreground">
        {destination?.trim() || "Unassigned"}
      </span>
    </div>
  );
}

export { PANEL_WIDTH };
