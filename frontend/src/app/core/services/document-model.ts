import { Injectable } from '@angular/core';
import {
  DocModel,
  isTextBlock,
  Mark,
  MarkSize,
  MarkType,
  TextBlock,
  TextBlockKind,
} from '../models/document.model';

/**
 * @file document-model.ts
 * @description **Pure** core of the JSON document model: canonical normalization, interval algebra
 * and editing commands. No DOM, no `window` — 100% deterministic.
 *
 * Decided on 2026-09-15 (see .agent/PLAN_MODELE_DOCUMENT_JSON.md §4.4/§4.5). Every method is
 * **pure**: it returns **new** objects and never mutates its input. The `RichTextEditor` (Phase 3)
 * orchestrates the flow: command → new model → re-render → selection restore.
 *
 * Built test-first, group by group (see .agent/PLAN_TESTS_DOCUMENT_MODEL.md); the
 * `document-model.spec.ts` suite is green (54/54).
 */
@Injectable({ providedIn: 'root' })
export class DocumentModelService {
  // --- Normalization & querying -----------------------------------------------

  /**
   * Returns the canonical form of a block: marks clamped, sorted `(type, value, start)` and merged (D6).
   * @param block The block to normalize.
   * @returns A new block sharing `text`/`kind`/`id` but carrying canonical marks; the input is untouched.
   */
  normalize(block: TextBlock): TextBlock {
    return { ...block, marks: this.canonicalMarks(block.marks, block.text.length) };
  }

  /**
   * Tells whether the whole selection is covered by a single mark of the given type (and value).
   * @param block The block to inspect.
   * @param from Selection start (UTF-16 offset).
   * @param to Selection end (UTF-16 offset).
   * @param type The mark type to look for.
   * @param value Optional mark value (e.g. a colour or size); must match exactly.
   * @returns True iff every offset in `[from, to)` is covered by one `type` (+`value`) mark; a
   *          collapsed or reversed selection returns false (§7.5).
   */
  isMarkActive(block: TextBlock, from: number, to: number, type: MarkType, value?: string): boolean {
    if (from >= to) return false; // collapsed or reversed selection (§7.5)
    // On the canonical form, a union coverage is equivalent to coverage by a single run.
    return this.canonicalMarks(block.marks, block.text.length).some(
      (m) => m.type === type && m.value === value && m.start <= from && m.end >= to,
    );
  }

  // --- Inline commands (interval arithmetic) ----------------------------------

  /**
   * Toggles a mark over the selection: adds it (union) or removes it (subtraction) depending on
   * `isMarkActive`, then normalizes.
   * @param block The block to edit.
   * @param from Selection start (UTF-16 offset, may be out of bounds or reversed).
   * @param to Selection end (UTF-16 offset, may be out of bounds or reversed).
   * @param type The mark type to toggle.
   * @param value Optional mark value carried by the mark.
   * @returns A new normalized block; the input is never mutated.
   */
  toggleMark(block: TextBlock, from: number, to: number, type: MarkType, value?: string): TextBlock {
    return this.editInline(block, from, to, (lo, hi) =>
      this.isMarkActive(block, lo, hi, type, value)
        ? this.cutMarks(block.marks, lo, hi, (m) => m.type === type && m.value === value) // removal
        : [...block.marks, this.makeMark(type, lo, hi, value)], // addition (union via normalize)
    );
  }

  /**
   * Sets or replaces a colour over the selection; re-applying the SAME colour on a fully covered
   * range removes it (toggle behaviour).
   * @param block The block to edit.
   * @param from Selection start (UTF-16 offset).
   * @param to Selection end (UTF-16 offset).
   * @param color The colour to apply, as a hex value (`#rrggbb`).
   * @returns A new normalized block; the input is never mutated.
   */
  setColor(block: TextBlock, from: number, to: number, color: string): TextBlock {
    return this.setValueMark(block, from, to, 'color', color);
  }

  /**
   * Sets or replaces an inline size over the selection; re-applying the SAME size on a fully
   * covered range removes it (toggle behaviour).
   * @param block The block to edit.
   * @param from Selection start (UTF-16 offset).
   * @param to Selection end (UTF-16 offset).
   * @param size The inline size to apply (`'small'` | `'large'`).
   * @returns A new normalized block; the input is never mutated.
   */
  setSize(block: TextBlock, from: number, to: number, size: MarkSize): TextBlock {
    return this.setValueMark(block, from, to, 'size', size);
  }

