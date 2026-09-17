import { useMemo, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import {
  deriveRow,
  durationMinutes,
  fmtNum,
  fmtUsd,
  normalizeHHmm,
  timeOfDayFrom,
  useTokenTrack,
} from "@/lib/tokentrack/store";
import type { EntryRow } from "@/lib/tokentrack/types";

type Draft = {
  date: string;
  startTimeInput: string; // raw 4-digit, matches Add Row's convention
  endTimeInput: string;
  roomCount: string;
  followersStart: string;
  followersEnd: string;
  tokens: string;
  usdActual: string;
  note: string;
};

function toDraft(row: EntryRow): Draft {
  return {
    date: row.date,
    startTimeInput: row.startTime ? row.startTime.replace(":", "") : "",
    endTimeInput: row.endTime ? row.endTime.replace(":", "") : "",
    roomCount: row.roomCount === null || row.roomCount === undefined ? "" : String(row.roomCount),
    followersStart:
      row.followersStart === null || row.followersStart === undefined
        ? ""
        : String(row.followersStart),
    followersEnd:
      row.followersEnd === null || row.followersEnd === undefined ? "" : String(row.followersEnd),
    tokens: row.tokens === null || row.tokens === undefined ? "" : String(row.tokens),
    usdActual: row.usdActual === null || row.usdActual === undefined ? "" : String(row.usdActual),
    note: row.note ?? "",
  };
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));

const cellInput =
  "w-full min-w-0 rounded border border-input bg-console px-1.5 py-1 text-xs numeric outline-none focus:border-ring";

