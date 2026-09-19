import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ArrowDown, ArrowUp, Minus, TrendingUp } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { TrendBadge } from "@/components/tokentrack/TrendBadge";
import {
  bestPerformingPlatform,
  biggestDecline,
  buildTimeSeries,
  computePlatformMovement,
  computePlatformStats,
  earliestDate,
  METRIC_LABELS,
  strongestImprovement,
  type MetricKey,
} from "@/lib/tokentrack/analytics";
import {
  fmtHours,
  fmtNum,
  fmtPhp,
  fmtUsd,
  OPENING_DATE,
  todayISO,
  useTokenTrack,
} from "@/lib/tokentrack/store";

type RangePreset = "7d" | "30d" | "90d" | "month" | "all" | "custom";

const RANGE_PRESETS: { key: RangePreset; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "month", label: "This month" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom" },
];

const METRIC_KEYS: MetricKey[] = [
  "usd",
  "tokens",
  "usdPerHour",
  "tokensPerHour",
  "followers",
  "hours",
];

/** Distinct chart-line colors — platform.accent is currently the same value for every platform, so lines are told apart here instead. */
const LINE_COLORS = ["#f59e0b", "#38bdf8", "#a78bfa", "#34d399", "#fb7185", "#facc15"];

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function FxWidget() {
  const { usdPhpRate, usdPhpRatePrevious, rateIsLive, rateUpdatedAt } = useTokenTrack();
  const diff = usdPhpRatePrevious !== null ? usdPhpRate - usdPhpRatePrevious : null;

  return (
    <div className="rounded-lg border border-border bg-panel px-4 py-3">
      <p className="label-micro">Live USD → PHP</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="numeric text-2xl font-semibold leading-none">{fmtPhp(usdPhpRate)}</p>
        <span className="text-xs text-muted-foreground">per {fmtUsd(1)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        {diff === null ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Minus className="size-2.5" /> Movement shows after the next hourly refresh
          </span>
        ) : Math.abs(diff) < 0.005 ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Minus className="size-2.5" /> Flat since last update
          </span>
        ) : (
          <span
            className={
              diff > 0
                ? "inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400"
                : "inline-flex items-center gap-1 text-[10px] font-medium text-destructive"
            }
          >
            {diff > 0 ? <ArrowUp className="size-2.5" /> : <ArrowDown className="size-2.5" />}
            {diff > 0 ? "+" : ""}
            {diff.toFixed(2)} PHP since last update
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {rateIsLive
          ? `Live · updated ${rateUpdatedAt ? new Date(rateUpdatedAt).toLocaleTimeString() : "—"}`
          : "Fetching live rate…"}
      </p>
    </div>
  );
}

export function Analytics() {
  const { platforms, rows } = useTokenTrack();
  const today = todayISO();
  const dataEarliest = useMemo(() => earliestDate(rows, OPENING_DATE), [rows]);

  const [preset, setPreset] = useState<RangePreset>("30d");
  const [customStart, setCustomStart] = useState(shiftDate(today, -30));
  const [customEnd, setCustomEnd] = useState(today);
  const [metric, setMetric] = useState<MetricKey>("usd");
  const [selected, setSelected] = useState<string[] | null>(null); // null = "not touched yet" -> default selection

  const selectedIds = selected ?? platforms.filter((p) => p.status !== "inactive").map((p) => p.id);

  const { start, end } = useMemo(() => {
    switch (preset) {
      case "7d":
        return { start: shiftDate(today, -6), end: today };
      case "30d":
        return { start: shiftDate(today, -29), end: today };
      case "90d":
        return { start: shiftDate(today, -89), end: today };
      case "month":
        return { start: monthStart(today), end: today };
      case "all":
        return { start: dataEarliest, end: today };
      case "custom":
        return { start: customStart, end: customEnd };
      default:
        return { start: shiftDate(today, -29), end: today };
    }
  }, [preset, today, dataEarliest, customStart, customEnd]);

  const statsByPlatform = useMemo(
    () => platforms.map((p) => computePlatformStats(rows, p.id, start, end)),
    [platforms, rows, start, end],
  );
  const movementByPlatform = useMemo(
    () => platforms.map((p) => computePlatformMovement(rows, p.id, start, end)),
    [platforms, rows, start, end],
  );

  const bestId = useMemo(() => bestPerformingPlatform(statsByPlatform), [statsByPlatform]);
  const improvingId = useMemo(() => strongestImprovement(movementByPlatform), [movementByPlatform]);
  const decliningId = useMemo(() => biggestDecline(movementByPlatform), [movementByPlatform]);

  const platformName = (id: string | null) =>
    id
      ? (platforms.find((p) => p.id === id)?.displayName ??
        platforms.find((p) => p.id === id)?.name ??
        id)
      : "—";

  const combined = useMemo(() => {
    const inSel = statsByPlatform.filter((s) => selectedIds.includes(s.platformId));
    const totalUsd = inSel.reduce((s, x) => s + x.totalUsd, 0);
    const tokenStats = inSel.filter((x) => x.totalTokens !== null);
    const totalTokens =
      tokenStats.length > 0 ? tokenStats.reduce((s, x) => s + (x.totalTokens ?? 0), 0) : null;
    const totalHours = inSel.reduce((s, x) => s + x.totalHours, 0);
    const avgUsdPerHour = totalHours > 0 ? totalUsd / totalHours : null;
    const avgTokensPerHour =
      totalHours > 0 && totalTokens !== null ? totalTokens / totalHours : null;
    const followerStats = inSel.filter((x) => x.followerChange !== null);
    const followerChange =
      followerStats.length > 0
        ? followerStats.reduce((s, x) => s + (x.followerChange ?? 0), 0)
        : null;
    return { totalUsd, totalTokens, totalHours, avgUsdPerHour, avgTokensPerHour, followerChange };
  }, [statsByPlatform, selectedIds]);

  const { points: seriesPoints, granularity } = useMemo(
    () => buildTimeSeries(rows, selectedIds, metric, start, end),
    [rows, selectedIds, metric, start, end],
  );

  const chartData = useMemo(
    () => seriesPoints.map((p) => ({ label: p.label, ...p.values })),
    [seriesPoints],
  );

  // A running (cumulative) total across all selected platforms, for the
  // growth-trend chart below. Only meaningful for quantities that add up
  // over time (USD, tokens, hours, follower change) — a per-hour rate
  // can't be sensibly "accumulated", so that case is handled separately
  // where this is rendered.
  const isCumulativeMetric =
    metric === "usd" || metric === "tokens" || metric === "hours" || metric === "followers";

  const cumulativeData = useMemo(() => {
    let running = 0;
    return seriesPoints.map((p) => {
      const dayTotal = selectedIds.reduce((sum, id) => sum + (p.values[id] ?? 0), 0);
      running += dayTotal;
      return { label: p.label, total: running };
    });
  }, [seriesPoints, selectedIds]);

  const chartConfig = useMemo(() => {
    const cfg: ChartConfig = {};
    selectedIds.forEach((id, i) => {
      const p = platforms.find((pl) => pl.id === id);
      cfg[id] = {
        label: p?.displayName?.trim() || p?.name || id,
        color: LINE_COLORS[i % LINE_COLORS.length] ?? "#94a3b8",
      };
    });
    return cfg;
  }, [selectedIds, platforms]);

  const cumulativeChartConfig = useMemo<ChartConfig>(
    () => ({ total: { label: "All selected platforms, combined", color: "#34d399" } }),
    [],
  );

  const togglePlatform = (id: string) => {
    setSelected((cur) => {
      const base = cur ?? platforms.filter((p) => p.status !== "inactive").map((p) => p.id);
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Analytics</h1>
          <p className="text-xs text-muted-foreground">
            Performance across your six platform slots, built from your actual logged sessions —
            nothing here is estimated or invented.
          </p>
        </div>
        <FxWidget />
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-panel p-3">
        <div className="flex items-center gap-1 rounded-md bg-console p-1">
          {RANGE_PRESETS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setPreset(r.key)}
              className={
                preset === r.key
                  ? "rounded bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground"
                  : "rounded px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
              }
            >
              {r.label}
            </button>
          ))}
        </div>

        {preset === "custom" && (
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={customStart}
              max={customEnd}
              onChange={(e) => setCustomStart(e.target.value)}
              className="numeric rounded-md border border-input bg-console px-2 py-1 text-xs outline-none focus:border-ring"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              max={today}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="numeric rounded-md border border-input bg-console px-2 py-1 text-xs outline-none focus:border-ring"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="label-micro">Metric</span>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as MetricKey)}
            className="rounded-md border border-input bg-console px-2 py-1 text-xs outline-none focus:border-ring"
          >
            {METRIC_KEYS.map((m) => (
              <option key={m} value={m}>
                {METRIC_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="label-micro mr-1">Platforms</span>
        {platforms.map((p, i) => {
          const active = selectedIds.includes(p.id);
          const idx = selectedIds.indexOf(p.id);
          const color = LINE_COLORS[(idx >= 0 ? idx : i) % LINE_COLORS.length];
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => togglePlatform(p.id)}
              className={
                active
                  ? "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                  : "flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground opacity-60"
              }
              style={active ? { borderColor: color, color } : undefined}
            >
              <span
                className="size-1.5 rounded-full"
                style={{ backgroundColor: active ? color : "currentColor" }}
              />
              {p.displayName?.trim() || p.name}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total USD" value={fmtUsd(combined.totalUsd)} />
        <SummaryCard
          label="Total tokens"
          value={combined.totalTokens !== null ? fmtNum(combined.totalTokens) : "—"}
        />
        <SummaryCard label="Hours streamed" value={fmtHours(combined.totalHours * 60)} />
        <SummaryCard
          label="Avg USD / hr"
          value={combined.avgUsdPerHour !== null ? fmtUsd(combined.avgUsdPerHour) : "—"}
        />
        <SummaryCard
          label="Avg tokens / hr"
          value={
            combined.avgTokensPerHour !== null ? fmtNum(Math.round(combined.avgTokensPerHour)) : "—"
          }
        />
        <SummaryCard
          label="Follower movement"
          value={
            combined.followerChange !== null
              ? `${combined.followerChange > 0 ? "+" : ""}${fmtNum(combined.followerChange)}`
              : "—"
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <InsightCard
          icon={<TrendingUp className="size-3.5" />}
          label="Best performing"
          value={platformName(bestId)}
        />
        <InsightCard
          icon={<ArrowUp className="size-3.5 text-emerald-400" />}
          label="Strongest improvement"
          value={platformName(improvingId)}
        />
        <InsightCard
          icon={<ArrowDown className="size-3.5 text-destructive" />}
          label="Biggest decline"
          value={platformName(decliningId)}
        />
      </div>

      <div className="rounded-lg border border-border bg-panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="label-micro">{METRIC_LABELS[metric]} over time</p>
          <p className="text-[10px] text-muted-foreground">
            Bucketed by {granularity} · {start} → {end}
          </p>
        </div>
        {chartData.length === 0 || selectedIds.length === 0 ? (
          <p className="py-16 text-center text-xs text-muted-foreground">
            No sessions logged for this range/platform selection yet.
          </p>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[340px] w-full">
            <LineChart data={chartData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
              />
              <YAxis tickLine={false} axisLine={false} width={48} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              {selectedIds.map((id) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  stroke={`var(--color-${id})`}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </div>

      <div className="rounded-lg border border-border bg-panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="label-micro">Growth trend — cumulative {METRIC_LABELS[metric].toLowerCase()}</p>
          <p className="text-[10px] text-muted-foreground">
            Bucketed by {granularity} · {start} → {end}
          </p>
        </div>
        {!isCumulativeMetric ? (
          <p className="py-16 text-center text-xs text-muted-foreground">
            A per-hour rate can't be meaningfully accumulated — switch the metric above to USD,
            Tokens, Hours, or Followers to see the running growth total.
          </p>
        ) : cumulativeData.length === 0 || selectedIds.length === 0 ? (
          <p className="py-16 text-center text-xs text-muted-foreground">
            No sessions logged for this range/platform selection yet.
          </p>
        ) : (
          <ChartContainer config={cumulativeChartConfig} className="aspect-auto h-[220px] w-full">
            <LineChart data={cumulativeData} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                fontSize={11}
              />
              <YAxis tickLine={false} axisLine={false} width={48} fontSize={11} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              <Line
                type="monotone"
                dataKey="total"
                stroke="var(--color-total)"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-panel">
        <table className="w-full min-w-[860px] text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">Platform</th>
              <th className="px-3 py-2 font-medium">Sessions</th>
              <th className="px-3 py-2 font-medium">USD</th>
              <th className="px-3 py-2 font-medium">Tokens</th>
              <th className="px-3 py-2 font-medium">Hours</th>
              <th className="px-3 py-2 font-medium">USD / hr</th>
              <th className="px-3 py-2 font-medium">Tokens / hr</th>
              <th className="px-3 py-2 font-medium">Followers</th>
            </tr>
          </thead>
          <tbody>
            {platforms.map((p) => {
              const stats = statsByPlatform.find((s) => s.platformId === p.id);
              const move = movementByPlatform.find((m) => m.platformId === p.id);
              if (!stats || !move) return null;
              return (
                <tr key={p.id} className="border-b border-border/60 last:border-0">
                  <td className="px-3 py-2 font-medium">{p.displayName?.trim() || p.name}</td>
                  <td className="numeric px-3 py-2">{stats.sessionCount}</td>
                  <td className="px-3 py-2">
                    <div className="numeric">{fmtUsd(stats.totalUsd)}</div>
                    <TrendBadge movement={move.usd} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="numeric">
                      {stats.totalTokens !== null ? fmtNum(stats.totalTokens) : "—"}
                    </div>
                    <TrendBadge movement={move.tokens} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="numeric">{fmtHours(stats.totalHours * 60)}</div>
                    <TrendBadge movement={move.hours} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="numeric">
                      {stats.avgUsdPerHour !== null ? fmtUsd(stats.avgUsdPerHour) : "—"}
                    </div>
                    <TrendBadge movement={move.usdPerHour} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="numeric">
                      {stats.avgTokensPerHour !== null
                        ? fmtNum(Math.round(stats.avgTokensPerHour))
                        : "—"}
                    </div>
                    <TrendBadge movement={move.tokensPerHour} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="numeric">
                      {stats.followerChange !== null
                        ? `${stats.followerChange > 0 ? "+" : ""}${fmtNum(stats.followerChange)}`
                        : "—"}
                    </div>
                    <TrendBadge movement={move.followers} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
          Trend chips compare this range to the immediately preceding period of equal length.
          BongaCams always uses its actual recorded USD, never a token conversion.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-panel px-3 py-2.5">
      <p className="label-micro">{label}</p>
      <p className="numeric mt-0.5 text-lg font-semibold leading-none">{value}</p>
    </div>
  );
}

function InsightCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-panel px-3 py-2.5">
      <div className="grid size-8 shrink-0 place-items-center rounded-md bg-console">{icon}</div>
      <div>
        <p className="label-micro">{label}</p>
        <p className="text-sm font-semibold">{value === "—" ? "Not enough data yet" : value}</p>
      </div>
    </div>
  );
}
