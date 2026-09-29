/**
 * @file edit-history.ts
 * @description **Pure** undo/redo history core for a note's body (`DocModel`) — Lot A of the
 * Undo/Redo feature. No Angular, no DOM: one instance per editor (C1, NOT `providedIn:'root'`).
 * Holds the past/future stack, typing coalescing (D1/C3) and FIFO bounding (D6).
 *
 * Implemented in TDD, group by group (T1→T5), against the validated plan
 * (`.agent/UNDO_REDO/PLAN_TESTS_EDIT_HISTORY.md` §5, API contract) — signatures frozen there.
 * Fully green on `edit-history.spec.ts` (Lot A). DOM wiring (`RichTextEditor`), per-note reset
 * and toolbar buttons are Lots B/C/D (out of scope here).
 */
import { DocModel } from '../models/document.model';
import { ModelSelection } from './document-selection';

/**
 * One history step: the immutable model reference (no deep-copy, C2/D7) plus the selection to
 * restore when the step is (re)applied (D3). `selection` is `null` when none is resolved.
 */
export interface HistoryEntry {
  model: DocModel;
  selection: ModelSelection | null;
}

/** Internal coalescing state of the current typing run (D8). */
export interface TypingRun {
  /** Timestamp (ms) of the last keystroke folded into the open run. */
  lastEditAt: number;
  /** Whether the run is still open (a new keystroke may extend it in place). */
  open: boolean;
}

/**
 * Coalescing pause threshold (C3, frozen — not a range): a gap `>= 500 ms` seals the run and the
 * next keystroke opens a NEW step (D2, inclusive bound).
 */
export const TYPING_COALESCE_PAUSE_MS = 500;

/**
 * Pure edit-history stack (past/future) with typing coalescing and FIFO bounding.
 * Invariant once seeded: `0 <= index < entries.length`, `entries[index]` is the current state.
 */
export class EditHistory {
  /**
   * Past/future stack: `entries[index]` is the current state, `entries[0..index-1]` the past,
   * `entries[index+1..]` the future (invariant `0 <= index < entries.length` once seeded).
   * Empty (`index = -1`) at cold construction until the first `reset`/`push` seeds it (D6).
   */
  private entries: HistoryEntry[] = [];
  private index = -1;

  /**
   * Coalescing state of the current typing run (D8), or `null` when no run is open (after a
   * command, a seal, a boundary or an undo). While `open`, a fast enough keystroke extends the
   * current step in place instead of pushing a new one.
   */
  private run: TypingRun | null = null;

  /**
   * @param limit Maximum number of retained steps (D3, default 100, FIFO eviction beyond it).
   */
  constructor(private readonly limit = 100) {}

  /** (Re)seeds the history on an initial step, purging past AND future (D7). */
  reset(entry: HistoryEntry): void {
    this.entries = [entry];
    this.index = 0;
    // Close any open typing run (APPROCHE §3): a reset (e.g. Lot C reloading a note) must not let
    // the previous note's burst survive, otherwise the first keystroke of the reseeded note within
    // the pause window would extend the seed step in place instead of opening a new one (C1).
    this.run = null;
  }

  /** Pushes one discrete command as a new step (truncates future, enforces the limit). */
  push(entry: HistoryEntry): void {
    // A discrete command ends any open typing run: the next keystroke starts a fresh step.
    this.run = null;
    this.truncateFuture();
    this.entries.push(entry);
    this.index = this.entries.length - 1;
    this.enforceLimit();
  }

  /** Records one keystroke with coalescing (D1/C3/D5); `isBoundary` seals the current step. */
  recordTyping(entry: HistoryEntry, now: number, isBoundary = false): void {
    // Extend the OPEN run in place while keystrokes stay within the pause window (D2/D8): same
    // step, latest snapshot wins. A gap `>= 500 ms`, a sealed run (boundary/seal/undo) or a cold
    // start opens a NEW step via `push` (which truncates the future and bounds the stack — D8).
    const canExtend = this.run !== null && this.run.open && now - this.run.lastEditAt < TYPING_COALESCE_PAUSE_MS;
    if (canExtend) {
      this.entries[this.index] = entry; // extend in place, no new step (D8)
      this.run!.lastEditAt = now; // slide the coalescing window onto the latest keystroke
    } else {
      this.push(entry); // open a new step (push resets `run` to null)
      this.run = { lastEditAt: now, open: true }; // opens the run with `lastEditAt` already at `now`
    }
    // A word boundary (separator) extends/opens the step THEN seals it, so the next keystroke
    // starts a new step even within the pause window (D5).
    if (isBoundary) {
      this.run!.open = false;
    }
  }

  /** Moves to the past → returns the entry to re-apply, or `null` at the bottom. */
  undo(): HistoryEntry | null {
    // The open typing run counts as one whole step: seal it first so one undo rewinds to the
    // state BEFORE the burst, not to the previous keystroke (D1, approche §3).
    this.seal();
    if (!this.canUndo()) {
      return null;
    }
    this.index--;
    return this.entries[this.index];
  }

  /** Moves to the future → returns the entry to re-apply, or `null` at the top. */
  redo(): HistoryEntry | null {
    if (!this.canRedo()) {
      return null;
    }
    this.index++;
    return this.entries[this.index];
  }

  /** True when a past step exists (`index > 0`). */
  canUndo(): boolean {
    return this.index > 0;
  }

  /** True when a future step exists (`index < entries.length - 1`). */
  canRedo(): boolean {
    return this.index < this.entries.length - 1;
  }

  /** Closes the open typing run so the next keystroke opens a new step (D4, public for Lot B). */
  seal(): void {
    // No-op when no run is open (D4/T6.3): never throws, leaves the stack untouched.
    if (this.run !== null) {
      this.run.open = false;
    }
  }

  /** Internal (D4): drops the future from the current index; covered only via `push`. */
  private truncateFuture(): void {
    // Keep past + current (`entries[0..index]`), drop the future branch (`entries[index+1..]`).
    // At cold state (`index = -1`) this clears nothing and the first push seeds index 0 (D6).
    this.entries.length = this.index + 1;
  }

  /** Internal (D4): FIFO-evicts the oldest steps beyond the limit; covered only via `push`. */
  private enforceLimit(): void {
    // Drop the oldest step(s) while over the bound (D3). `push` calls this right after appending,
    // so the current step is the top (`index = length - 1`): each `shift` decrements `index` in
    // lockstep, keeping `entries[index]` the same "present" (canRedo stays false, no drift).
    while (this.entries.length > this.limit) {
      this.entries.shift();
      this.index--;
    }
  }
}