export function Reconciliation() {
  const { platforms, rows, updateRow, deleteRow } = useTokenTrack();

  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const platformName = (id: string) =>
    platforms.find((p) => p.id === id)?.displayName?.trim() ||
    platforms.find((p) => p.id === id)?.name ||
    id;

  const filteredRows = useMemo(() => {
    return rows
      .filter((r) => platformFilter === "all" || r.platformId === platformFilter)
      .filter((r) => !startDate || r.date >= startDate)
      .filter((r) => !endDate || r.date <= endDate)
      .map(deriveRow)
      .sort((a, b) =>
        a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date),
      );
  }, [rows, platformFilter, startDate, endDate]);

  const beginEdit = (row: EntryRow) => {
    setEditingId(row.id);
    setDraft(toDraft(row));
    setSaveError(null);
    setConfirmDelete(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
    setSaveError(null);
  };

  const saveEdit = (id: string) => {
    if (!draft) return;
    const startTime = draft.startTimeInput ? normalizeHHmm(draft.startTimeInput) : "";
    const endTime = draft.endTimeInput ? normalizeHHmm(draft.endTimeInput) : "";
    if (draft.startTimeInput && !startTime) {
      setSaveError("Start time isn't a valid 24h HHMM value (e.g. 2200).");
      return;
    }
    if (draft.endTimeInput && !endTime) {
      setSaveError("End time isn't a valid 24h HHMM value (e.g. 0000).");
      return;
    }
    if (!draft.date) {
      setSaveError("Date can't be blank.");
      return;
    }
    const followersStart = num(draft.followersStart);
    const followersEnd = num(draft.followersEnd);

    // Same UPDATE-by-id path Add Row/PlatformDetail already use — this
    // patches the existing row in place, it never inserts a new one, so a
    // correction here can't create a duplicate.
    updateRow(id, {
      date: draft.date,
      startTime: startTime || null,
      endTime: endTime || null,
      timeOfDay: timeOfDayFrom(startTime || null),
      minutes: durationMinutes(startTime || null, endTime || null),
      roomCount: num(draft.roomCount),
      followersStart,
      followersEnd,
      followers:
        followersStart !== null && followersEnd !== null ? followersEnd - followersStart : null,
      tokens: num(draft.tokens),
      usdActual: num(draft.usdActual),
      note: draft.note.trim(),
    });
    cancelEdit();
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 p-6">
      <header>
        <h1 className="text-base font-semibold tracking-tight">Reconciliation</h1>
        <p className="text-xs text-muted-foreground">
          Correct an existing entry in place — corrections update Dashboard and Analytics
          immediately, and the full history stays intact.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-panel p-3">
        <label className="flex items-center gap-1.5">
          <span className="label-micro">Platform</span>
          <select
            value={platformFilter}
            onChange={(e) => setPlatformFilter(e.target.value)}
            className="rounded-md border border-input bg-console px-2 py-1 text-xs outline-none focus:border-ring"
          >
            <option value="all">All platforms</option>
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName?.trim() || p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="label-micro">From</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="numeric rounded-md border border-input bg-console px-2 py-1 text-xs outline-none focus:border-ring"
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="label-micro">To</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="numeric rounded-md border border-input bg-console px-2 py-1 text-xs outline-none focus:border-ring"
          />
        </label>
        {(startDate || endDate || platformFilter !== "all") && (
          <button
            type="button"
            onClick={() => {
              setPlatformFilter("all");
              setStartDate("");
              setEndDate("");
            }}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            Clear filters
          </button>
        )}
        <p className="ml-auto text-[11px] text-muted-foreground">{filteredRows.length} entries</p>
      </div>

      {saveError && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {saveError}
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-panel">
        {filteredRows.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            No entries match these filters.
          </p>
        ) : (
          <table className="w-full min-w-[1080px] text-left text-xs">
            <thead className="sticky top-0 bg-panel-header">
              <tr className="label-micro">
                <th className="px-3 py-2 font-semibold">Platform</th>
                <th className="px-2 py-2 font-semibold">Date</th>
                <th className="px-2 py-2 font-semibold">Start</th>
                <th className="px-2 py-2 font-semibold">End</th>
                <th className="px-2 py-2 font-semibold">Rooms</th>
                <th className="px-2 py-2 font-semibold">Fol. start</th>
                <th className="px-2 py-2 font-semibold">Fol. end</th>
                <th className="px-2 py-2 font-semibold">Tokens</th>
                <th className="px-2 py-2 font-semibold">USD</th>
                <th className="px-2 py-2 font-semibold">Note</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 font-medium">{platformName(row.platformId)}</td>
                    <td className="px-2 py-2">
                      {isEditing && draft ? (
                        <input
                          type="date"
                          className={cellInput}
                          value={draft.date}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, date: e.target.value } : d))
                          }
                        />
                      ) : (
                        <span className="numeric text-muted-foreground">{row.date}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing && draft ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="2200"
                          className={cellInput}
                          value={draft.startTimeInput}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    startTimeInput: e.target.value
                                      .replace(/[^0-9]/g, "")
                                      .slice(0, 4),
                                  }
                                : d,
                            )
                          }
                        />
                      ) : (
                        <span className="numeric text-muted-foreground">
                          {row.startTime ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing && draft ? (
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="0000"
                          className={cellInput}
                          value={draft.endTimeInput}
                          onChange={(e) =>
                            setDraft((d) =>
                              d
                                ? {
                                    ...d,
                                    endTimeInput: e.target.value.replace(/[^0-9]/g, "").slice(0, 4),
                                  }
                                : d,
                            )
                          }
                        />
                      ) : (
                        <span className="numeric text-muted-foreground">{row.endTime ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing && draft ? (
                        <input
                          inputMode="numeric"
                          className={cellInput}
                          value={draft.roomCount}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, roomCount: e.target.value } : d))
                          }
                        />
                      ) : (
                        <span className="numeric">{row.roomCount ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing && draft ? (
                        <input
                          inputMode="numeric"
                          className={cellInput}
                          value={draft.followersStart}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, followersStart: e.target.value } : d))
                          }
                        />
                      ) : (
                        <span className="numeric">{row.followersStart ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing && draft ? (
                        <input
                          inputMode="numeric"
                          className={cellInput}
                          value={draft.followersEnd}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, followersEnd: e.target.value } : d))
                          }
                        />
                      ) : (
                        <span className="numeric">{row.followersEnd ?? "—"}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing && draft ? (
                        <input
                          inputMode="numeric"
                          className={`${cellInput} text-token`}
                          value={draft.tokens}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, tokens: e.target.value } : d))
                          }
                        />
                      ) : (
                        <span className="numeric text-token">
                          {row.tokens === null ? "—" : fmtNum(row.tokens)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {isEditing && draft ? (
                        <input
                          inputMode="decimal"
                          className={cellInput}
                          value={draft.usdActual}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, usdActual: e.target.value } : d))
                          }
                        />
                      ) : (
                        <span className="numeric">
                          {fmtUsd(row.usdValue)}
                          <span className="ml-1 text-[9px] uppercase text-muted-foreground">
                            {row.usdSource === "actual" ? "act" : "calc"}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="max-w-[220px] px-2 py-2">
                      {isEditing && draft ? (
                        <input
                          className={cellInput}
                          value={draft.note}
                          onChange={(e) =>
                            setDraft((d) => (d ? { ...d, note: e.target.value } : d))
                          }
                        />
                      ) : (
                        <span className="block truncate text-muted-foreground" title={row.note}>
                          {row.note || "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              type="button"
                              aria-label="Save changes"
                              onClick={() => saveEdit(row.id)}
                              className="grid size-6 place-items-center rounded text-status-active hover:bg-secondary"
                            >
                              <Check className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel edit"
                              onClick={cancelEdit}
                              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                            >
                              <X className="size-3.5" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            aria-label="Edit row"
                            onClick={() => beginEdit(row)}
                            className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={confirmDelete === row.id ? "Confirm delete" : "Delete row"}
                          onClick={() =>
                            confirmDelete === row.id
                              ? (deleteRow(row.id), setConfirmDelete(null))
                              : setConfirmDelete(row.id)
                          }
                          className={`grid size-6 place-items-center rounded hover:bg-secondary ${
                            confirmDelete === row.id
                              ? "text-destructive"
                              : "text-muted-foreground hover:text-destructive"
                          }`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        Saving edits the existing entry in place — it never creates a new row. Click delete twice to
        confirm.
      </p>
    </div>
  );
}
