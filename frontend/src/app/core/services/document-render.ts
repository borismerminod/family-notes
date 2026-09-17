import { Injectable } from '@angular/core';
import {
  DocModel,
  ImageBlock,
  isImageBlock,
  isTextBlock,
  isVideoBlock,
  Mark,
  MarkType,
  NoteBlock,
  TextBlock,
  TextBlockKind,
  VideoBlock,
} from '../models/document.model';
import { DocumentModelService } from './document-model';

/**
 * @file document-render.ts
 * @description **Pure** rendering of the JSON document model into canonical HTML (model → HTML).
 *
 * Applies the "re-slicing" algorithm from §4.3 (PLAN_MODELE_DOCUMENT_JSON.md): inline marks stored
 * as flat intervals are turned into nested tags, in the canonical nesting order D7. Blocks are
 * wrapped according to their `kind` (D8) and consecutive list items grouped into `<ul>`/`<ol>`
 * (D9). Media is rendered plainly (D10).
 *
 * Output is **canonical** (deterministic, without `data-block-id`) → the basis for a stable
 * round-trip with the upcoming `document-parse.ts`. Each block is normalized through
 * `DocumentModelService` before rendering, so contiguous runs merge into a single tag.
 *
 * Built with TDD group by group (see .agent/PLAN_TESTS_DOCUMENT_RENDER.md); the
 * `document-render.spec.ts` suite is green.
 */
@Injectable({ providedIn: 'root' })
export class DocumentRenderService {
  /** Pure model service used to normalize each block before it is rendered. */
  constructor(private readonly docModel: DocumentModelService) {}

  /**
   * Renders the whole document to HTML: each block rendered then concatenated without separator.
   * Consecutive list items of the same type are grouped into a single `<ul>`/`<ol>` (D9).
   * @param model The document to render, as a flat array of blocks.
   * @param options `withBlockIds` adds a `data-block-id` attribute on every block tag (anchors for
   *   the editor's selection mapping, Phase 3); left off, the output stays **canonical** (no id).
   * @returns The concatenated HTML string for the document ('' for an empty model).
   */
  render(model: DocModel, options: { withBlockIds?: boolean } = {}): string {
    const withIds = options.withBlockIds === true;
    let html = '';
    let i = 0;
    while (i < model.length) {
      const block = model[i];
      const listKind = this.listKindOf(block);
      if (listKind) {
        // Group consecutive list blocks of the same type into a single <ul>/<ol> (D9).
        let items = '';
        while (i < model.length && this.listKindOf(model[i]) === listKind) {
          items += this.renderTextBlock(model[i] as TextBlock, withIds);
          i++;
        }
        html += this.wrapList(listKind, items);
      } else {
        html += this.renderBlock(block, withIds);
        i++;
      }
    }
    return html;
  }

  // --- Private helpers (pure) -------------------------------------------------

  /** Block tag by `kind` (D8/D9). List items are wrapped in `<li>`. */
  private static readonly TAG_BY_KIND: Record<TextBlockKind, string> = {
    text: 'p',
    h1: 'h1',
    h2: 'h2',
    bullet: 'li',
    numbered: 'li',
  };

  /** Canonical nesting order (D7) used to wrap the marks of a segment. */
  private static readonly TYPE_ORDER: Record<MarkType, number> = {
    bold: 0,
    italic: 1,
    underline: 2,
    color: 3,
    size: 4,
  };

  /**
   * Returns the list `kind` of a block, so consecutive items can be grouped.
   * @param block The block to inspect.
   * @returns `'bullet'`/`'numbered'` when the block is a list item, otherwise `null`.
   */
  private listKindOf(block: NoteBlock): 'bullet' | 'numbered' | null {
    if (isTextBlock(block) && (block.kind === 'bullet' || block.kind === 'numbered')) {
      return block.kind;
    }
    return null;
  }

  /**
   * Wraps the already-rendered `<li>` items in their list container (D9).
   * @param listKind The list type driving the container tag.
   * @param items The concatenated `<li>` HTML of the group.
   * @returns The items wrapped in `<ul>` (bullet) or `<ol>` (numbered).
   */
  private wrapList(listKind: 'bullet' | 'numbered', items: string): string {
    const tag = listKind === 'bullet' ? 'ul' : 'ol';
    return `<${tag}>${items}</${tag}>`;
  }

  /**
   * Dispatches an arbitrary block to the media or text renderer based on its `kind`.
   * @param block The block to render.
   * @param withIds Whether to stamp a `data-block-id` on the block tag.
   * @returns The block's HTML.
   */
  private renderBlock(block: NoteBlock, withIds: boolean): string {
    if (isImageBlock(block)) return this.renderImage(block, withIds);
    if (isVideoBlock(block)) return this.renderVideo(block, withIds);
    return this.renderTextBlock(block, withIds);
  }