  /**
   * Removes every `size` mark over the selection (back to the "normal" size).
   * @param block The block to edit.
   * @param from Selection start (UTF-16 offset).
   * @param to Selection end (UTF-16 offset).
   * @returns A new normalized block; the input is never mutated.
   */
  clearSize(block: TextBlock, from: number, to: number): TextBlock {
    return this.editInline(block, from, to, (lo, hi) =>
      this.cutMarks(block.marks, lo, hi, (m) => m.type === 'size'),
    );
  }

  // --- Block commands (DocModel level) ----------------------------------------

  /**
   * Switches the `kind` of a text block. A missing block or a void (media) block leaves the model
   * unchanged.
   * @param model The document to edit.
   * @param blockId The id of the block to switch.
   * @param kind The new text-block kind.
   * @returns A new document with the block switched, or the original model when nothing applies.
   */
  setBlockKind(model: DocModel, blockId: string, kind: TextBlockKind): DocModel {
    return model.map((b) => (b.id === blockId && isTextBlock(b) ? { ...b, kind } : b));
  }

  /**
   * Splits a block at `offset` (Enter key): the right block inherits the `kind` and receives a new
   * id from `makeId`. Marks are split across both sides (the right side is rebased `-= offset`). A
   * missing or void block leaves the model unchanged.
   * @param model The document to edit.
   * @param blockId The id of the block to split.
   * @param offset The cut position (UTF-16 offset), clamped to `[0, text.length]`.
   * @param makeId Factory for the right block's id (defaults to `crypto.randomUUID`); injectable for tests.
   * @returns A new document with the block replaced by its two halves, or the original model when nothing applies.
   */
  splitBlock(
    model: DocModel,
    blockId: string,
    offset: number,
    makeId: () => string = () => crypto.randomUUID(),
  ): DocModel {
    const idx = this.blockIndex(model, blockId);
    if (idx < 0) return model;
    const block = model[idx];
    if (!isTextBlock(block)) return model; // void block → unchanged (DG)

    const len = block.text.length;
    const cut = Math.max(0, Math.min(offset, len));

    const left = this.normalize({
      id: block.id, // the left block keeps the source id
      kind: block.kind,
      text: block.text.slice(0, cut),
      marks: this.intersectShift(block.marks, 0, cut, 0),
    });
    const right = this.normalize({
      id: makeId(), // the right block gets a fresh id and inherits the kind (§7.2)
      kind: block.kind,
      text: block.text.slice(cut),
      marks: this.intersectShift(block.marks, cut, len, cut),
    });

    return [...model.slice(0, idx), left, right, ...model.slice(idx + 1)];
  }

  /**
   * Merges `id2` into `id1` (Backspace key): text is concatenated, `id2`'s marks are rebased
   * `+= len(text1)`, then the result is normalized (marks merged at the junction). A missing id
   * leaves the model unchanged.
   * @param model The document to edit.
   * @param id1 The id of the first (kept) block; receives the merged content and keeps its id.
   * @param id2 The id of the second block, appended to the first and then removed.
   * @returns A new document with the two blocks merged, or the original model when an id is missing.
   */
  mergeBlocks(model: DocModel, id1: string, id2: string): DocModel {
    const i1 = this.blockIndex(model, id1);
    const i2 = this.blockIndex(model, id2);
    if (i1 < 0 || i2 < 0) return model;
    const b1 = model[i1];
    const b2 = model[i2];
    if (!isTextBlock(b1) || !isTextBlock(b2)) return model; // void guard (DG)

    const len1 = b1.text.length;
    const merged = this.normalize({
      id: b1.id, // the merged block keeps the first block's id
      kind: b1.kind,
      text: b1.text + b2.text,
      marks: [
        ...b1.marks,
        ...b2.marks.map((m) => ({ ...m, start: m.start + len1, end: m.end + len1 })), // rebase
      ],
    });

    return model.filter((_, i) => i !== i2).map((b) => (b.id === id1 ? merged : b));
  }

  // --- Text editing (controlled mode, Phase 4) --------------------------------

  /**
   * Inserts `s` at `offset` and shifts the marks accordingly, then normalizes.
   * @param block The block to edit.
   * @param offset The insertion position (UTF-16 offset), clamped to `[0, text.length]`.
   * @param s The text to insert.
   * @returns A new normalized block; the input is never mutated.
   */
  insertText(block: TextBlock, offset: number, s: string): TextBlock {
    const off = Math.max(0, Math.min(offset, block.text.length));
    const d = s.length;
    const text = block.text.slice(0, off) + s + block.text.slice(off);
    const marks = block.marks.map((m) => ({
      ...m,
      start: m.start >= off ? m.start + d : m.start,
      end: m.end > off ? m.end + d : m.end,
    }));
    return this.normalize({ ...block, text, marks });
  }

