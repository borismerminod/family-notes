import { Injectable } from '@angular/core';

/** Attribute every rendered block element carries, tying the DOM node back to its model id. */
const BLOCK_ID_ATTR = 'data-block-id';
/** CSS selector matching any element flagged as a block (`[data-block-id]`). */
const BLOCK_SELECTOR = `[${BLOCK_ID_ATTR}]`;

/** A position in the model: a block (by its id) and a UTF-16 offset within its plain text. */
export interface ModelPoint {
  blockId: string;
  offset: number;
}

/** A selection expressed in model positions, ordered by document position (`from` ≤ `to`). */
export interface ModelSelection {
  from: ModelPoint;
  to: ModelPoint;
}

/** A DOM position: a node (a text node, or the block element itself when empty) and a local offset. */
export interface DomPoint {
  node: Node;
  offset: number;
}

/**
 * @file document-selection.ts
 * @description **DOM** layer: bidirectional mapping between the live selection of a
 * `contenteditable` and model positions `(blockId, offset)`.
 *
 * The `contenteditable` renders the model produced by `document-render`, each block carrying a
 * `data-block-id` attribute. This service (see PLAN_MODELE_DOCUMENT_JSON.md §6 Phase 3):
 *   - `domToModel`: reads the current selection → `{from, to}` in model positions;
 *   - `modelToDom`: model position → DOM point `{node, offset}`;
 *   - `setSelection`: restores a real selection after a re-render (mitigates risk #1).
 *
 * The model offset is the UTF-16 length of the text between the start of the block's content and the
 * point, which absorbs the multiple text nodes created by marks (`<strong>`, `<span>`…).
 *
 * Built test-first, group by group (see .agent/PLAN_TESTS_DOCUMENT_SELECTION.md); the
 * `document-selection.spec.ts` suite is green (17/17).
 */
@Injectable({ providedIn: 'root' })
export class DocumentSelectionService {
  /**
   * Converts the current DOM selection into model positions.
   * @param editor The contenteditable host whose blocks carry `data-block-id`.
   * @returns The selection as `{from, to}` model points, or `null` when it is unusable (no
   * selection, or anchored outside the editor).
   */
  domToModel(editor: HTMLElement): ModelSelection | null {
    const range = this.currentRange(editor);
    if (!range) return null;

    const from = this.pointToModel(editor, range.startContainer, range.startOffset);
    const to = this.pointToModel(editor, range.endContainer, range.endOffset);
    if (!from || !to) return null;
    return { from, to };
  }

  /**
   * Converts a model position into a DOM point suitable for a `Range`.
   * @param editor The contenteditable host to look the block up in.
   * @param point The model position `(blockId, offset)` to resolve.
   * @returns The matching DOM point `{node, offset}`, or `null` when the block cannot be found.
   */
  modelToDom(editor: HTMLElement, point: ModelPoint): DomPoint | null {
    const block = this.findBlock(editor, point.blockId);
    if (!block) return null;

    const texts = this.textNodesOf(block);
    let remaining = point.offset;
    for (const text of texts) {
      if (remaining <= text.length) return { node: text, offset: remaining };
      remaining -= text.length;
    }
    // Offset beyond the block's text → clamped to the end of the last text node (DS-CLAMP).
    const last = texts[texts.length - 1];
    return last ? { node: last, offset: last.length } : { node: block, offset: 0 };
  }

  /**
   * Restores a DOM selection from two model positions, e.g. after re-rendering the editor.
   * @param editor The contenteditable host the selection is applied to.
   * @param from The start position of the selection to restore.
   * @param to The end position of the selection to restore.
   * @returns `true` once the selection is applied, `false` when either position cannot be resolved.
   */
  setSelection(editor: HTMLElement, from: ModelPoint, to: ModelPoint): boolean {
    const start = this.modelToDom(editor, from);
    const end = this.modelToDom(editor, to);
    if (!start || !end) return false;

    const range = editor.ownerDocument.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);

    const selection = window.getSelection();
    if (!selection) return false;
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  // --- Private helpers --------------------------------------------------------

  /**
   * Reads the active DOM range when it exists and is anchored inside the editor.
   * @param editor The contenteditable host the range must belong to.
   * @returns The current `Range`, or `null` when there is no selection or it lies outside the editor.
   */
  private currentRange(editor: HTMLElement): Range | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    return editor.contains(range.commonAncestorContainer) ? range : null;
  }

  /**
   * Maps a DOM point to a model position.
   * @param editor The contenteditable host bounding the search for the owning block.
   * @param node The DOM node the point sits in.
   * @param domOffset The local offset within `node`.
   * @returns The model position, or `null` when the node belongs to no block of the editor.
   */
  private pointToModel(editor: HTMLElement, node: Node, domOffset: number): ModelPoint | null {
    const block = this.blockElementOf(editor, node);
    if (!block) return null;
    return {
      blockId: block.getAttribute(BLOCK_ID_ATTR) ?? '',
      offset: this.offsetWithinBlock(block, node, domOffset),
    };
  }

  /**
   * Finds the closest block ancestor of a node, bounded to the editor.
   * @param editor The contenteditable host the block must be contained in.
   * @param node The node whose owning block is looked up.
   * @returns The nearest `[data-block-id]` element, or `null` when there is none inside the editor.
   */
  private blockElementOf(editor: HTMLElement, node: Node): HTMLElement | null {
    const start = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    const block = start?.closest(BLOCK_SELECTOR) ?? null;
    return block && editor.contains(block) ? (block as HTMLElement) : null;
  }

  /**
   * Measures the UTF-16 text length between the start of a block's content and a DOM point.
   * @param block The block element the offset is measured within.
   * @param node The node the point sits in.
   * @param domOffset The local offset within `node`.
   * @returns The model offset, i.e. the length of the text preceding the point inside the block.
   */
  private offsetWithinBlock(block: HTMLElement, node: Node, domOffset: number): number {
    const range = block.ownerDocument.createRange();
    range.selectNodeContents(block);
    range.setEnd(node, domOffset);
    return range.toString().length;
  }

  /**
   * Looks up the block element whose id matches, scanning by attribute value so ids with special
   * characters are handled safely (no selector interpolation).
   * @param editor The contenteditable host to search within.
   * @param blockId The model id to match against `data-block-id`.
   * @returns The matching block element, or `null` when no block carries that id.
   */
  private findBlock(editor: HTMLElement, blockId: string): HTMLElement | null {
    const blocks = Array.from(editor.querySelectorAll<HTMLElement>(BLOCK_SELECTOR));
    return blocks.find((el) => el.getAttribute(BLOCK_ID_ATTR) === blockId) ?? null;
  }

  /**
   * Collects the descendant text nodes of an element, in document order.
   * @param el The root node to walk.
   * @returns The text nodes found under `el`, depth-first and left-to-right.
   */
  private textNodesOf(el: Node): Text[] {
    const out: Text[] = [];
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) out.push(child as Text);
      else if (child.nodeType === Node.ELEMENT_NODE) out.push(...this.textNodesOf(child));
    }
    return out;
  }
}
