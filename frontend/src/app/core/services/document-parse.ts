import { Injectable } from '@angular/core';
import { DocModel, Mark, MarkType, NoteBlock, TextBlockKind } from '../models/document.model';
import { DocumentModelService } from './document-model';
import { sanitizeHttpUrl } from './url-sanitize';

/** Scratch buffer accumulating a text block's plain text and marks during the walk. */
interface InlineAcc {
  text: string;
  marks: Mark[];
}

/** Mark descriptor (without offsets) carried by an inline tag. */
interface MarkDesc {
  type: MarkType;
  value?: string;
}

/**
 * @file document-parse.ts
 * @description Parsing **HTML → JSON document model** (inverse of `document-render.ts`, §4.6).
 *
 * Using `DOMParser`, walks the HTML tree: opens one block per block-level element (`p`/`div`/`h1`/
 * `h2`/`li`/`img`/`iframe`/`video`), accumulates the **plain text** and pushes a mark on each inline
 * tag **close** (current offsets), then normalizes. Two use cases:
 *   - **migrating** notes that may still be stored as HTML;
 *   - **sanitizing a paste** — only the whitelisted subset is kept (unknown tag unwrapped,
 *     `script`/`style` dropped) → security.
 *
 * **Canonical** output (normalized blocks, ids regenerated via `makeId`) → stable round-trip with
 * `document-render.ts`.
 *
 * Built test-first, group by group (see .agent/PLAN_TESTS_DOCUMENT_PARSE.md); the
 * `document-parse.spec.ts` suite is green (38/38), round-trip `parse(render(m)) == m` included.
 */
@Injectable({ providedIn: 'root' })
export class DocumentParseService {
  /** Pure model helper providing block normalization (marks sorted, merged, bounded). */
  constructor(private readonly docModel: DocumentModelService) {}

  /**
   * Parses `html` into the document model.
   * @param html The HTML string to parse (a stored note or a pasted fragment).
   * @param makeId Factory assigning each block's id when the source carries none (defaults to
   * `crypto.randomUUID`); a `data-block-id` on the element takes precedence (editor round-trip).
   * @returns The document as a flat, canonical array of blocks.
   */
  parse(html: string, makeId: () => string = () => crypto.randomUUID()): DocModel {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const blocks: NoteBlock[] = [];
    this.emitBlocks(doc.body, blocks, makeId);
    return blocks;
  }

  // --- Private helpers (pure, read-only over the detached DOM) -----------------

  /** Maps a block-level tag name to its text block `kind`; absent when it is not a text block. */
  private static readonly TEXT_BLOCK_TAG: Record<string, TextBlockKind> = {
    P: 'text',
    DIV: 'text',
    H1: 'h1',
    H2: 'h2',
  };

  /** Mark descriptor per inline tag name (synonyms included). `SPAN` is handled separately. */
  private static readonly MARK_TAG: Record<string, MarkDesc> = {
    STRONG: { type: 'bold' },
    B: { type: 'bold' },
    EM: { type: 'italic' },
    I: { type: 'italic' },
    U: { type: 'underline' },
  };

  /**
   * Walks the children of `container`: emits the blocks of each block-level node and accumulates the
   * "loose" (root-level) inline content in a buffer, flushed into a `text` block at every block
   * boundary and at the end of the walk (a whitespace-only buffer is ignored).
   * @param container The element whose child nodes are walked (the document body).
   * @param blocks Output array the produced blocks are appended to (mutated).
   * @param makeId Factory used to assign ids to blocks that carry no `data-block-id`.
   */
  private emitBlocks(container: Node, blocks: NoteBlock[], makeId: () => string): void {
    let buffer: InlineAcc | null = null;
    const flush = (): void => {
      if (buffer && this.hasInlineContent(buffer)) {
        blocks.push(this.finishTextBlock('text', buffer, makeId()));
      }
      buffer = null;
    };

    for (const node of Array.from(container.childNodes)) {
      const produced = this.blocksFor(node, makeId);
      if (produced) {
        flush();
        blocks.push(...produced);
      } else {
        // Inline node (text, known mark or unwrapped unknown tag) at root level → buffer.
        this.appendInline(node, (buffer ??= this.emptyAcc()));
      }
    }
    flush();
  }

  /**
   * Blocks produced by a block-level node, or `null` when the node is inline (to be buffered):
   * a list (`ul`/`ol`) yields one block per `li`; media (`img`/`iframe`/`video`) yields one block;
   * a text block tag yields one block.
   * @param node The node under inspection.
   * @param makeId Factory used to assign ids to the produced blocks.
   * @returns The produced blocks (possibly `[]` for an empty `<ul>`/`<ol>`), or `null` when the
   * node is inline and should be accumulated into the loose buffer instead.
   */
  private blocksFor(node: Node, makeId: () => string): NoteBlock[] | null {
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as HTMLElement;
    const tag = el.tagName;

    if (tag === 'UL' || tag === 'OL') {
      const kind: TextBlockKind = tag === 'UL' ? 'bullet' : 'numbered';
      return Array.from(el.children)
        .filter((li) => li.tagName === 'LI')
        .map((li) => this.finishTextBlock(kind, this.parseInline(li), this.idOf(li, makeId)));
    }

    const media = this.parseMedia(el, makeId);
    if (media) return [media];

    const textKind = DocumentParseService.TEXT_BLOCK_TAG[tag];
    if (textKind) {
      return [this.finishTextBlock(textKind, this.parseInline(el), this.idOf(el, makeId))];
    }

    return null; // inline element (script/style included) → unwrapped/dropped by appendInline
  }

