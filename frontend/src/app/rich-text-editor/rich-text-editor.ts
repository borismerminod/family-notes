import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BlockSize, NOTE_COLOR_PALETTE } from '../core/models';
import {
  DocModel,
  isTextBlock,
  NoteBlock,
  TextBlock,
} from '../core/models/document.model';
import { DocumentModelService } from '../core/services/document-model';
import { DocumentRenderService } from '../core/services/document-render';
import { DocumentParseService } from '../core/services/document-parse';
import { DocumentSelectionService, ModelSelection } from '../core/services/document-selection';
import { EditHistory, HistoryEntry, TYPING_COALESCE_PAUSE_MS } from '../core/services/edit-history';
import { ExternalLinkService } from '../core/services/external-link';
import { sanitizeHttpUrl } from '../core/services/url-sanitize';

/** Highlight state of the toolbar buttons for the current selection. */
interface ActiveState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  bullet: boolean;
  numbered: boolean;
  color: string;
  size: BlockSize;
}

/** Neutral highlight state: nothing active, used when the selection carries no formatting. */
const NEUTRAL: ActiveState = {
  bold: false,
  italic: false,
  underline: false,
  bullet: false,
  numbered: false,
  color: '',
  size: 'normal',
};

/** A single-block selection resolved to model positions, with ordered offsets (`from` <= `to`). */
interface SelectedRange {
  blockId: string;
  from: number;
  to: number;
}

/**
 * Rich-text editor built on top of the **JSON document model** (Phase 3, see
 * .agent/PLAN_MODELE_DOCUMENT_JSON.md §6). The **source of truth is the `blocks` array**; the
 * `contenteditable` is only a screen: it is rendered from the model (`document-render`, tagging each
 * block with `data-block-id`), the selection is read/written through `document-selection`, and every
 * toolbar command goes through the **pure** `document-model` service, then re-renders and **restores
 * the selection**.
 *
 * Phase 3 scope: rendering, toolbar (marks / colour / size / headings / lists), highlighting,
 * selection restoration (single block), media insertion. Fine-grained typing (Enter, Backspace
 * merge, IME) belongs to Phase 4; here `onInput` simply re-derives the model from the DOM (the
 * `data-block-id` attributes preserve block identity) without re-rendering, so typing is not lost
 * and the caret does not jump.
 */
@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rich-text-editor.html',
  styleUrl: './rich-text-editor.css',
})
export class RichTextEditor {
  /** Pure document algebra: normalisation and interval-based inline/block edit commands. */
  private readonly docModel = inject(DocumentModelService);
  /** Renders the model to HTML (with `data-block-id`) for the contenteditable screen. */
  private readonly renderer = inject(DocumentRenderService);
  /** Parses (and sanitises) HTML back into a block model, used on input and paste. */
  private readonly parser = inject(DocumentParseService);
  /** Maps the DOM selection to model positions and restores it after a re-render. */
  private readonly selection = inject(DocumentSelectionService);
  /** Opens a link's URL outside the app (native browser or web fallback) on tap (§E). */
  private readonly linkOpener = inject(ExternalLinkService);

  /** Incoming blocks: the source of truth pushed by the parent component. */
  readonly blocks = input<NoteBlock[]>([]);
  /** Emits the current blocks after every command or keystroke. */
  readonly blocksChange = output<NoteBlock[]>();

  /** Reference to the contenteditable editing area. */
  private readonly editorRef = viewChild<ElementRef<HTMLElement>>('editor');

  /** Current model: the internal source of truth mirrored into the DOM. */
  private readonly model = signal<DocModel>([]);

  // --- Undo/Redo wiring (Lots B/C) -------------------------------------------
  // The undo/redo logic is fully implemented below: `commit` -> `history.push`, `onInput` ->
  // `history.recordTyping`, `applyEntry` (undo/redo replay without re-push), `syncButtons` and the
  // inactivity pause timer. The initial history step is seeded EAGERLY by the constructor effect on
  // every real (re)load of a note (Lot C), so `commit`/`onInput` always stack on a seeded history.

  /** Pure undo/redo history owned by this editor (C1: one instance per editor). */
  private readonly history = new EditHistory();