  /**
   * Renders an image block as `<img src>` (void block, D10).
   * @param block The image block to render.
   * @param withIds Whether to stamp a `data-block-id` on the tag.
   * @returns The `<img>` HTML with an escaped `src`.
   */
  private renderImage(block: ImageBlock, withIds: boolean): string {
    return `<img${this.blockIdAttr(block.id, withIds)} src="${this.escapeAttr(block.src)}">`;
  }

  /**
   * Renders a video block (void block, D10): an external `url` takes priority → `<iframe>`;
   * otherwise a local file (`src`) → `<video>`; otherwise nothing.
   * @param block The video block to render.
   * @param withIds Whether to stamp a `data-block-id` on the tag.
   * @returns The `<iframe>`/`<video>` HTML, or '' when neither `url` nor `src` is set.
   */
  private renderVideo(block: VideoBlock, withIds: boolean): string {
    const idAttr = this.blockIdAttr(block.id, withIds);
    if (block.url) return `<iframe${idAttr} src="${this.escapeAttr(block.url)}"></iframe>`;
    if (block.src) return `<video${idAttr} src="${this.escapeAttr(block.src)}"></video>`;
    return '';
  }

  /**
   * Renders a text block: normalization → inline rendering → block wrapping.
   * @param block The text block (paragraph, heading or list item) to render.
   * @param withIds Whether to stamp a `data-block-id` on the block tag.
   * @returns The block wrapped in the tag matching its `kind`, with inline formatting inside.
   */
  private renderTextBlock(block: TextBlock, withIds: boolean): string {
    const normalized = this.docModel.normalize(block);
    const inner = this.renderInline(normalized.text, normalized.marks);
    const tag = DocumentRenderService.TAG_BY_KIND[block.kind];
    return `<${tag}${this.blockIdAttr(block.id, withIds)}>${inner}</${tag}>`;
  }

  /**
   * Builds the optional `data-block-id` attribute for a block tag.
   * @param id The block id to expose.
   * @param withIds Whether the id should be emitted at all.
   * @returns ` data-block-id="<escaped id>"` when `withIds`, otherwise an empty string.
   */
  private blockIdAttr(id: string, withIds: boolean): string {
    return withIds ? ` data-block-id="${this.escapeAttr(id)}"` : '';
  }

  /**
   * "Re-slicing" algorithm §4.3: cuts the text at every mark boundary, then emits each segment
   * wrapped by its active marks in the canonical order D7.
   * @param text The block's plain text.
   * @param marks The block's normalized inline marks.
   * @returns The inline HTML for the text ('' for empty text).
   */
  private renderInline(text: string, marks: Mark[]): string {
    if (text.length === 0) return '';

    const bounds = new Set<number>([0, text.length]);
    for (const m of marks) {
      bounds.add(m.start);
      bounds.add(m.end);
    }
    const points = [...bounds].filter((x) => x >= 0 && x <= text.length).sort((a, b) => a - b);

    let out = '';
    for (let k = 0; k < points.length - 1; k++) {
      const a = points[k];
      const b = points[k + 1];
      if (a >= b) continue;
      const active = marks.filter((m) => m.start <= a && m.end >= b);
      out += this.wrap(this.escapeText(text.slice(a, b)), active);
    }
    return out;
  }

  /**
   * Wraps `inner` in the tags of the active marks, outermost → innermost (D7).
   * @param inner The already-escaped segment text.
   * @param active The marks covering the segment.
   * @returns The segment wrapped in its nested formatting tags.
   */
  private wrap(inner: string, active: Mark[]): string {
    const sorted = [...active].sort(
      (a, b) =>
        DocumentRenderService.TYPE_ORDER[a.type] - DocumentRenderService.TYPE_ORDER[b.type] ||
        (a.value ?? '').localeCompare(b.value ?? ''),
    );
    let html = inner;
    for (let k = sorted.length - 1; k >= 0; k--) {
      const [open, close] = this.tagFor(sorted[k]);
      html = open + html + close;
    }
    return html;
  }

  /**
   * Maps a mark to its HTML tag pair (DR-TAGS).
   * @param mark The mark to translate.
   * @returns The `[opening, closing]` tag pair; `color`/`size` carry an escaped inline style.
   */
  private tagFor(mark: Mark): [string, string] {
    switch (mark.type) {
      case 'bold':
        return ['<strong>', '</strong>'];
      case 'italic':
        return ['<em>', '</em>'];
      case 'underline':
        return ['<u>', '</u>'];
      case 'color':
        return [`<span style="color:${this.escapeAttr(mark.value ?? '')}">`, '</span>'];
      case 'size':
        return [`<span style="font-size:${this.escapeAttr(mark.value ?? '')}">`, '</span>'];
    }
  }

  /**
   * Escapes plain text for HTML content.
   * @param s The raw text.
   * @returns The text with `& < >` escaped.
   */
  private escapeText(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /**
   * Escapes a value for use inside a double-quoted HTML attribute.
   * @param s The raw attribute value.
   * @returns The value with `& < > "` escaped.
   */
  private escapeAttr(s: string): string {
    return this.escapeText(s).replace(/"/g, '&quot;');
  }
}