  /**
   * Deletes `[from, to)` and rebases/truncates the marks, then normalizes.
   * @param block The block to edit.
   * @param from Deletion start (UTF-16 offset, may be out of bounds or reversed).
   * @param to Deletion end (UTF-16 offset, may be out of bounds or reversed).
   * @returns A new normalized block; the input is never mutated.
   */
  deleteRange(block: TextBlock, from: number, to: number): TextBlock {
    const [lo, hi] = this.clampRange(from, to, block.text.length);
    const d = hi - lo;
    const text = block.text.slice(0, lo) + block.text.slice(hi);
    const shift = (x: number): number => (x <= lo ? x : x >= hi ? x - d : lo);
    const marks = block.marks.map((m) => ({ ...m, start: shift(m.start), end: shift(m.end) }));
    return this.normalize({ ...block, text, marks });
  }

  // --- Private helpers (interval algebra, pure) -------------------------------

  /** Canonical nesting order (D7), used to sort marks by `type`. */
  private static readonly TYPE_ORDER: Record<MarkType, number> = {
    bold: 0,
    italic: 1,
    underline: 2,
    color: 3,
    size: 4,
  };

  /**
   * Applies a "valued" mark (`color`/`size`): toggles it off when the same value already covers the
   * whole selection (§7.1); otherwise replaces it (any same-`type` mark on the range is removed
   * before adding, so values never stack — DD). Pure.
   * @param block The block to edit.
   * @param from Selection start (UTF-16 offset).
   * @param to Selection end (UTF-16 offset).
   * @param type The valued mark type (`'color'` | `'size'`).
   * @param value The value to apply.
   * @returns A new normalized block; the input is never mutated.
   */
  private setValueMark(
    block: TextBlock,
    from: number,
    to: number,
    type: 'color' | 'size',
    value: string,
  ): TextBlock {
    return this.editInline(block, from, to, (lo, hi) =>
      this.isMarkActive(block, lo, hi, type, value)
        ? this.cutMarks(block.marks, lo, hi, (m) => m.type === type && m.value === value) // toggle off
        : [
            ...this.cutMarks(block.marks, lo, hi, (m) => m.type === type), // replacement (DD)
            this.makeMark(type, lo, hi, value),
          ],
    );
  }

  /**
   * Shared scaffolding for inline commands: clamps `[from, to)` to the block, returns the block
   * normalized as-is when the range is empty/collapsed, otherwise applies `computeMarks(lo, hi)`
   * and normalizes the result. Pure.
   * @param block The block to edit.
   * @param from Selection start (UTF-16 offset, may be out of bounds or reversed).
   * @param to Selection end (UTF-16 offset, may be out of bounds or reversed).
   * @param computeMarks Builds the new mark list from the clamped, ordered bounds.
   * @returns A new normalized block; the input is never mutated.
   */
  private editInline(
    block: TextBlock,
    from: number,
    to: number,
    computeMarks: (lo: number, hi: number) => Mark[],
  ): TextBlock {
    const [lo, hi] = this.clampRange(from, to, block.text.length);
    if (lo >= hi) return this.normalize(block);
    return this.normalize({ ...block, marks: computeMarks(lo, hi) });
  }

  /**
   * Finds the index of the block bearing `id` in the document.
   * @param model The document to search.
   * @param id The block id to locate.
   * @returns The block's index, or -1 when it is absent. Pure.
   */
  private blockIndex(model: DocModel, id: string): number {
    return model.findIndex((b) => b.id === id);
  }

  /**
   * Intersects each mark with `[lo, hi)` then shifts it by `-shift`; empty intersections are dropped.
   * @param marks The marks to clip.
   * @param lo Intersection lower bound (inclusive).
   * @param hi Intersection upper bound (exclusive).
   * @param shift Amount subtracted from the surviving marks' offsets (to rebase them).
   * @returns The clipped, rebased marks. Pure.
   */
  private intersectShift(marks: Mark[], lo: number, hi: number, shift: number): Mark[] {
    const out: Mark[] = [];
    for (const m of marks) {
      const start = Math.max(m.start, lo);
      const end = Math.min(m.end, hi);
      if (start < end) out.push({ ...m, start: start - shift, end: end - shift });
    }
    return out;
  }