  /**
   * Builds a fresh, empty inline accumulator.
   * @returns A new `InlineAcc` with empty text and no marks.
   */
  private emptyAcc(): InlineAcc {
    return { text: '', marks: [] };
  }

  /**
   * Tells whether a buffer holds content worth keeping.
   * @param acc The inline accumulator to test.
   * @returns True when the text is not whitespace-only or at least one mark is present.
   */
  private hasInlineContent(acc: InlineAcc): boolean {
    return acc.text.trim() !== '' || acc.marks.length > 0;
  }

  /**
   * Builds a media block from an element.
   * @param el The element under inspection.
   * @param makeId Factory used to assign the block id when no `data-block-id` is present.
   * @returns An image/video block for `img`/`iframe`/`video`, or `null` for any other tag.
   */
  private parseMedia(el: HTMLElement, makeId: () => string): NoteBlock | null {
    switch (el.tagName) {
      case 'IMG':
        return { id: this.idOf(el, makeId), kind: 'image', src: el.getAttribute('src') ?? '' };
      case 'IFRAME':
        return { id: this.idOf(el, makeId), kind: 'video', url: el.getAttribute('src') ?? '' };
      case 'VIDEO':
        return { id: this.idOf(el, makeId), kind: 'video', src: el.getAttribute('src') ?? '' };
      default:
        return null;
    }
  }

  /**
   * Resolves the id of a block from its element.
   * @param el The element the block is built from.
   * @param makeId Factory used when the element carries no `data-block-id`.
   * @returns The `data-block-id` attribute when present (editor round-trip), otherwise `makeId()`.
   */
  private idOf(el: Element, makeId: () => string): string {
    return el.getAttribute('data-block-id') || makeId();
  }

  /**
   * Extracts the inline content of a block-level element into an accumulator.
   * @param el The block-level element whose inline children are walked.
   * @returns The `{ text, marks }` gathered from the element's inline content.
   */
  private parseInline(el: Element): InlineAcc {
    const acc = this.emptyAcc();
    for (const child of Array.from(el.childNodes)) {
      this.appendInline(child, acc);
    }
    return acc;
  }

  /**
   * Accumulates an inline node into `acc`: text is concatenated, and a mark is pushed on the
   * **close** of a known tag (over the current offsets). An unknown tag is unwrapped (its text is
   * kept); `script`/`style` are dropped.
   * @param node The inline node to accumulate (text or element).
   * @param acc The accumulator being filled (mutated).
   */
  private appendInline(node: Node, acc: InlineAcc): void {
    if (node.nodeType === Node.TEXT_NODE) {
      acc.text += (node as Text).data;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = node as HTMLElement;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return;

    const start = acc.text.length;
    for (const child of Array.from(el.childNodes)) {
      this.appendInline(child, acc);
    }
    const end = acc.text.length;
    if (end > start) {
      for (const desc of this.marksForElement(el)) {
        acc.marks.push({ type: desc.type, start, end, value: desc.value });
      }
    }
  }

  /**
   * Resolves the marks carried by an inline element.
   * @param el The inline element (known tag or `span` carrying color/size styles).
   * @returns The mark descriptors it carries (color and/or size for a `span`), or an empty array
   * for an unknown tag.
   */
  private marksForElement(el: HTMLElement): MarkDesc[] {
    const known = DocumentParseService.MARK_TAG[el.tagName];
    if (known) return [known];
    if (el.tagName === 'A') {
      // DL5: href sanitized (DL6) → link mark; otherwise mark dropped, text kept (<a> unwrapped).
      const url = sanitizeHttpUrl(el.getAttribute('href'));
      return url ? [{ type: 'link', value: url }] : [];
    }
    if (el.tagName === 'SPAN') {
      const descs: MarkDesc[] = [];
      const color = this.normalizeColor(el.style.getPropertyValue('color'));
      if (color) descs.push({ type: 'color', value: color });
      const fontSize = el.style.getPropertyValue('font-size');
      if (fontSize === 'small' || fontSize === 'large') descs.push({ type: 'size', value: fontSize });
      return descs;
    }
    return [];
  }

  /**
   * Builds a normalized text block from an inline accumulator.
   * @param kind The block kind (`text`/`h1`/`h2`/`bullet`/`numbered`).
   * @param acc The accumulated text and marks.
   * @param id The block id (kept from `data-block-id` or freshly minted).
   * @returns The block in canonical form (marks sorted, merged and bounded).
   */
  private finishTextBlock(kind: TextBlockKind, acc: InlineAcc, id: string): NoteBlock {
    return this.docModel.normalize({ id, kind, text: acc.text, marks: acc.marks });
  }

  /**
   * Normalizes a CSS color to a lowercase `#rrggbb` hex (aligned with `SelectionAnalysisService`).
   * Handles `rgb()/rgba()` (the form jsdom re-serializes to) and `#rgb`/`#rrggbb`.
   * @param value The raw CSS color value (may be empty).
   * @returns The lowercase hex color, or `''` when the input is empty.
   */
  private normalizeColor(value: string): string {
    const v = value.trim();
    if (!v) return '';
    const rgb = v.match(/^rgba?\(([^)]+)\)/i);
    if (rgb) {
      const [r, g, b] = rgb[1].split(',').map((p) => Number(p.trim()));
      return '#' + [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('');
    }
    if (v.startsWith('#')) {
      const hex = v.slice(1);
      const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
      return '#' + full.toLowerCase();
    }
    return v.toLowerCase();
  }
}
