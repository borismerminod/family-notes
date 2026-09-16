import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RichTextEditor } from './rich-text-editor';
import { NoteBlock, TextBlock } from '../core/models/document.model';

/**
 * Tests du `RichTextEditor` (Phase 3) — éditeur au-dessus du modèle de document JSON.
 * Voir .agent/PLAN_MODELE_DOCUMENT_JSON.md §6 (Phase 3) et les services `document-*`.
 *
 * Approche : composant réel monté (services `document-*` réels, `providedIn: 'root'`), attaché au
 * `document.body` pour disposer d'une vraie sélection (jsdom). On pose `blocks`, on place une
 * sélection dans le `contenteditable`, on déclenche une commande et on observe `blocksChange`.
 */

describe('RichTextEditor (Phase 3, modèle blocks)', () => {
  let fixture: ComponentFixture<RichTextEditor>;
  let component: RichTextEditor;
  let host: HTMLElement;
  let emitted: NoteBlock[][];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RichTextEditor] }).compileComponents();
    fixture = TestBed.createComponent(RichTextEditor);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    emitted = [];
    component.blocksChange.subscribe((b) => emitted.push(b));
  });

  afterEach(() => {
    window.getSelection()?.removeAllRanges();
    host.remove();
  });

  function setBlocks(blocks: NoteBlock[]): void {
    fixture.componentRef.setInput('blocks', blocks);
    fixture.detectChanges();
  }

  const editorEl = () => host.querySelector<HTMLElement>('.editor-content')!;
  const blockEl = (id: string) => editorEl().querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;

  /** Premier nœud texte descendant. */
  function firstText(root: Node): Text {
    if (root.nodeType === Node.TEXT_NODE) return root as Text;
    for (const c of Array.from(root.childNodes)) {
      const t = firstText(c);
      if (t) return t;
    }
    return null as unknown as Text;
  }

  /** Sélectionne `[start,end)` dans le texte du bloc `id` (repliée si start===end). */
  function selectInBlock(id: string, start: number, end: number): void {
    const tn = firstText(blockEl(id));
    const range = document.createRange();
    range.setStart(tn, start);
    range.setEnd(tn, end);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
  }

  const last = (): NoteBlock[] => emitted[emitted.length - 1];

  // --- Groupe 1 — rendu ------------------------------------------------------
  describe('rendu', () => {
    it('T1.1 rend les blocs avec data-block-id', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
      expect(editorEl().innerHTML).toBe('<p data-block-id="b1">Bonjour</p>');
    });

    it('T1.2 rend le formatage inline', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [{ type: 'bold', start: 0, end: 3 }] }]);
      expect(editorEl().innerHTML).toContain('<strong>Bon</strong>');
    });
  });

  // --- Groupe 2 — commandes de marque ---------------------------------------
  describe('commandes de marque', () => {
    it('T2.1 applique le gras à la sélection', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
      selectInBlock('b1', 0, 3);
      component.applyMark('bold');
      expect((last()[0] as TextBlock).marks).toEqual([{ type: 'bold', start: 0, end: 3 }]);
    });

    it('T2.2 retire le gras si déjà présent (toggle)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [{ type: 'bold', start: 0, end: 7 }] }]);
      selectInBlock('b1', 0, 7);
      component.applyMark('bold');
      expect((last()[0] as TextBlock).marks).toEqual([]);
    });

    it('T2.3 applique une couleur', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
      selectInBlock('b1', 0, 3);
      component.applyColor('#FF0000');
      expect((last()[0] as TextBlock).marks).toEqual([{ type: 'color', start: 0, end: 3, value: '#FF0000' }]);
    });
  });

  // --- Groupe 3 — surbrillance ----------------------------------------------
  describe('surbrillance', () => {
    it('T3.1 reflète le gras de la sélection courante', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [{ type: 'bold', start: 0, end: 7 }] }]);
      selectInBlock('b1', 0, 7);
      document.dispatchEvent(new Event('selectionchange'));
      expect(component.active().bold).toBe(true);
    });
  });

  // --- Groupe 4 — kinds de bloc & listes ------------------------------------
  describe('kinds de bloc', () => {
    it('T4.1 passe un paragraphe en titre H1', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Titre', marks: [] }]);
      selectInBlock('b1', 0, 0);
      component.applySize('h1');
      expect(last()[0].kind).toBe('h1');
    });

    it('T4.2 bascule en liste à puces', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Item', marks: [] }]);
      selectInBlock('b1', 0, 0);
      component.applyList('bullet');
      expect(last()[0].kind).toBe('bullet');
    });
  });

  // --- Groupe 5 — média ------------------------------------------------------
  describe('média', () => {
    it('T5.1 insère un bloc image depuis une URL', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'x', marks: [] }]);
      component.imageUrl.set('http://ex/y.jpg');
      component.insertImageFromUrl();
      expect(last().some((b) => b.kind === 'image' && (b as any).src === 'http://ex/y.jpg')).toBe(true);
    });
  });

  // --- Groupe 6 — frappe (re-dérivation) ------------------------------------
  describe('frappe', () => {
    it('T6.1 re-dérive les blocs du DOM sur input', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
      editorEl().innerHTML = '<p data-block-id="b1">Bonjour !</p>';
      editorEl().dispatchEvent(new Event('input', { bubbles: true }));
      expect((last()[0] as TextBlock).text).toBe('Bonjour !');
      expect(last()[0].id).toBe('b1'); // data-block-id préservé
    });
  });

  /** Événement clavier factice (contrôle `preventDefault`). */
  function keydown(key: string, shiftKey = false): KeyboardEvent {
    return { key, shiftKey, preventDefault: () => {} } as unknown as KeyboardEvent;
  }

  // --- Groupe 7 — Entrée (splitBlock) ---------------------------------------
  describe('Entrée', () => {
    it('T7.1 coupe le bloc au caret et place le curseur au début du nouveau', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
      selectInBlock('b1', 3, 3);
      component.onKeydown(keydown('Enter'));
      expect(last().map((b) => (b as TextBlock).text)).toEqual(['Bon', 'jour']);
    });

    it('T7.2 répartit les marques de part et d\'autre de la coupe', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [{ type: 'bold', start: 0, end: 7 }] }]);
      selectInBlock('b1', 3, 3);
      component.onKeydown(keydown('Enter'));
      const [left, right] = last() as TextBlock[];
      expect(left.marks).toEqual([{ type: 'bold', start: 0, end: 3 }]);
      expect(right.marks).toEqual([{ type: 'bold', start: 0, end: 4 }]);
    });

    it('T7.3 supprime la sélection avant de couper', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
      selectInBlock('b1', 2, 5); // supprime "njo"
      component.onKeydown(keydown('Enter'));
      expect(last().map((b) => (b as TextBlock).text)).toEqual(['Bo', 'ur']);
    });

    it('T7.4 ne coupe pas sur Shift+Entrée', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
      selectInBlock('b1', 3, 3);
      component.onKeydown(keydown('Enter', true));
      expect(emitted).toEqual([]);
    });
  });

  // --- Groupe 8 — Retour arrière (mergeBlocks) ------------------------------
  describe('Retour arrière', () => {
    it('T8.1 fusionne avec le bloc précédent en tête de bloc', () => {
      setBlocks([
        { id: 'b1', kind: 'text', text: 'Bon', marks: [] },
        { id: 'b2', kind: 'text', text: 'jour', marks: [] },
      ]);
      selectInBlock('b2', 0, 0);
      component.onKeydown(keydown('Backspace'));
      expect(last().map((b) => (b as TextBlock).text)).toEqual(['Bonjour']);
      expect(last()[0].id).toBe('b1');
    });

    it('T8.2 fusionne les marques à la jointure', () => {
      setBlocks([
        { id: 'b1', kind: 'text', text: 'Bon', marks: [{ type: 'bold', start: 0, end: 3 }] },
        { id: 'b2', kind: 'text', text: 'jour', marks: [{ type: 'bold', start: 0, end: 4 }] },
      ]);
      selectInBlock('b2', 0, 0);
      component.onKeydown(keydown('Backspace'));
      expect((last()[0] as TextBlock).marks).toEqual([{ type: 'bold', start: 0, end: 7 }]);
    });

    it('T8.3 ne fusionne pas si le caret n\'est pas en tête', () => {
      setBlocks([
        { id: 'b1', kind: 'text', text: 'Bon', marks: [] },
        { id: 'b2', kind: 'text', text: 'jour', marks: [] },
      ]);
      selectInBlock('b2', 2, 2);
      component.onKeydown(keydown('Backspace'));
      expect(emitted).toEqual([]);
    });

    it('T8.4 ne fait rien sur le premier bloc', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
      selectInBlock('b1', 0, 0);
      component.onKeydown(keydown('Backspace'));
      expect(emitted).toEqual([]);
    });
  });

  // --- Groupe 9 — Collage (onPaste) -----------------------------------------
  describe('Collage', () => {
    function paste(data: Record<string, string>): ClipboardEvent {
      return {
        clipboardData: { getData: (t: string) => data[t] ?? '' },
        preventDefault: () => {},
      } as unknown as ClipboardEvent;
    }

    it('T9.1 insère le HTML collé après le bloc courant', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Avant', marks: [] }]);
      selectInBlock('b1', 5, 5);
      component.onPaste(paste({ 'text/html': '<p>Collé</p>' }));
      expect(last().map((b) => (b as TextBlock).text)).toEqual(['Avant', 'Collé']);
    });

    it('T9.2 insère le texte brut à défaut de HTML', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Avant', marks: [] }]);
      selectInBlock('b1', 5, 5);
      component.onPaste(paste({ 'text/plain': 'Texte' }));
      expect(last().some((b) => (b as TextBlock).text === 'Texte')).toBe(true);
    });

    it('T9.3 assainit le contenu collé (script retiré)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Avant', marks: [] }]);
      selectInBlock('b1', 5, 5);
      component.onPaste(paste({ 'text/html': '<p>a<script>alert(1)</script>b</p>' }));
      const texts = last().map((b) => (b as TextBlock).text).join('|');
      expect(texts).toContain('ab');
      expect(texts).not.toContain('alert');
    });

    it('T9.4 ne change rien si le presse-papier est vide', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'Avant', marks: [] }]);
      selectInBlock('b1', 5, 5);
      component.onPaste(paste({}));
      expect(emitted).toEqual([]);
    });
  });
});
