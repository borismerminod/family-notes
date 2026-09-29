/**
 * @file document.model.ts
 * @description Canonical JSON document model — the source of truth for a note's content.
 *
 * Decided on 2026-09-15 (see .agent/PLAN_MODELE_DOCUMENT_JSON.md, option C). **Replaces** the
 * "HTML as source of truth" approach: a note's content is no longer HTML, but a flat,
 * serializable array of blocks, stored as-is (`JSON.stringify`) in `notes.content`. The
 * `contenteditable` becomes a mere screen (rendering the model + capturing input); its DOM is
 * never read back as truth.
 *
 * This file holds ONLY types and guards (no logic):
 *  - canonical normalization and the commands live in `document-model.ts` (pure);
 *  - model → HTML rendering in `document-render.ts`;
 *  - HTML → model parsing in `document-parse.ts`.
 *
 * Reconciles and extends `note-block.model.ts`: `id` and media blocks are kept, but the **inline
 * HTML** (`content: string`) is **replaced** by a `text` (plain text) + `marks` (interval-based
 * formatting) pair. See §3 and §4 of the plan.
 */

/**
 * Inline formatting mark, expressed as a **half-open interval** `[start, end)` over the block's
 * plain text.
 *
 * - Offsets in **UTF-16 units** (D5): aligned with the `Selection`/`Range` API and with JS
 *   `string` indexing, hence composable without conversion.
 * - Marks are **flat intervals, never nested** (D4): one formatting = a set of intervals; tag
 *   nesting is *computed at render time* (canonical order D7), never stored. This is what makes
 *   adding and removing symmetric (interval union / subtraction).
 */
export interface Mark {
  type: MarkType;
  /** Inclusive start bound, as a UTF-16 offset. */
  start: number;
  /** Exclusive end bound, as a UTF-16 offset. */
  end: number;
  /**
   * Value carried by the mark:
   *  - `'color'`: hex color `#rrggbb`;
   *  - `'size'` : `'small'` | `'large'`;
   *  - `'link'` : the target `http(s)` URL;
   *  - absent for `'bold'` / `'italic'` / `'underline'`.
   */
  value?: string;
}

/** Supported inline mark types. */
export type MarkType = 'bold' | 'italic' | 'underline' | 'color' | 'size' | 'link';

/** Allowed values for a `size` mark (the "normal" size = absence of a mark). */
export type MarkSize = 'small' | 'large';

/** Field common to every block: a unique identifier (UUID), a CRDT prerequisite. */
export interface BaseBlock {
  /** Unique block identifier (UUID) — set up-front for CRDT sync. */
  id: string;
}

/**
 * `kind` of a text block. The heading "size" is folded into the `kind` (D8):
 *  - `h1` / `h2` are blocks (structural level), not inline marks;
 *  - `small` / `large` stay inline marks (`size`); `normal` = their absence.
 * A list item (`bullet` / `numbered`) is a flat block (D9); the `<ul>`/`<ol>` is rebuilt at
 * render time from consecutive blocks of the same type.
 */
export type TextBlockKind = 'text' | 'h1' | 'h2' | 'bullet' | 'numbered';

/**
 * Text block: paragraph, heading or list item. Carries the **plain text** (no tag, no `\n` — a
 * hard line break = two blocks, D3/§4.1) and its **marks** in canonical form once `normalize`
 * has been applied (D6).
 */
export interface TextBlock extends BaseBlock {
  kind: TextBlockKind;
  /** The block's plain text — no tag, no line break. */
  text: string;
  /** Inline formatting marks. Canonical after `normalize` (sorted, merged, bounded). */
  marks: Mark[];
}

/** Atomic image block (void, D10): no text, no mark. `src` = local path. */
export interface ImageBlock extends BaseBlock {
  kind: 'image';
  src: string;
}

/**
 * Atomic video block (void, D10): either an external link (`url`), or a local file (`src`,
 * a Capacitor Filesystem path).
 */
export interface VideoBlock extends BaseBlock {
  kind: 'video';
  url?: string;
  src?: string;
}

/** Discriminated union (on `kind`) of all of a note's blocks. */
export type NoteBlock = TextBlock | ImageBlock | VideoBlock;

/** The whole document: a flat array of blocks (D2). */
export type DocModel = NoteBlock[];

// --- Type guards ----------------------------------------------------------------
// Useful for dynamic rendering and selection mapping (Phase 3).

/** The `kind`s that correspond to a text block (carrying `text` + `marks`). */
const TEXT_BLOCK_KINDS: readonly TextBlockKind[] = ['text', 'h1', 'h2', 'bullet', 'numbered'];

/** True when the block is textual (paragraph, heading or list item). */
export function isTextBlock(block: NoteBlock): block is TextBlock {
  return (TEXT_BLOCK_KINDS as readonly string[]).includes(block.kind);
}

/** True when the block is an image. */
export function isImageBlock(block: NoteBlock): block is ImageBlock {
  return block.kind === 'image';
}

/** True when the block is a video. */
export function isVideoBlock(block: NoteBlock): block is VideoBlock {
  return block.kind === 'video';
}

/** True when the block is atomic (void media): the selection treats it as a whole (D10). */
export function isVoidBlock(block: NoteBlock): block is ImageBlock | VideoBlock {
  return isImageBlock(block) || isVideoBlock(block);
}
