import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, GripVertical, Mic, MicOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  durationMinutes,
  fmtHours,
  fmtNum,
  fmtUsd,
  normalizeHHmm,
  shiftDateUTC,
  timeOfDayFrom,
  todayISO,
  useTokenTrack,
} from "@/lib/tokentrack/store";
import { pushRecentValue, useRecentValues } from "@/lib/tokentrack/recentValues";
import type { Platform, ResetCount } from "@/lib/tokentrack/types";

/** Which of the two editable "current platform total" fields was typed into last. */
type EarningsField = "currentUsd" | "currentTokens";

interface Props {
  platform: Platform;
  date: string;
  onClose: () => void;
}

export function AddRowDialog({ platform, date, onClose }: Props) {
  const { addRow, lastEntryFor, currentTotalFor, currentTokensFor } = useTokenTrack();
  const [rowDate, setRowDate] = useState(date);
  const [startTimeInput, setStartTimeInput] = useState("");
  const [endTimeInput, setEndTimeInput] = useState("");
  const [roomCount, setRoomCount] = useState("");
  const [followersStart, setFollowersStart] = useState<string>("");
  const [followersStartLocked, setFollowersStartLocked] = useState(false);
  const [followersEnd, setFollowersEnd] = useState("");
  // Earnings entry: "platform total" here means the platform's current
  // running UNPAID/cash-out balance since the last payout — the same
  // figure currentTotalFor()/currentTokensFor() already compute for the
  // dashboard card itself (opening balance + everything earned − every
  // payout), never a lifetime total. "Previous" is that value read right
  // now, before this row exists; "Current" is what you type in from the
  // platform's site; "earned tonight" is simply the difference, shown for
  // both units and kept mutually consistent via the platform's rate.
  const [currentUsdInput, setCurrentUsdInput] = useState("");
  const [currentTokensInput, setCurrentTokensInput] = useState("");
  const [lastEditedField, setLastEditedField] = useState<EarningsField | null>(null);
  const [note, setNote] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Session / Connection — all optional. Independent yes/no toggles plus a
  // single-choice reset count. Defaults reflect "not answered yet" for a
  // brand-new entry; nothing here ever touches historical/migrated rows,
  // which simply won't have these fields at all.
  const [vpnOnAtStart, setVpnOnAtStart] = useState(false);
  const [vpnTurnedOffDuring, setVpnTurnedOffDuring] = useState(false);
  const [connectionDropped, setConnectionDropped] = useState(false);
  const [siteRequiredReset, setSiteRequiredReset] = useState(false);
  const [obsProblem, setObsProblem] = useState(false);
  const [streamMasterProblem, setStreamMasterProblem] = useState(false);
  const [resetCount, setResetCount] = useState<ResetCount | null>(null);

  const recentStartTimes = useRecentValues("startTime", platform.id);
  const recentEndTimes = useRecentValues("endTime", platform.id);
  const recentRoomCounts = useRecentValues("roomCount", platform.id);

  // Floating, draggable box position — same free-pixel drag mechanics as
  // the platform cards themselves, so this behaves like another card on
  // the canvas rather than a screen-blocking modal. Starts centred once
  // its real size is known, then only moves when the user drags it.
  const boxRef = useRef<HTMLFormElement | null>(null);
  const [boxPos, setBoxPos] = useState<{ x: number; y: number } | null>(null);
  const [boxDragging, setBoxDragging] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBoxPos({
      x: Math.max(8, (window.innerWidth - rect.width) / 2),
      y: Math.max(8, (window.innerHeight - rect.height) / 2),
    });
  }, []);

  const startBoxDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = boxRef.current;
    if (!el || !boxPos) return;
    const start = { px: e.clientX, py: e.clientY };
    const origin = { x: boxPos.x, y: boxPos.y };
    const rect = el.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - rect.width);
    const maxY = Math.max(0, window.innerHeight - rect.height);
    setBoxDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);

    const move = (ev: PointerEvent) => {
      setBoxPos({
        x: Math.min(Math.max(0, origin.x + (ev.clientX - start.px)), maxX),
        y: Math.min(Math.max(0, origin.y + (ev.clientY - start.py)), maxY),
      });
    };
    const up = () => {
      setBoxDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Validate and normalize the 4-digit input strings to the stored no-colon HHmm form.
  const startTime = useMemo(() => normalizeHHmm(startTimeInput), [startTimeInput]);
  const endTime = useMemo(() => normalizeHHmm(endTimeInput), [endTimeInput]);

  // Auto-fill starting followers from the most recent saved entry for this platform.
  useEffect(() => {
    const last = lastEntryFor(platform.id);
    if (last && last.followersEnd !== null && last.followersEnd !== undefined) {
      setFollowersStart(String(last.followersEnd));
      setFollowersStartLocked(true);
    } else {
      setFollowersStart("");
      setFollowersStartLocked(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platform.id]);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null;
    setVoiceSupported(Boolean(SR));
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* nothing to stop */
      }
    };
  }, []);

  const toggleVoice = () => {
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (event: any) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) text += event.results[i][0].transcript;
      }
      if (text) setNote((n) => (n ? `${n.trim()} ${text.trim()}` : text.trim()));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const num = (v: string) => (v.trim() === "" ? null : Number(v));

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/[^0-9]/g, "");
    if (cleaned.length <= 4) setStartTimeInput(cleaned);
  };

  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/[^0-9]/g, "");
    if (cleaned.length <= 4) setEndTimeInput(cleaned);
  };

  // Live preview of the values that will be derived from this row.
  const previewMinutes = durationMinutes(startTime || null, endTime || null);
  const previewTimeOfDay = timeOfDayFrom(startTime || null);

  // "Previous platform total" is the running unpaid/cash-out balance since
  // the last payout — i.e. exactly what the dashboard card itself shows
  // right now, before this row exists. Reusing currentTotalFor/
  // currentTokensFor (the same functions the card reads) guarantees this
  // box always matches the card: opening balance + everything earned so
  // far − every payout recorded, never a lifetime/all-time figure.
  const previousTotalUsd = currentTotalFor(platform.id);
  const previousTotalTokens = currentTokensFor(platform.id);
  const rate = platform.tokenValueUsd ?? null;
  const fmt2 = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : "");
  const fmtWhole = (n: number) => (Number.isFinite(n) ? String(Math.round(n)) : "");

  // Only the two "Current platform total" boxes are ever typed into.
  // Whichever one was just edited drives the other (via the platform's
  // rate) — "earned tonight" in both units is then simply current minus
  // previous, computed below, never independently editable.
  useEffect(() => {
    if (!lastEditedField || !rate) return;
    if (lastEditedField === "currentUsd") {
      const currentUsd = num(currentUsdInput);
      if (currentUsd === null) return;
      const dollarsEarned = currentUsd - previousTotalUsd;
      setCurrentTokensInput(fmtWhole(previousTotalTokens + dollarsEarned / rate));
    } else {
      const currentTokens = num(currentTokensInput);
      if (currentTokens === null) return;
      const tokensEarned = currentTokens - previousTotalTokens;
      setCurrentUsdInput(fmt2(previousTotalUsd + tokensEarned * rate));
    }
  }, [
    lastEditedField,
    currentUsdInput,
    currentTokensInput,
    previousTotalUsd,
    previousTotalTokens,
    rate,
  ]);

  const currentUsdNum = num(currentUsdInput);
  const currentTokensNum = num(currentTokensInput);
  const dollarsEarnedTonight = currentUsdNum !== null ? currentUsdNum - previousTotalUsd : null;
  const tokensEarnedTonight =
    currentTokensNum !== null ? currentTokensNum - previousTotalTokens : null;
  const dollarsEarnedNegative = dollarsEarnedTonight !== null && dollarsEarnedTonight < 0;
  const tokensEarnedNegative = tokensEarnedTonight !== null && tokensEarnedTonight < 0;

  // What actually gets saved into the existing tokens/usdActual fields —
  // exactly the same fields every other entry already uses. Tokens are
  // recorded whenever known; USD is only recorded as the row's
  // authoritative figure when the dollar box drove the edit — otherwise
  // it's left null so the existing tokens × rate fallback marks it
  // "calculated", same as it always has.
  const finalTokens = tokensEarnedTonight;
  const finalUsdActual = lastEditedField === "currentTokens" ? null : dollarsEarnedTonight;

  const previewUsd = finalUsdActual ?? (finalTokens !== null && rate ? finalTokens * rate : null);
  const previewFollowerChange =
    num(followersStart) !== null && num(followersEnd) !== null
      ? (num(followersEnd) as number) - (num(followersStart) as number)
      : null;
  const previewPerHour =
    previewMinutes && previewMinutes > 0 && previewUsd !== null
      ? previewUsd / (previewMinutes / 60)
      : null;

  const startTimeValid = startTimeInput.length === 0 || startTime !== "";
  const endTimeValid = endTimeInput.length === 0 || endTime !== "";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    addRow({
      platformId: platform.id,
      date: rowDate,
      startTime: startTime || null,
      endTime: endTime || null,
      timeOfDay: previewTimeOfDay,
      roomCount: num(roomCount),
      followersStart: num(followersStart),
      followersEnd: num(followersEnd),
      tokens: finalTokens,
      usdActual: finalUsdActual,
      followers: previewFollowerChange,
      minutes: previewMinutes,
      tokenValueUsdAtEntry: platform.tokenValueUsd,
      note: note.trim(),
      // Session / Connection — optional analysis fields, only ever set by
      // this form for newly-created rows.
      vpnOnAtStart,
      vpnTurnedOffDuring,
      connectionDropped,
      siteRequiredReset,
      obsProblem,
      streamMasterProblem,
      resetCount,
    });
    // Only record values that actually validated — a mistyped or abandoned
    // field must never bump a garbage entry into the recent list.
    if (startTime) pushRecentValue("startTime", platform.id, startTimeInput);
    if (endTime) pushRecentValue("endTime", platform.id, endTimeInput);
    if (roomCount.trim() !== "" && Number.isFinite(Number(roomCount))) {
      pushRecentValue("roomCount", platform.id, roomCount.trim());
    }
    onClose();
  };

  const compactField =
    "w-full rounded-md border border-input bg-console px-2 py-1 text-xs numeric outline-none focus:border-ring h-8";

  const textAreaField =
    "w-full rounded-md border border-input bg-console px-2 py-1 text-xs outline-none focus:border-ring h-8 min-h-[32px] resize-y font-sans";

  return (
    <form
      ref={boxRef}
      onSubmit={submit}
      style={
        boxPos
          ? { left: boxPos.x, top: boxPos.y, zIndex: 500 }
          : {
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              visibility: "hidden",
              zIndex: 500,
            }
      }
      className={cn(
        "fixed max-h-[92vh] w-[min(980px,calc(100vw-16px))] overflow-y-auto rounded-xl border border-border bg-panel shadow-panel",
        boxDragging ? "shadow-panel-lift" : "hover:shadow-panel-lift",
      )}
    >
      <header
        onPointerDown={startBoxDrag}
        className={cn(
          "sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-xl border-b border-border bg-panel-header px-3 py-2 touch-none",
          boxDragging ? "cursor-grabbing" : "cursor-grab",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <GripVertical className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
          <div className="min-w-0">
            <p className="label-micro">New entry for</p>
            <h2 className="truncate text-sm font-semibold">{platform.name}</h2>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Cancel"
            className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </header>

      <div className="p-3">
        <div className="grid grid-cols-3 gap-2">
          {/* Row 1 */}
          <div>
            <label className="label-micro" htmlFor="row-date">
              Date
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRowDate((d) => shiftDateUTC(d, -1))}
                aria-label="Previous day"
                className="grid size-8 shrink-0 place-items-center rounded-md border border-input bg-console text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <input
                id="row-date"
                type="date"
                value={rowDate}
                onChange={(e) => setRowDate(e.target.value)}
                className={compactField}
              />
              <button
                type="button"
                onClick={() => setRowDate((d) => shiftDateUTC(d, 1))}
                aria-label="Next day"
                className="grid size-8 shrink-0 place-items-center rounded-md border border-input bg-console text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>

          <div>
            <label className="label-micro" htmlFor="row-start">
              Start time (24h)
            </label>
            <input
              id="row-start"
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={startTimeInput}
              onChange={handleStartTimeChange}
              placeholder="0900"
              className={`${compactField} ${!startTimeValid ? "border-error" : ""}`}
              aria-label="Start time as 4-digit 24-hour HHMM, e.g. 0900 or 2200"
            />
            {startTime && <p className="mt-0.5 text-[9px] text-muted-foreground">{startTime}</p>}
            {recentStartTimes.values.length > 0 && (
              <RecentChipsRow
                values={recentStartTimes.values}
                formatLabel={(v) => normalizeHHmm(v) || v}
                onPick={(v) => setStartTimeInput(v)}
              />
            )}
          </div>

          <div>
            <label className="label-micro" htmlFor="row-end">
              End time (24h)
            </label>
            <input
              id="row-end"
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={endTimeInput}
              onChange={handleEndTimeChange}
              placeholder="1300"
              className={`${compactField} ${!endTimeValid ? "border-error" : ""}`}
              aria-label="End time as 4-digit 24-hour HHMM, e.g. 1300 or 2200"
            />
            {endTime && <p className="mt-0.5 text-[9px] text-muted-foreground">{endTime}</p>}
            {recentEndTimes.values.length > 0 && (
              <RecentChipsRow
                values={recentEndTimes.values}
                formatLabel={(v) => normalizeHHmm(v) || v}
                onPick={(v) => setEndTimeInput(v)}
              />
            )}
          </div>

          {/* Row 2 */}
          <div>
            <label className="label-micro" htmlFor="row-fol-start">
              Followers at start
            </label>
            <input
              id="row-fol-start"
              inputMode="numeric"
              value={followersStart}
              onChange={(e) => {
                setFollowersStart(e.target.value);
                setFollowersStartLocked(false);
              }}
              placeholder={followersStartLocked ? "" : "enter manually"}
              className={`${compactField} ${followersStartLocked ? "text-muted-foreground" : ""}`}
              aria-label={
                followersStartLocked
                  ? "Auto-filled from previous entry's ending followers"
                  : "Followers at start — no previous entry exists"
              }
            />
            {followersStartLocked && (
              <p className="mt-0.5 text-[9px] text-muted-foreground">From previous entry</p>
            )}
          </div>

          <div>
            <label className="label-micro" htmlFor="row-fol-end">
              Followers at end
            </label>
            <input
              id="row-fol-end"
              inputMode="numeric"
              value={followersEnd}
              onChange={(e) => setFollowersEnd(e.target.value)}
              placeholder="0"
              className={compactField}
            />
          </div>

          <div>
            <label className="label-micro" htmlFor="row-rooms">
              Room count
            </label>
            <input
              id="row-rooms"
              inputMode="numeric"
              value={roomCount}
              onChange={(e) => setRoomCount(e.target.value)}
              placeholder="0"
              className={compactField}
            />
            {recentRoomCounts.values.length > 0 && (
              <RecentChipsRow values={recentRoomCounts.values} onPick={(v) => setRoomCount(v)} />
            )}
          </div>

          {/* Row 3 — six boxes: previous running balance (since the last
                payout — the same figure the dashboard card shows),
                current running balance (what you type in from the
                platform's site), and tonight's earned difference, for both
                dollars and tokens. Only the two "Current" boxes are
                editable; typing into either one derives the other three
                via the platform's rate. */}
          <div className="col-span-3 space-y-2 rounded-md border border-border bg-console/40 p-2.5">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label-micro" htmlFor="row-prev-usd">
                  Previous platform total $
                </label>
                <input
                  id="row-prev-usd"
                  readOnly
                  tabIndex={-1}
                  value={fmtUsd(previousTotalUsd)}
                  aria-label="Running unpaid balance in dollars, since the last payout, before this session"
                  className={`${compactField} text-muted-foreground`}
                />
              </div>

              <div>
                <label className="label-micro" htmlFor="row-current-usd">
                  Current platform total $
                </label>
                <input
                  id="row-current-usd"
                  inputMode="decimal"
                  value={currentUsdInput}
                  onChange={(e) => {
                    setLastEditedField("currentUsd");
                    setCurrentUsdInput(e.target.value);
                  }}
                  placeholder="e.g. 65.00"
                  className={`${compactField} text-token`}
                />
                {lastEditedField === "currentUsd" && dollarsEarnedNegative && (
                  <p className="mt-0.5 text-[9px] text-token">
                    Lower than the previous total — likely a payout not yet logged, or a counter
                    reset.
                  </p>
                )}
              </div>

              <div>
                <label className="label-micro" htmlFor="row-usd-earned">
                  Dollars earned tonight
                </label>
                <input
                  id="row-usd-earned"
                  readOnly
                  tabIndex={-1}
                  value={dollarsEarnedTonight !== null ? fmtUsd(dollarsEarnedTonight) : "—"}
                  aria-label="Current platform total minus previous platform total"
                  className={`${compactField} text-muted-foreground`}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label-micro" htmlFor="row-prev-tokens">
                  Previous platform tokens
                </label>
                <input
                  id="row-prev-tokens"
                  readOnly
                  tabIndex={-1}
                  value={fmtNum(previousTotalTokens)}
                  aria-label="Running unpaid token balance, since the last payout, before this session"
                  className={`${compactField} text-muted-foreground`}
                />
              </div>

              <div>
                <label className="label-micro" htmlFor="row-current-tokens">
                  Current platform tokens
                </label>
                <input
                  id="row-current-tokens"
                  inputMode="numeric"
                  value={currentTokensInput}
                  onChange={(e) => {
                    setLastEditedField("currentTokens");
                    setCurrentTokensInput(e.target.value);
                  }}
                  placeholder="e.g. 1300"
                  className={`${compactField} text-token`}
                />
                {lastEditedField === "currentTokens" && tokensEarnedNegative && (
                  <p className="mt-0.5 text-[9px] text-token">
                    Lower than the previous total — likely a payout not yet logged, or a counter
                    reset.
                  </p>
                )}
              </div>

              <div>
                <label className="label-micro" htmlFor="row-tokens-earned">
                  Tokens earned tonight
                </label>
                <input
                  id="row-tokens-earned"
                  readOnly
                  tabIndex={-1}
                  value={tokensEarnedTonight !== null ? fmtNum(tokensEarnedTonight) : "—"}
                  aria-label="Current platform tokens minus previous platform tokens"
                  className={`${compactField} text-muted-foreground`}
                />
              </div>
            </div>

            {!rate && (
              <p className="text-[9px] text-muted-foreground">
                No token rate set for this platform — dollar and token figures won't convert into
                each other automatically.
              </p>
            )}
          </div>

          {/* Notes (left half) and Time of Day (right half) */}
          <div className="col-span-3 grid grid-cols-2 gap-2">
            <div>
              <div className="flex items-center justify-between">
                <label className="label-micro" htmlFor="row-note">
                  Notes
                </label>
                {voiceSupported && (
                  <button
                    type="button"
                    onClick={toggleVoice}
                    aria-label={listening ? "Stop dictation" : "Dictate notes"}
                    className={`rounded border border-border px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      listening
                        ? "border-token/40 text-token"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {listening ? <MicOff className="size-3" /> : <Mic className="size-3" />}
                  </button>
                )}
              </div>
              <textarea
                id="row-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={1}
                placeholder="Notes"
                className={textAreaField}
              />
            </div>

            <div>
              <label className="label-micro" htmlFor="row-tod">
                Time of Day
              </label>
              <input
                id="row-tod"
                readOnly
                tabIndex={-1}
                value={previewTimeOfDay ?? "—"}
                aria-label="Time of day, derived from start time"
                className={`${compactField} text-muted-foreground`}
              />
            </div>
          </div>

          {/* Session / Connection — compact, optional, sits directly above Save Entry */}
          <div className="col-span-3 rounded-md border border-border bg-console/40 p-2.5">
            <p className="label-micro mb-1.5">Session / Connection</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  VPN
                </p>
                <div className="flex flex-col gap-1">
                  <ToggleChip
                    label="VPN ON at start"
                    checked={vpnOnAtStart}
                    onChange={setVpnOnAtStart}
                  />
                  <ToggleChip
                    label="VPN turned OFF during session"
                    checked={vpnTurnedOffDuring}
                    onChange={setVpnTurnedOffDuring}
                  />
                </div>
              </div>

              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  Connection
                </p>
                <div className="flex flex-col gap-1">
                  <ToggleChip
                    label="Connection dropped"
                    checked={connectionDropped}
                    onChange={setConnectionDropped}
                  />
                  <ToggleChip
                    label="Site required reset"
                    checked={siteRequiredReset}
                    onChange={setSiteRequiredReset}
                  />
                  <ToggleChip
                    label="OBS problem / glitch"
                    checked={obsProblem}
                    onChange={setObsProblem}
                  />
                  <ToggleChip
                    label="Stream Master problem / glitch"
                    checked={streamMasterProblem}
                    onChange={setStreamMasterProblem}
                  />
                </div>
              </div>
            </div>

            <div className="mt-2.5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                Number of resets
              </p>
              <ResetCountControl value={resetCount} onChange={setResetCount} />
            </div>
          </div>

          {/* Row 4 — save */}
          <div className="col-span-3 flex justify-end">
            <button
              type="submit"
              className="h-8 rounded-md bg-primary px-6 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:opacity-90"
            >
              Save Entry
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-console/60 px-3 py-1.5 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="label-micro">Duration</span>
            <span className="numeric">
              {previewMinutes === null ? "—" : fmtHours(previewMinutes)}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="label-micro">Follower change</span>
            <span className="numeric">
              {previewFollowerChange === null
                ? "—"
                : `${previewFollowerChange >= 0 ? "+" : ""}${previewFollowerChange}`}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="label-micro">Per hour</span>
            <span className="numeric">
              {previewPerHour === null ? "—" : fmtUsd(previewPerHour)}
            </span>
          </div>
        </div>

        <p className="mt-2 rounded-md border border-border bg-console/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          "Platform total" is the running unpaid balance since the last payout — the same figure the
          dashboard card shows — not a lifetime total. Enter the platform's current total in either
          dollars or tokens and tonight's earned figures fill in automatically. If a previous entry
          exists, its ending followers are used as the starting value automatically.
        </p>
      </div>
    </form>
  );
}

/**
 * Small row of quick-pick chips for a "recent values" list — most recently
 * used first, never numerically sorted. Clicking a chip fills the field;
 * it never submits the form.
 */
function RecentChipsRow({
  values,
  onPick,
  formatLabel,
}: {
  values: string[];
  onPick: (value: string) => void;
  formatLabel?: (value: string) => string;
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onPick(v)}
          className="rounded border border-border bg-console px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground hover:border-ring hover:text-foreground"
        >
          {formatLabel ? formatLabel(v) : v}
        </button>
      ))}
    </div>
  );
}

/**
 * Independent yes/no toggle styled as a chip with a checkbox-style tick box.
 * Used for the Session / Connection fields — each one is its own boolean,
 * so any combination (e.g. "VPN ON at start" AND "VPN turned OFF during
 * session") can be selected together.
 */
function ToggleChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] font-medium transition-colors",
        checked
          ? "border-token bg-token/15 text-foreground"
          : "border-input bg-console text-muted-foreground hover:border-ring hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "grid size-3.5 shrink-0 place-items-center rounded-sm border",
          checked ? "border-token bg-token" : "border-input bg-transparent",
        )}
      >
        {checked && <Check className="size-2.5 text-panel" strokeWidth={3} />}
      </span>
      {label}
    </button>
  );
}

/**
 * Single-choice reset-count selector — "0" through "3", plus "4+" for
 * anything higher. Optional: clicking the already-selected option clears
 * it back to unanswered, since the field must not force a value.
 */
function ResetCountControl({
  value,
  onChange,
}: {
  value: ResetCount | null;
  onChange: (next: ResetCount | null) => void;
}) {
  const options: ResetCount[] = ["0", "1", "2", "3", "4+"];
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Number of resets">
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(selected ? null : opt)}
            className={cn(
              "min-w-[36px] rounded-md border px-2 py-1.5 text-center text-[11px] font-semibold transition-colors",
              selected
                ? "border-token bg-token text-panel"
                : "border-input bg-console text-muted-foreground hover:border-ring hover:text-foreground",
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
