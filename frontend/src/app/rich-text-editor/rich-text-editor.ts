import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
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
import { DocumentSelectionService } from '../core/services/document-selection';

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

  /** Incoming blocks: the source of truth pushed by the parent component. */
  readonly blocks = input<NoteBlock[]>([]);
  /** Emits the current blocks after every command or keystroke. */
  readonly blocksChange = output<NoteBlock[]>();

  /** Reference to the contenteditable editing area. */
  private readonly editorRef = viewChild<ElementRef<HTMLElement>>('editor');

  /** Current model: the internal source of truth mirrored into the DOM. */
  private readonly model = signal<DocModel>([]);

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

  /**
   * Wires the reactive plumbing: mirrors incoming blocks into the model (re-rendering only when the
   * editor is not focused, to avoid caret jumps while typing) and keeps the toolbar highlight in
   * sync with the document selection until the component is destroyed.
   */
  constructor() {
    // Incoming blocks -> model + render (skipped while focused: caret-jump guard during typing).
    effect(() => {
      const incoming = this.blocks();
      this.model.set(incoming);
      const editor = this.editorEl();
      if (editor && document.activeElement !== editor) {
        this.paint(editor, incoming);
      }
    });

    const onSelectionChange = () => this.refreshActive();
    document.addEventListener('selectionchange', onSelectionChange);
    inject(DestroyRef).onDestroy(() =>
      document.removeEventListener('selectionchange', onSelectionChange),
    );
  }

  /**
   * Handles free typing: re-derives the model from the DOM (the `data-block-id` attributes keep
   * block identity) and emits it, **without** re-rendering so the caret does not jump. Structural
   * typing (Enter / Backspace) is handled separately in Phase 4.
   */
  onInput(): void {
    const editor = this.editorEl();
    if (!editor) return;
    const model = this.parser.parse(editor.innerHTML);
    this.model.set(model);
    this.blocksChange.emit(model);
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
    this.blocksChange.emit(newModel);
    this.refreshActive();
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
