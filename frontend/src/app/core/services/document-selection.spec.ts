import { DocumentSelectionService } from './document-selection';

/**
 * Tests du `DocumentSelectionService` — mapping sélection DOM ⇄ modèle `(blockId, offset)`,
 * DOM-aware — TDD / boîte noire. Voir .agent/PLAN_TESTS_DOCUMENT_SELECTION.md et
 * .agent/PLAN_MODELE_DOCUMENT_JSON.md (§6 Phase 3).
 *
 * Doublures : AUCUNE. On utilise les vraies API `window.getSelection()`/`Range`/DOM (jsdom), comme
 * `selection-analysis-service.spec.ts`. Chaque test monte un vrai `<div contenteditable>` dont les
 * blocs portent `data-block-id`, pose une vraie sélection, puis appelle le service.
 *
 * Décisions figées (cf. plan §4) :
 *   DS-DOM — le bloc d'un nœud = son plus proche ancêtre [data-block-id] borné à l'éditeur.
 *   DS-OFFSET — offset modèle = longueur texte (UTF-16) du début du bloc jusqu'au point.
 *   DS-API — ModelSelection {from,to} ordonné par position document.
 *   DS-CLAMP — offset au-delà → borné à la fin ; bloc vide → {blockElement, 0}.
 *   DS-GUARD — pas de sélection / hors éditeur / bloc introuvable → null (setSelection → false).
 */