  /**
   * Cancel handle of the currently armed inactivity seal timer (Q2/DB7), or `null` when none is
   * pending. Re-arming a keystroke cancels the previous one; the `DestroyRef` cancels it on teardown
   * (TB6.3). The wrapper also neutralises the timer callback so a stale expiry after cancel/destroy
   * is an inert no-op (never touches a destroyed component).
   */
  private cancelSeal: (() => void) | null = null;

  /**
   * Injectable clock seam (Q2/DB3): the component reads "now" through this function so tests can
   * feed deterministic timestamps for coalescing. Defaults to `Date.now`.
   */
  now: () => number = () => Date.now();

  /**
   * Injectable pause-timer scheduler seam (Q2/DB7): schedules the inactivity `seal()` and returns a
   * cancel function (registered in `DestroyRef` at implementation time). Tests override it to drive
   * the pause deterministically and to observe cleanup on destroy. Defaults to `setTimeout`.
   */
  scheduleSeal: (cb: () => void, ms: number) => () => void = (cb, ms) => {
    const id = setTimeout(cb, ms);
    return () => clearTimeout(id);
  };

  /** Public signal: true when a past step exists (drives the `.btn-undo` in Lot D). */
  readonly canUndo = signal(false);
  /** Public signal: true when a future step exists (drives the `.btn-redo` in Lot D). */
  readonly canRedo = signal(false);

  /**
   * Undoes the last step: pops the previous entry from the pure history and re-applies it through
   * `applyEntry` (re-render + `setSelection` + `blocksChange.emit`) **without re-pushing** (US5,
   * anti-loop), then refreshes the button signals. No-op when there is no past step.
   */
  undo(): void {
    // Cancel any pending inactivity seal timer (C6/R5): `history.undo()` already seals the open run,
    // so a later expiry would only re-seal (no-op) and re-sync the same button state. Cancelling it
    // is behaviour-identical and avoids a redundant deferred callback.
    this.cancelSeal?.();
    const entry = this.history.undo();
    if (entry) this.applyEntry(entry);
    this.syncButtons();
  }

  /**
   * Redoes the last undone step: pops the next entry from the pure history and re-applies it through
   * `applyEntry` (re-render + `setSelection` + `blocksChange.emit`) **without re-pushing** (US3/US5),
   * then refreshes the button signals. No-op when there is no future step (e.g. after a new command
   * purged it — US4).
   */
  redo(): void {
    // Cancel any pending inactivity seal timer (C6/R5): symmetric to `undo()`; a stale expiry would
    // only re-seal (no-op) and re-sync unchanged buttons. Behaviour-identical, no deferred callback.
    this.cancelSeal?.();
    const entry = this.history.redo();
    if (entry) this.applyEntry(entry);
    this.syncButtons();
  }

  /**
   * Re-applies a history entry using the **same cycle as `commit`** — paint, restore the selection,
   * emit `blocksChange` and refresh the toolbar highlight — but **without** `history.push` (US5): the
   * ré-application must not create a parasitic step (anti-loop). A `null` selection repaints without
   * restoring the caret (left to the browser), which is acceptable per the approach.
   * @param entry The `{model, selection}` step to restore into the editor.
   */
  private applyEntry(entry: HistoryEntry): void {
    this.model.set(entry.model);
    const editor = this.editorEl();
    if (!editor) return;
    this.paint(editor, entry.model);
    if (entry.selection) {
      this.selection.setSelection(editor, entry.selection.from, entry.selection.to);
    }
    this.blocksChange.emit(entry.model);
    this.refreshActive();
  }

  /** Text-colour palette exposed to the toolbar swatches. */
  readonly palette = NOTE_COLOR_PALETTE;

  /** Size/heading options rendered as toolbar buttons (inline sizes plus H1/H2). */
  readonly sizes: ReadonlyArray<{ size: BlockSize; label: string; title: string }> = [
    { size: 'small', label: 'A−', title: 'Petite' },
    { size: 'normal', label: 'A', title: 'Normale' },
    { size: 'large', label: 'A+', title: 'Grande' },
    { size: 'h2', label: 'H2', title: 'Titre 2' },
    { size: 'h1', label: 'H1', title: 'Titre 1' },
  ];