  /**
   * Clamps `[from, to)` into `[0, len]` and reorders it into `[lo, hi]`.
   * @param from Raw start offset (may be out of bounds or greater than `to`).
   * @param to Raw end offset (may be out of bounds or less than `from`).
   * @param len The block text length (upper bound).
   * @returns The ordered, in-bounds `[lo, hi]` pair.
   */
  private clampRange(from: number, to: number, len: number): [number, number] {
    const lo = Math.max(0, Math.min(from, to, len));
    const hi = Math.min(len, Math.max(from, to, 0));
    return [lo, hi];
  }

  /**
   * Subtracts the interval `[lo, hi)` from every mark for which `shouldCut` is true (other marks are
   * kept as-is). A run that overflows the interval is split into its left/right portions. Pure.
   * @param marks The marks to cut.
   * @param lo Cut lower bound (inclusive).
   * @param hi Cut upper bound (exclusive).
   * @param shouldCut Predicate selecting which marks the cut applies to.
   * @returns The resulting marks, with the selected runs trimmed around the cut.
   */
  private cutMarks(marks: Mark[], lo: number, hi: number, shouldCut: (m: Mark) => boolean): Mark[] {
    const out: Mark[] = [];
    for (const m of marks) {
      if (!shouldCut(m)) {
        out.push(m);
        continue;
      }
      const leftEnd = Math.min(m.end, lo);
      if (m.start < leftEnd) out.push({ ...m, end: leftEnd }); // portion before the cut
      const rightStart = Math.max(m.start, hi);
      if (rightStart < m.end) out.push({ ...m, start: rightStart }); // portion after the cut
    }
    return out;
  }

  /**
   * Sort rank of a mark `type` (canonical nesting order D7).
   * @param type The mark type.
   * @returns Its position in the nesting order.
   */
  private typeRank(type: MarkType): number {
    return DocumentModelService.TYPE_ORDER[type];
  }

  /**
   * Compares two mark `value`s: `undefined` sorts before any defined value, then ASCII order.
   * @param a First value (or `undefined`).
   * @param b Second value (or `undefined`).
   * @returns A negative/zero/positive number, deterministically ordering `a` relative to `b`.
   */
  private cmpValue(a: string | undefined, b: string | undefined): number {
    if (a === b) return 0;
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    return a < b ? -1 : 1;
  }

  /**
   * Builds a clean mark, omitting `value` when absent so equality stays stable.
   * @param type The mark type.
   * @param start Start offset (inclusive).
   * @param end End offset (exclusive).
   * @param value Optional mark value.
   * @returns A fresh `Mark` with `value` present only when defined.
   */
  private makeMark(type: MarkType, start: number, end: number, value?: string): Mark {
    return value === undefined ? { type, start, end } : { type, start, end, value };
  }

  /**
   * Canonical form of a list of marks over a text of length `len` (D6/§4.4): clamp to `[0, len]`,
   * drop null marks, merge same-`type`+`value` runs that touch or overlap (never across a gap), and
   * sort `(type, value, start)`. Pure.
   * @param marks The raw marks to canonicalize.
   * @param len The block text length (clamping upper bound).
   * @returns A new, canonical mark list.
   */
  private canonicalMarks(marks: Mark[], len: number): Mark[] {
    // 1. Clamp to [0, len] then drop null marks (start >= end).
    const clamped = marks
      .map((m) => ({
        type: m.type,
        value: m.value,
        start: Math.max(0, Math.min(m.start, len)),
        end: Math.max(0, Math.min(m.end, len)),
      }))
      .filter((m) => m.start < m.end);

    // 2. Merge touching/overlapping runs group by group (type + value).
    const groups = new Map<string, Mark[]>();
    for (const m of clamped) {
      const key = `${m.type}:${m.value ?? ''}`;
      const group = groups.get(key);
      if (group) group.push(m);
      else groups.set(key, [m]);
    }

    const merged: Mark[] = [];
    for (const group of groups.values()) {
      group.sort((a, b) => a.start - b.start);
      let cur = { ...group[0] };
      for (let i = 1; i < group.length; i++) {
        const next = group[i];
        if (next.start <= cur.end) {
          cur.end = Math.max(cur.end, next.end); // touches or overlaps → merge
        } else {
          merged.push(cur); // gap → new run
          cur = { ...next };
        }
      }
      merged.push(cur);
    }

    // 3. Sort (type, value, start) and rebuild clean marks.
    merged.sort(
      (a: Mark, b: Mark) =>
        this.typeRank(a.type) - this.typeRank(b.type) ||
        this.cmpValue(a.value, b.value) ||
        a.start - b.start,
    );
    return merged.map((m) => this.makeMark(m.type, m.start, m.end, m.value));
  }
}
