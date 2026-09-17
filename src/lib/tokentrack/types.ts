export type PlatformStatus = "active" | "testing" | "inactive";

/** How a platform reports its numbers. Drives which inputs are shown. */
export type InputMode = "tokens" | "usd" | "tokens_and_usd";

export interface Platform {
  /** Stable platform identity — never reused when a slot is reassigned. */
  id: string;
  /** Underlying platform identity (e.g. "Chaturbate"). Configured in Settings. */
  name: string;
  /** Short editable label shown on the dashboard (e.g. "CB"). */
  displayName: string;
  status: PlatformStatus;
  /** Dashboard display/order position 1..6. Separate from platform identity. */
  slot: number;
  inputMode: InputMode;
  /** USD per token — always platform-specific, never a global rate. */
  tokenValueUsd: number | null;
  /** Verified opening balance in USD as of the opening date. */
  openingBalanceUsd: number;
  openingDate: string;
  accent: string;
  /** Configured payout destination (set in Settings), e.g. "Coins.ph" or "Wise". */
  payoutDestination?: string | null;
  /** Free-text payout information: account reference, schedule, minimum, etc. */
  payoutInfo?: string | null;
}

/** A payout withdrawn from a platform balance. Stored separately from earnings rows. */
export interface Payout {
  id: string;
  platformId: string;
  /** ISO date (yyyy-mm-dd) of the payout. */
  date: string;
<<<<<<< HEAD
  /** HH:mm 24h, same convention as EntryRow start/end time. Null if not recorded. */
  time: string | null;
  /** Positive USD amount withdrawn. Never stores currency symbols. */
  amountUsd: number;
  /**
   * Optional token figure for this payout, entered manually when the
   * operator knows it. Left null when there's no clean token figure for
   * this platform (e.g. BongaCams) — no conversion is invented here.
   */
  tokensAmount: number | null;
=======
  /** Positive USD amount withdrawn. Never stores currency symbols. */
  amountUsd: number;
>>>>>>> bf4d284f8dfaffbf2178ff5d6a519c85c65e128e
  /** Destination captured at payout time so history is never rewritten. */
  destination: string;
  /** USD/PHP rate captured at payout time. */
  usdPhpRateAtEntry: number | null;
  note: string;
  createdAt: string;
}

export type ValueSource = "actual" | "calculated" | "estimated";

<<<<<<< HEAD
/** Selected option for EntryRow.resetCount. */
export type ResetCount = "0" | "1" | "2" | "3" | "4+";

=======
>>>>>>> bf4d284f8dfaffbf2178ff5d6a519c85c65e128e
export interface EntryRow {
  id: string;
  platformId: string;
  /** ISO date (yyyy-mm-dd) the record belongs to. */
  date: string;
<<<<<<< HEAD
  /**
   * Session start/end as 24h "HHmm" with no colon, e.g. "2200", "0000"
   * — this is the recorded/stored form. Older rows saved before this
   * convention may still have a colon ("22:00"); every time calculation
   * in the app tolerates both, but new entries are always no-colon.
   */
=======
  /** Session start/end as HH:mm (24h). Optional for legacy rows. */
>>>>>>> bf4d284f8dfaffbf2178ff5d6a519c85c65e128e
  startTime?: string | null;
  endTime?: string | null;
  /** Derived from start time (Morning/Afternoon/Evening/Night). Never entered manually. */
  timeOfDay?: string | null;
  /** Number of rooms/shows in the session. */
  roomCount?: number | null;
  /** Follower snapshots — never overwritten, kept per session. */
  followersStart?: number | null;
  followersEnd?: number | null;
  tokens: number | null;
  usdActual: number | null;
  /** Legacy net follower change when start/end snapshots are absent. */
  followers: number | null;
  /** Legacy manual duration in minutes when start/end times are absent. */
  minutes: number | null;
  /** Rate captured at entry time so history is never rewritten. */
  tokenValueUsdAtEntry: number | null;
  note: string;
<<<<<<< HEAD
  /**
   * Session / Connection — optional, independent yes/no facts about the
   * session captured from the Add New Row form, for later analysis against
   * tokens/hour, USD/hour, followers/hour, etc. All optional: historical
   * and migrated rows predate these fields and simply have them undefined
   * (or null once loaded from Supabase) rather than false — no field here
   * is ever assumed to be "no" just because it's missing.
   */
  vpnOnAtStart?: boolean | null;
  vpnTurnedOffDuring?: boolean | null;
  connectionDropped?: boolean | null;
  siteRequiredReset?: boolean | null;
  obsProblem?: boolean | null;
  streamMasterProblem?: boolean | null;
  /** Single-choice reset count for the session; null/undefined means not answered. */
  resetCount?: ResetCount | null;
=======
>>>>>>> bf4d284f8dfaffbf2178ff5d6a519c85c65e128e
  /** Where the record came from. Manual rows are provisional until verified. */
  origin: RecordOrigin;
  /** True only when the figures came from (or were confirmed by) platform data. */
  verified: boolean;
  /**
   * Stable natural key for future imports: `${platformId}|${date}|${startTime ?? "-"}`
   * (or the platform's own record id). Used to match, dedupe and enrich —
   * never to delete history.
   */
  importKey?: string | null;
  /** Which import batch/file last enriched this row. */
  importBatchId?: string | null;
  importedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Provenance of an entry row. */
export type RecordOrigin = "manual" | "imported";

export interface DerivedRow extends EntryRow {
  usdValue: number;
  usdSource: ValueSource;
  /** Session duration in minutes, from start/end times when available. */
  minutesValue: number;
  /** Followers at end minus followers at start. */
  followerChange: number;
  /** USD earned per hour of session time; null when duration is zero. */
  usdPerHour: number | null;
}
<<<<<<< HEAD
=======

>>>>>>> bf4d284f8dfaffbf2178ff5d6a519c85c65e128e