  /** Highlight state driving the `.active` class of each toolbar button. */
  readonly active = signal<ActiveState>({ ...NEUTRAL });

  // --- Media popups ----------------------------------------------------------
  /** Visibility of the image-insertion popup. */
  readonly imagePopupOpen = signal(false);
  /** URL typed into the image popup (two-way bound). */
  readonly imageUrl = signal('');
  /** Visibility of the video-insertion popup. */
  readonly videoPopupOpen = signal(false);
  /** URL typed into the video popup (two-way bound). */
  readonly videoUrl = signal('');
  /** Visibility of the link-insertion popup (§C). */
  readonly linkPopupOpen = signal(false);
  /** URL typed into the link popup (two-way bound). */
  readonly linkUrl = signal('');
  /** Label typed into the link popup — the text carrying the link (two-way bound). */
  readonly linkLabel = signal('');

  /**
   * Wires the reactive plumbing: mirrors incoming blocks into the model (re-rendering only when the
   * editor is not focused, to avoid caret jumps while typing) and keeps the toolbar highlight in
   * sync with the document selection until the component is destroyed.
   */
  constructor() {
    // Incoming blocks -> model + render (skipped while focused: caret-jump guard during typing).
    // Undo/Redo (Lot C): guards the history against the echo of our own `blocksChange.emit` and
    // resets it on a real (re)load of a note (C4/DC1–DC3, DC7).
    effect(() => {
      const incoming = this.blocks();
      // Echo guard (C4/DC1): captured BEFORE `model.set`, else the comparison would always be true.
      // An echo is our own emit bouncing back into `blocks` (same reference as `model()`); a real
      // (re)load carries a different reference. Read via `untracked` so `model` is NOT a dependency
      // of this effect: otherwise `commit`'s `model.set` would re-run the effect and, with the input
      // `blocks` still holding the pre-command reference, spuriously reset+repaint the just-committed
      // change. The effect must re-run on `blocks()` changes only (R4: guard by reference).
      const isEcho = incoming === untracked(this.model);
      this.model.set(incoming);
      const editor = this.editorEl();
      if (editor && document.activeElement !== editor) {
        this.paint(editor, incoming);
      }
      if (!isEcho) {
        // Real (re)load of a note (US6, D7, DC3): drop the previous note's history. Cancel any
        // pending seal timer first (DC7/Q3-mineur) so a burst from the OLD note is never sealed, then
        // reset on the reloaded content — this eager seed is the note's clean initial step, so the
        // first `commit`/`onInput` stacks on it directly. Both buttons go inactive (US2/US4/US6).
        this.cancelSeal?.();
        this.history.reset({ model: incoming, selection: null });
        this.syncButtons();
      }
    });

    const onSelectionChange = () => this.refreshActive();
    document.addEventListener('selectionchange', onSelectionChange);
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() =>
      document.removeEventListener('selectionchange', onSelectionChange),
    );
    // Undo/Redo (Lot B, DB7): cancel any pending inactivity seal timer so a late expiry never seals
    // (nor syncs) a destroyed component — covers TB6.3.
    destroyRef.onDestroy(() => this.cancelSeal?.());
  }

  /**
   * Handles free typing: re-derives the model from the DOM (the `data-block-id` attributes keep
   * block identity) and emits it, **without** re-rendering so the caret does not jump. Structural
   * typing (Enter / Backspace) is handled separately in Phase 4.
   */
  onInput(event?: Event): void {
    const editor = this.editorEl();
    if (!editor) return;
    const model = this.parser.parse(editor.innerHTML);
    this.model.set(model);
    this.blocksChange.emit(model);
    // Undo/Redo (Lot B): free typing feeds the history WITHOUT repainting (R2: no caret jump). The
    // starting state is already seeded eagerly by the constructor effect (Lot C), so the burst simply
    // records onto that clean initial step — undoing the whole burst restores the note as opened.
    const selection = this.selection.domToModel(editor);
    const isBoundary = this.isBoundaryData((event as InputEvent | undefined)?.data);
    this.history.recordTyping({ model, selection }, this.now(), isBoundary);
    this.armPauseTimer();
    this.syncButtons();
  }

  /**
   * (Re)arms the inactivity seal timer through the injectable `scheduleSeal` seam (Q2): cancels any
   * pending one, then schedules `history.seal()` + `syncButtons()` at `TYPING_COALESCE_PAUSE_MS`. The
   * stored cancel neutralises the callback (`active` flag) so a stale expiry after re-arm or destroy
   * is a no-op (DB7/TB6.3).
   */
  private armPauseTimer(): void {
    this.cancelSeal?.();
    let active = true;
    const cancel = this.scheduleSeal(() => {
      if (!active) return;
      active = false;
      this.cancelSeal = null;
      this.history.seal();
      this.syncButtons();
    }, TYPING_COALESCE_PAUSE_MS);
    this.cancelSeal = () => {
      active = false;
      cancel();
    };
  }

  /**
   * Derives the word-boundary flag (C3) from an `InputEvent.data`: the last inserted character being
   * whitespace or punctuation seals the current typing step. An absent/null `data` (e.g. the bare
   * `new Event('input')` of T6.1, or a deletion) is treated as a non-boundary keystroke.
   * @param data The inserted string carried by the input event, if any.
   */
  private isBoundaryData(data: string | null | undefined): boolean {
    if (!data) return false;
    const last = data[data.length - 1];
    return /[\s.,;:!?…()[\]{}«»"']/.test(last);
  }

  // --- Structural typing (Phase 4) -------------------------------------------

  /**
   * Handles structural keys: Enter splits the current block at the caret, Backspace at the start of
   * a block merges it with the previous one. Any other case falls through to the browser default
   * (and, for Backspace, to `onInput`).
   * @param event The keyboard event; its default is prevented only when a structural edit runs.
   */
  onKeydown(event: KeyboardEvent): void {
    const editor = this.editorEl();
    if (!editor) return;

    if (event.key === 'Enter' && !event.shiftKey) {
      const range = this.selectedRange(editor);
      if (!range) return; // multi-block -> browser default (deferred)
      event.preventDefault();
      this.splitAtSelection(range.blockId, range.from, range.to);
      return;
    }

    if (event.key === 'Backspace') {
      const range = this.selectedRange(editor);
      if (!range || range.from !== 0 || range.to !== 0) return; // not at head -> default + onInput
      const model = this.model();
      const idx = model.findIndex((b) => b.id === range.blockId);
      if (idx > 0 && isTextBlock(model[idx - 1]) && isTextBlock(model[idx])) {
        event.preventDefault();
        this.mergeWithPrevious(idx);
      }
    }
  }

  /**
   * Handles paste: parses (and sanitises) the clipboard, preferring HTML over plain text, and
   * inserts the resulting blocks after the current one. No-op when the clipboard yields no block.
   * @param event The paste event; its default is prevented only when blocks are actually inserted.
   */
  onPaste(event: ClipboardEvent): void {
    const editor = this.editorEl();
    if (!editor) return;
    const data = event.clipboardData;
    const html = data?.getData('text/html') ?? '';
    const source = html.trim() ? html : data?.getData('text/plain') ?? '';
    const pasted = this.parser.parse(source);
    if (pasted.length === 0) return;
    event.preventDefault();
    this.insertBlocksAtSelection(pasted);
  }

  /**
   * Splits block `blockId` at `from`, first deleting `[from, to)` when the selection is not
   * collapsed. The right-hand part receives a fresh id and the caret is placed at its start.
   * @param blockId Id of the block to split.
   * @param from Start offset of the selection (the split point once `[from, to)` is removed).
   * @param to End offset of the selection; equal to `from` when the caret is collapsed.
   */
  private splitAtSelection(blockId: string, from: number, to: number): void {
    const model = this.model();
    const idx = model.findIndex((b) => b.id === blockId);
    if (idx < 0 || !isTextBlock(model[idx])) return;

    const working =
      from === to
        ? model
        : model.map((b, i) => (i === idx ? this.docModel.deleteRange(b as TextBlock, from, to) : b));

    const newId = crypto.randomUUID();
    const newModel = this.docModel.splitBlock(working, blockId, from, () => newId);
    this.commit(newModel, { blockId: newId, from: 0, to: 0 });
  }

  /**
   * Merges the block at `idx` into the previous one, placing the caret at the junction.
   * @param idx Index of the block being merged into its predecessor.
   */
  private mergeWithPrevious(idx: number): void {
    const model = this.model();
    const prev = model[idx - 1] as TextBlock;
    const prevLen = prev.text.length;
    const newModel = this.docModel.mergeBlocks(model, prev.id, model[idx].id);
    this.commit(newModel, { blockId: prev.id, from: prevLen, to: prevLen });
  }

  /**
   * Inserts pasted blocks right after the caret's block, placing the caret at the end of the last
   * inserted block.
   * @param pasted The blocks parsed from the clipboard.
   */
  private insertBlocksAtSelection(pasted: NoteBlock[]): void {
    const editor = this.editorEl();
    if (!editor) return;
    const model = this.model();
    const idx = this.insertionIndex(editor, model);

    const newModel = [...model.slice(0, idx), ...pasted, ...model.slice(idx)];
    const lastPasted = pasted[pasted.length - 1];
    const caretOffset = isTextBlock(lastPasted) ? lastPasted.text.length : 0;
    this.commit(newModel, { blockId: lastPasted.id, from: caretOffset, to: caretOffset });
  }

  // --- Formatting actions ----------------------------------------------------

  /**
   * Toggles a boolean inline mark (bold / italic / underline) over the current selection.
   * @param mark The mark to toggle.
   */
  applyMark(mark: 'bold' | 'italic' | 'underline'): void {
    this.mutateSelectedBlock((block, from, to) => this.docModel.toggleMark(block, from, to, mark));
  }

  /**
   * Sets (or toggles off) a text colour over the current selection.
   * @param color Hex colour from the palette; re-applying the same colour clears it.
   */
  applyColor(color: string): void {
    this.mutateSelectedBlock((block, from, to) => this.docModel.setColor(block, from, to, color));
  }

  /**
   * Applies a size or heading to the current block/selection: `h1`/`h2` change the block kind,
   * `small`/`large` set an inline size mark, and `normal` clears the inline size and demotes a
   * heading back to a paragraph.
   * @param size The requested size or heading level.
   */
  applySize(size: BlockSize): void {
    this.mutateSelectedBlock((block, from, to) => {
      if (size === 'h1' || size === 'h2') {
        return { ...block, kind: size };
      }
      if (size === 'small' || size === 'large') {
        return this.docModel.setSize(block, from, to, size);
      }
      // 'normal': remove the inline size and demote a heading back to a paragraph.
      const cleared = this.docModel.clearSize(block, from, to);
      return cleared.kind === 'h1' || cleared.kind === 'h2' ? { ...cleared, kind: 'text' } : cleared;
    });
  }

  /**
   * Toggles the current block between a plain paragraph and a list item of the given style.
   * @param style The list style to toggle (bullet or numbered).
   */
  applyList(style: 'bullet' | 'numbered'): void {
    this.mutateSelectedBlock((block) => ({
      ...block,
      kind: block.kind === style ? 'text' : style,
    }));
  }

  /**
   * Applies a **pure** transformation to the block of the current selection (single block, Phase 3),
   * then re-renders and **restores the selection** at the same offsets. No-op when the selection is
   * unusable, spans several blocks, or is not inside a text block.
   * @param fn Pure block transform receiving the target block and the ordered `from`/`to` offsets.
   */
  private mutateSelectedBlock(fn: (block: TextBlock, from: number, to: number) => TextBlock): void {
    const editor = this.editorEl();
    if (!editor) return;
    const range = this.selectedRange(editor);
    if (!range) return; // multi-block deferred (Phase 3)

    const model = this.model();
    const idx = model.findIndex((b) => b.id === range.blockId);
    if (idx < 0) return;
    const block = model[idx];
    if (!isTextBlock(block)) return;

    const newModel = model.map((b, i) => (i === idx ? fn(block, range.from, range.to) : b));
    this.commit(newModel, { blockId: range.blockId, from: range.from, to: range.to });
  }

  /**
   * Commits a new model: stores it, re-renders the editor, restores the selection at `at`, emits the
   * change and refreshes the toolbar highlight.
   * @param newModel The model to become the new source of truth.
   * @param at The single-block range where the caret/selection should be restored after rendering.
   */
  private commit(newModel: DocModel, at: SelectedRange): void {
    this.model.set(newModel);
    const editor = this.editorEl();
    if (!editor) return;
    this.paint(editor, newModel);
    this.selection.setSelection(editor, { blockId: at.blockId, offset: at.from }, { blockId: at.blockId, offset: at.to });
    // Undo/Redo (Lot B): `commit` is the single push point of the history. The note's initial step is
    // already seeded eagerly by the constructor effect (Lot C), so we push the resulting state onto
    // that clean seed — undoing this action returns the note as opened.
    this.history.push({ model: newModel, selection: this.toSelection(at) });
    this.blocksChange.emit(newModel);
    this.refreshActive();
    this.syncButtons();
  }

  /**
   * Copies the pure history's `canUndo`/`canRedo` state into the public signals after every history
   * mutation (commit, and undo/redo/typing in later groups). These signals drive the toolbar buttons
   * (`[disabled]`) added in Lot D.
   */
  private syncButtons(): void {
    this.canUndo.set(this.history.canUndo());
    this.canRedo.set(this.history.canRedo());
  }

  /**
   * Converts a single-block `SelectedRange` into the `ModelSelection` shape memorised by a history
   * step (DB6), so `undo`/`redo` can restore the exact caret/selection (Lot B, groups 3–4).
   * @param range The single-block range committed with the step.
   */
  private toSelection(range: SelectedRange): ModelSelection {
    return {
      from: { blockId: range.blockId, offset: range.from },
      to: { blockId: range.blockId, offset: range.to },
    };
  }

  /**
   * Recomputes the toolbar highlight from the model and the current selection, falling back to the
   * neutral state when the selection is unusable or not inside a text block.
   */
  private refreshActive(): void {
    const editor = this.editorEl();
    const range = editor ? this.selectedRange(editor) : null;
    if (!range) {
      this.active.set({ ...NEUTRAL });
      return;
    }
    const block = this.model().find((b) => b.id === range.blockId);
    if (!block || !isTextBlock(block)) {
      this.active.set({ ...NEUTRAL });
      return;
    }
    const { from, to } = range;
    this.active.set({
      bold: this.docModel.isMarkActive(block, from, to, 'bold'),
      italic: this.docModel.isMarkActive(block, from, to, 'italic'),
      underline: this.docModel.isMarkActive(block, from, to, 'underline'),
      bullet: block.kind === 'bullet',
      numbered: block.kind === 'numbered',
      color: this.activeColor(block, from, to),
      size: this.activeSize(block, from, to),
    });
  }

  /**
   * Finds the active text colour of a selection.
   * @param block The text block under the selection.
   * @param from Start offset of the selection.
   * @param to End offset of the selection.
   * @returns The first palette colour fully covering the selection, or `''` when none does.
   */
  private activeColor(block: TextBlock, from: number, to: number): string {
    return this.palette.find((c) => this.docModel.isMarkActive(block, from, to, 'color', c)) ?? '';
  }

  /**
   * Resolves the active size of a selection: a heading `kind` wins, then an inline `size` mark,
   * otherwise `normal`.
   * @param block The text block under the selection.
   * @param from Start offset of the selection.
   * @param to End offset of the selection.
   * @returns The size to highlight in the toolbar.
   */
  private activeSize(block: TextBlock, from: number, to: number): BlockSize {
    if (block.kind === 'h1' || block.kind === 'h2') return block.kind;
    if (this.docModel.isMarkActive(block, from, to, 'size', 'large')) return 'large';
    if (this.docModel.isMarkActive(block, from, to, 'size', 'small')) return 'small';
    return 'normal';
  }

  // --- Media insertion -------------------------------------------------------

  /** Opens the image-insertion popup. */
  openImagePopup(): void {
    this.imagePopupOpen.set(true);
  }
  /** Closes the image-insertion popup and clears its URL field. */
  closeImagePopup(): void {
    this.imagePopupOpen.set(false);
    this.imageUrl.set('');
  }

  /** Inserts an image block from the URL typed in the popup, then closes it. No-op when empty. */
  insertImageFromUrl(): void {
    const url = this.imageUrl().trim();
    if (!url) return;
    this.insertBlock({ id: '', kind: 'image', src: url });
    this.closeImagePopup();
  }

  /**
   * Inserts an image block from a local file, reading it as a data URL, then closes the popup.
   * @param event The file input change event carrying the selected image.
   */
  onImageFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.insertBlock({ id: '', kind: 'image', src: String(reader.result) });
      this.closeImagePopup();
    };
    reader.readAsDataURL(file);
  }

  /** Opens the video-insertion popup. */
  openVideoPopup(): void {
    this.videoPopupOpen.set(true);
  }
  /** Closes the video-insertion popup and clears its URL field. */
  closeVideoPopup(): void {
    this.videoPopupOpen.set(false);
    this.videoUrl.set('');
  }

  /** Inserts a video block from the URL typed in the popup (normalised to an embed URL). */
  insertVideoFromUrl(): void {
    const url = this.videoUrl().trim();
    if (!url) return;
    this.insertBlock({ id: '', kind: 'video', url: this.toEmbedUrl(url) });
    this.closeVideoPopup();
  }

  // --- Link insertion (§C/§D) ------------------------------------------------

  /** Opens the link-insertion popup (§C). */
  openLinkPopup(): void {
    this.linkPopupOpen.set(true);
  }
  /** Closes the link-insertion popup and clears both fields (§C, US1). */
  closeLinkPopup(): void {
    this.linkPopupOpen.set(false);
    this.linkUrl.set('');
    this.linkLabel.set('');
  }

  /**
   * Inserts the label carrying a `link` mark at the caret from the popup fields (§D, DL7): sanitises
   * the URL (no-op when empty/rejected), falls back to the URL as label when empty, replaces any
   * non-collapsed selection, and places the caret **after** the link (excluded bound → the next
   * keystroke does not inherit the link). With no caret in a text block (media selected, empty doc,
   * multi-block), inserts a **new text block** carrying the link at the insertion index. Then closes.
   */
  insertLinkFromUrl(): void {
    const url = sanitizeHttpUrl(this.linkUrl());
    if (!url) return; // no-op: empty or rejected scheme (US2, DL7)
    const label = this.linkLabel().trim() || url; // fallback: label = URL (US2)

    const editor = this.editorEl();
    const range = editor ? this.selectedRange(editor) : null;
    const model = this.model();
    const idx = range ? model.findIndex((b) => b.id === range.blockId) : -1;

    if (range && idx >= 0 && isTextBlock(model[idx])) {
      const block = model[idx];
      const base =
        range.from === range.to ? block : this.docModel.deleteRange(block, range.from, range.to);
      const withText = this.docModel.insertText(base, range.from, label);
      const linked = this.docModel.setLink(withText, range.from, range.from + label.length, url);
      const newModel = model.map((b, i) => (i === idx ? linked : b));
      const end = range.from + label.length; // caret after the link (excluded bound)
      this.commit(newModel, { blockId: range.blockId, from: end, to: end });
    } else {
      // No caret in a text block → new text block carrying the link (consistent with media, DL7).
      const at = this.insertionIndex(editor, model);
      const id = crypto.randomUUID();
      const newBlock = this.docModel.normalize({
        id,
        kind: 'text',
        text: label,
        marks: [{ type: 'link', start: 0, end: label.length, value: url }],
      });
      const newModel = [...model.slice(0, at), newBlock, ...model.slice(at)];
      this.commit(newModel, { blockId: id, from: label.length, to: label.length });
    }

    this.closeLinkPopup();
  }

  /**
   * Intercepts a tap on a rendered link to open it externally (§E, DL9): when the click lands on
   * (or inside) an `<a href>`, prevents the anchor's native navigation and delegates to the external
   * opener — **always**, whether the editor has focus or not (assumed US5 gap). A click outside any
   * `<a>` falls through to normal editing.
   * @param event The click event on the editing area.
   */
  onEditorClick(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement | null)?.closest('a');
    const href = anchor?.getAttribute('href');
    if (anchor && href) {
      event.preventDefault();
      // Fire-and-forget, but adopt the (possibly undefined in tests) result to avoid an
      // unhandled rejection should the native open reject.
      Promise.resolve(this.linkOpener.open(href)).catch(() => undefined);
    }
  }

  /**
   * Converts a share link into an embeddable URL for YouTube / Vimeo.
   * @param url The pasted share or watch link.
   * @returns The provider embed URL, or the original `url` when no provider matches.
   */
  private toEmbedUrl(url: string): string {
    const youtube = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
    if (youtube) return `https://www.youtube.com/embed/${youtube[1]}`;
    const vimeo = url.match(/vimeo\.com\/(\d+)/);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    return url;
  }

  /**
   * Inserts a media block after the block of the current selection (or at the end of the document),
   * assigning it a fresh id. Unlike text edits, the selection is not restored afterwards.
   *
   * Deliberately does its own `model.set` + `paint` + `blocksChange.emit` **without** going through
   * `commit` and therefore **without** an `history.push`: image/video insertion is not undoable in
   * this version (known limitation **L2**, constat C3 / refactoring R1 — routing `insertBlock` through
   * the history is deferred to a later lot; cf. FEATURE_UNDO_REDO.md § Limitations connues). Link
   * insertion (`insertLinkFromUrl`) and paste (`insertBlocksAtSelection`) DO go through `commit` and
   * stay undoable.
   * @param block The media block to insert; its `id` is replaced with a fresh UUID.
   */
  private insertBlock(block: NoteBlock): void {
    const editor = this.editorEl();
    const model = this.model();
    const idx = this.insertionIndex(editor, model);

    const withId: NoteBlock = { ...block, id: crypto.randomUUID() };
    const newModel = [...model.slice(0, idx), withId, ...model.slice(idx)];
    this.model.set(newModel);
    if (editor) this.paint(editor, newModel);
    this.blocksChange.emit(newModel);
  }

  // --- DOM / selection helpers (internal) ------------------------------------

  /**
   * Returns the underlying contenteditable element.
   * @returns The editor element, or `null` when the view is not attached yet.
   */
  private editorEl(): HTMLElement | null {
    return this.editorRef()?.nativeElement ?? null;
  }

  /**
   * Renders the model into the editor, tagging each block with `data-block-id` so block identity
   * survives across re-renders and DOM re-derivation.
   * @param editor The contenteditable element to paint into.
   * @param model The model to render.
   */
  private paint(editor: HTMLElement, model: DocModel): void {
    editor.innerHTML = this.renderer.render(model, { withBlockIds: true });
  }

  /**
   * Reads the current selection as a single-block range with ordered offsets.
   * @param editor The contenteditable element holding the selection.
   * @returns The single-block range, or `null` when there is no usable selection or it spans several
   * blocks (multi-block cases are deferred in Phase 3).
   */
  private selectedRange(editor: HTMLElement): SelectedRange | null {
    const sel = this.selection.domToModel(editor);
    if (!sel || sel.from.blockId !== sel.to.blockId) return null;
    return {
      blockId: sel.from.blockId,
      from: Math.min(sel.from.offset, sel.to.offset),
      to: Math.max(sel.from.offset, sel.to.offset),
    };
  }

  /**
   * Computes where a new block should be inserted relative to the current selection.
   * @param editor The contenteditable element, or `null` when the view is not attached.
   * @param model The current model.
   * @returns The index just after the caret's block, or the document length when it is undetermined.
   */
  private insertionIndex(editor: HTMLElement | null, model: DocModel): number {
    const sel = editor ? this.selection.domToModel(editor) : null;
    const at = sel ? model.findIndex((b) => b.id === sel.to.blockId) : -1;
    return at >= 0 ? at + 1 : model.length;
  }
}