describe('DocumentSelectionService (mapping sélection DOM ⇄ modèle)', () => {
  let service: DocumentSelectionService;
  let mounted: HTMLElement[];

  beforeEach(() => {
    service = new DocumentSelectionService();
    mounted = [];
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    for (const el of mounted) el.remove();
  });

  // --- Helpers ----------------------------------------------------------------

  /** Crée un `<div contenteditable>`, pose `innerHTML`, l'attache au body. */
  function mountEditor(html: string): HTMLElement {
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.innerHTML = html;
    document.body.appendChild(editor);
    mounted.push(editor);
    return editor;
  }

  /** Bloc portant `data-block-id`. */
  function block(editor: HTMLElement, id: string): HTMLElement {
    return editor.querySelector(`[data-block-id="${id}"]`) as HTMLElement;
  }

  /** Premier nœud texte descendant dont le contenu vaut `text` (ou le tout premier si omis). */
  function textNodeOf(root: Node, text?: string): Text {
    const walk = (node: Node): Text | null => {
      if (node.nodeType === Node.TEXT_NODE) {
        return text === undefined || (node as Text).data === text ? (node as Text) : null;
      }
      for (const child of Array.from(node.childNodes)) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(root) as Text;
  }

  /** Pose une vraie sélection (repliée si un seul point). */
  function selectRange(startNode: Node, start: number, endNode?: Node, end?: number): void {
    const range = document.createRange();
    range.setStart(startNode, start);
    range.setEnd(endNode ?? startNode, end ?? start);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  }

  // ==========================================================================
  // Groupe 1 — domToModel : bloc à nœud texte unique
  // ==========================================================================
  describe('domToModel (bloc simple)', () => {
    it('T1.1 mappe un caret replié', () => {
      const editor = mountEditor('<p data-block-id="b1">Bonjour</p>');
      selectRange(textNodeOf(block(editor, 'b1')), 3);
      expect(service.domToModel(editor)).toEqual({ from: { blockId: 'b1', offset: 3 }, to: { blockId: 'b1', offset: 3 } });
    });

    it('T1.2 mappe une sélection dans le bloc', () => {
      const editor = mountEditor('<p data-block-id="b1">Bonjour</p>');
      const t = textNodeOf(block(editor, 'b1'));
      selectRange(t, 2, t, 5);
      expect(service.domToModel(editor)).toEqual({ from: { blockId: 'b1', offset: 2 }, to: { blockId: 'b1', offset: 5 } });
    });

    it('T1.3 renvoie null sans sélection', () => {
      const editor = mountEditor('<p data-block-id="b1">Bonjour</p>');
      window.getSelection()?.removeAllRanges();
      expect(service.domToModel(editor)).toBeNull();
    });

    it('T1.4 renvoie null pour une sélection hors éditeur', () => {
      const editor = mountEditor('<p data-block-id="b1">Bonjour</p>');
      const outside = document.createElement('p');
      outside.textContent = 'Ailleurs';
      document.body.appendChild(outside);
      mounted.push(outside);
      selectRange(textNodeOf(outside), 1);
      expect(service.domToModel(editor)).toBeNull();
    });
  });

  // ==========================================================================
  // Groupe 2 — domToModel : marques & multi-blocs
  // ==========================================================================
  describe('domToModel (marques & multi-blocs)', () => {
    it('T2.1 additionne les nœuds texte précédant le point', () => {
      const editor = mountEditor('<p data-block-id="b1">Le <strong>petit</strong> chat</p>');
      selectRange(textNodeOf(block(editor, 'b1'), 'petit'), 2);
      expect(service.domToModel(editor)?.from).toEqual({ blockId: 'b1', offset: 5 });
    });

    it('T2.2 mappe une sélection couvrant plusieurs nœuds texte', () => {
      const editor = mountEditor('<p data-block-id="b1">Le <strong>petit</strong> chat</p>');
      const start = textNodeOf(block(editor, 'b1'), 'Le ');
      const end = textNodeOf(block(editor, 'b1'), 'petit');
      selectRange(start, 0, end, 2);
      expect(service.domToModel(editor)).toEqual({ from: { blockId: 'b1', offset: 0 }, to: { blockId: 'b1', offset: 5 } });
    });

    it('T2.3 mappe une sélection à cheval sur deux blocs', () => {
      const editor = mountEditor('<p data-block-id="b1">abc</p><p data-block-id="b2">def</p>');
      const start = textNodeOf(block(editor, 'b1'));
      const end = textNodeOf(block(editor, 'b2'));
      selectRange(start, 1, end, 2);
      expect(service.domToModel(editor)).toEqual({ from: { blockId: 'b1', offset: 1 }, to: { blockId: 'b2', offset: 2 } });
    });
  });

  // ==========================================================================
  // Groupe 3 — modelToDom
  // ==========================================================================
  describe('modelToDom', () => {
    it('T3.1 mappe un offset simple sur le nœud texte', () => {
      const editor = mountEditor('<p data-block-id="b1">Bonjour</p>');
      const t = textNodeOf(block(editor, 'b1'));
      const point = service.modelToDom(editor, { blockId: 'b1', offset: 3 });
      expect(point?.node).toBe(t);
      expect(point?.offset).toBe(3);
    });

    it('T3.2 mappe un offset tombant dans une marque', () => {
      const editor = mountEditor('<p data-block-id="b1">Le <strong>petit</strong> chat</p>');
      const inStrong = textNodeOf(block(editor, 'b1'), 'petit');
      const point = service.modelToDom(editor, { blockId: 'b1', offset: 5 });
      expect(point?.node).toBe(inStrong);
      expect(point?.offset).toBe(2);
    });

    it('T3.3 borne un offset au-delà de la fin', () => {
      const editor = mountEditor('<p data-block-id="b1">Le <strong>petit</strong> chat</p>');
      const last = textNodeOf(block(editor, 'b1'), ' chat');
      const point = service.modelToDom(editor, { blockId: 'b1', offset: 100 });
      expect(point?.node).toBe(last);
      expect(point?.offset).toBe(5);
    });

    it('T3.4 renvoie l\'élément bloc pour un bloc vide', () => {
      const editor = mountEditor('<p data-block-id="b1"></p>');
      const point = service.modelToDom(editor, { blockId: 'b1', offset: 0 });
      expect(point?.node).toBe(block(editor, 'b1'));
      expect(point?.offset).toBe(0);
    });

    it('T3.5 renvoie null pour un blockId inconnu', () => {
      const editor = mountEditor('<p data-block-id="b1">Bonjour</p>');
      expect(service.modelToDom(editor, { blockId: 'zzz', offset: 0 })).toBeNull();
    });
  });

  // ==========================================================================
  // Groupe 4 — round-trip & setSelection
  // ==========================================================================
  describe('setSelection (restauration)', () => {
    it('T4.1 round-trip setSelection → domToModel (avec marque)', () => {
      const editor = mountEditor('<p data-block-id="b1">Le <strong>petit</strong> chat</p>');
      const ok = service.setSelection(editor, { blockId: 'b1', offset: 2 }, { blockId: 'b1', offset: 5 });
      expect(ok).toBe(true);
      expect(service.domToModel(editor)).toEqual({ from: { blockId: 'b1', offset: 2 }, to: { blockId: 'b1', offset: 5 } });
    });

    it('T4.2 restaure un caret replié', () => {
      const editor = mountEditor('<p data-block-id="b1">Bonjour</p>');
      service.setSelection(editor, { blockId: 'b1', offset: 4 }, { blockId: 'b1', offset: 4 });
      expect(service.domToModel(editor)).toEqual({ from: { blockId: 'b1', offset: 4 }, to: { blockId: 'b1', offset: 4 } });
    });

    it('T4.3 renvoie false pour un blockId inconnu sans lever d\'exception', () => {
      const editor = mountEditor('<p data-block-id="b1">Bonjour</p>');
      expect(() => service.setSelection(editor, { blockId: 'zzz', offset: 0 }, { blockId: 'zzz', offset: 0 })).not.toThrow();
      expect(service.setSelection(editor, { blockId: 'zzz', offset: 0 }, { blockId: 'zzz', offset: 0 })).toBe(false);
    });
  });

  // ==========================================================================
  // Groupe 5 — listes & bornes
  // ==========================================================================
  describe('listes & bornes', () => {
    it('T5.1 mappe une sélection dans un <li> et retrouve le nœud texte', () => {
      const editor = mountEditor('<ul><li data-block-id="b1">Pomme</li><li data-block-id="b2">Poire</li></ul>');
      selectRange(textNodeOf(block(editor, 'b2')), 2);
      expect(service.domToModel(editor)?.from).toEqual({ blockId: 'b2', offset: 2 });

      const point = service.modelToDom(editor, { blockId: 'b1', offset: 3 });
      expect(point?.node).toBe(textNodeOf(block(editor, 'b1')));
      expect(point?.offset).toBe(3);
    });

    it('T5.2 gère les bornes offset=0 et offset=len', () => {
      const editor = mountEditor('<p data-block-id="b1">abc</p>');
      service.setSelection(editor, { blockId: 'b1', offset: 0 }, { blockId: 'b1', offset: 0 });
      expect(service.domToModel(editor)?.from).toEqual({ blockId: 'b1', offset: 0 });

      service.setSelection(editor, { blockId: 'b1', offset: 3 }, { blockId: 'b1', offset: 3 });
      expect(service.domToModel(editor)?.from).toEqual({ blockId: 'b1', offset: 3 });
    });
  });
});
