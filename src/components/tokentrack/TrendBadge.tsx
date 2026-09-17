import { ArrowDown, ArrowRight, ArrowUp, Minus } from "lucide-react";
import type { MetricMovement } from "@/lib/tokentrack/analytics";

function fmtPct(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

/** Renders a MetricMovement as a small colored trend chip. Never claims growth/decline without real numbers on both sides. */
export function TrendBadge({ movement, suffix }: { movement: MetricMovement; suffix?: string }) {
  if (movement.trend === "insufficient") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <Minus className="size-2.5" /> Not enough data
      </span>
    );
  }

  if (movement.pctChange === null) {
    // Previous period was exactly zero — direction is real, but a % is meaningless.
    return (
      <span
        className={
          movement.trend === "up"
            ? "inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400"
            : "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
        }
      >
        {movement.trend === "up" ? (
          <ArrowUp className="size-2.5" />
        ) : (
          <ArrowRight className="size-2.5" />
        )}
        New activity
      </span>
    );
  }

  const styles =
    movement.trend === "up"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : movement.trend === "down"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border text-muted-foreground";

  const Icon =
    movement.trend === "up" ? ArrowUp : movement.trend === "down" ? ArrowDown : ArrowRight;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${styles}`}
    >
      <Icon className="size-2.5" />
      {fmtPct(movement.pctChange)}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );
}
