import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RichTextEditor } from './rich-text-editor';
import { NoteBlock, TextBlock } from '../core/models/document.model';
import { DocumentSelectionService } from '../core/services/document-selection';
import { ExternalLinkService } from '../core/services/external-link';

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
  /** Doublure espionnée de l'ouverture externe (§E2 : on vérifie l'appel sans ouvrir de page). */
  let linkOpener: { open: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    linkOpener = { open: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [RichTextEditor],
      providers: [{ provide: ExternalLinkService, useValue: linkOpener }],
    }).compileComponents();
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
    vi.restoreAllMocks();
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

  // ==========================================================================
  // Groupe 10 — Insertion de lien : bouton + barre 2 champs — §C+D du
  // PLAN_TESTS_INSERTION_LIEN.md (US1, US2, US3)
  // ==========================================================================
  // Contrat DOM : .btn-link, .media-popup.link-popup, .link-url-input, .link-label-input,
  // .btn-link-insert, .btn-close-popup (réutilisé). DL7 : sanitizeHttpUrl + trim + repli libellé=URL.
  describe('Insertion de lien — barre & bouton', () => {
    const linkPopup = () => host.querySelector<HTMLElement>('.media-popup.link-popup');

    // --- Groupe CD1 — ouvrir/fermer la barre (US1) --------------------------
    it('TCD1.1 un bouton .btn-link est présent avec title + aria-label explicites', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'x', marks: [] }]);
      const btn = host.querySelector<HTMLButtonElement>('.btn-link');
      expect(btn).toBeTruthy();
      expect(btn!.getAttribute('title')).toBe('Insérer un lien');
      expect(btn!.getAttribute('aria-label')).toBe('Insérer un lien');
    });

    it('TCD1.2 cliquer .btn-link ouvre la barre à deux champs + bouton insérer + croix', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'x', marks: [] }]);
      host.querySelector<HTMLButtonElement>('.btn-link')!.click();
      fixture.detectChanges();
      const popup = linkPopup();
      expect(popup).toBeTruthy();
      expect(popup!.querySelector('.link-url-input')).toBeTruthy();
      expect(popup!.querySelector('.link-label-input')).toBeTruthy();
      expect(popup!.querySelector('.btn-link-insert')).toBeTruthy();
      expect(popup!.querySelector('.btn-close-popup')).toBeTruthy();
    });

    it('TCD1.3 la croix ferme sans rien insérer et réinitialise les deux champs (US1)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'x', marks: [] }]);
      component.openLinkPopup();
      component.linkUrl.set('https://ex.com');
      component.linkLabel.set('clic');
      fixture.detectChanges();
      linkPopup()!.querySelector<HTMLButtonElement>('.btn-close-popup')!.click();
      fixture.detectChanges();
      expect(linkPopup()).toBeFalsy();
      expect(component.linkUrl()).toBe('');
      expect(component.linkLabel()).toBe('');
      expect(emitted).toEqual([]);
    });

    // --- Groupe CD2 — saisie & no-op (US2) ----------------------------------
    it('TCD2.1 « Insérer » avec URL vide → no-op (modèle inchangé)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'abc', marks: [] }]);
      selectInBlock('b1', 3, 3);
      component.openLinkPopup();
      component.linkUrl.set('');
      component.linkLabel.set('clic');
      component.insertLinkFromUrl();
      expect(emitted).toEqual([]);
    });

    it('TCD2.2 « Insérer » avec un schéma refusé (javascript:) → no-op (sanitation, DL7)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'abc', marks: [] }]);
      selectInBlock('b1', 3, 3);
      component.openLinkPopup();
      component.linkUrl.set('javascript:alert(1)');
      component.linkLabel.set('clic');
      component.insertLinkFromUrl();
      expect(emitted).toEqual([]);
    });

    it('TCD2.3 libellé vide + URL valide → le texte affiché retombe sur l\'URL (US2)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'abc', marks: [] }]);
      selectInBlock('b1', 3, 3);
      component.openLinkPopup();
      component.linkUrl.set('https://ex.com');
      component.linkLabel.set('');
      component.insertLinkFromUrl();
      const block = last()[0] as TextBlock;
      expect(block.text).toBe('abchttps://ex.com');
      expect(block.marks).toEqual([
        { type: 'link', start: 3, end: 3 + 'https://ex.com'.length, value: 'https://ex.com' },
      ]);
    });

    it('TCD2.4 URL et libellé entourés d\'espaces → trim avant insertion (US2)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'abc', marks: [] }]);
      selectInBlock('b1', 3, 3);
      component.openLinkPopup();
      component.linkUrl.set('  https://ex.com  ');
      component.linkLabel.set('  clic  ');
      component.insertLinkFromUrl();
      const block = last()[0] as TextBlock;
      expect(block.text).toBe('abcclic');
      expect(block.marks).toEqual([{ type: 'link', start: 3, end: 7, value: 'https://ex.com' }]);
    });

    // --- Groupe CD3 — insertion au curseur (US3) ----------------------------
    it('TCD3.1 curseur dans un bloc texte → libellé inséré au curseur, porteur de la marque link (US3)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'abc', marks: [] }]);
      selectInBlock('b1', 3, 3);
      component.openLinkPopup();
      component.linkUrl.set('https://ex.com');
      component.linkLabel.set('clic');
      component.insertLinkFromUrl();
      const block = last()[0] as TextBlock;
      expect(block.text).toBe('abcclic');
      expect(block.marks).toEqual([{ type: 'link', start: 3, end: 7, value: 'https://ex.com' }]);
    });

    it('TCD3.2 le texte inséré est rendu comme un lien (a[href] dans le bloc) (US3/US4)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'abc', marks: [] }]);
      selectInBlock('b1', 3, 3);
      component.openLinkPopup();
      component.linkUrl.set('https://ex.com');
      component.linkLabel.set('clic');
      component.insertLinkFromUrl();
      fixture.detectChanges();
      const a = blockEl('b1').querySelector<HTMLAnchorElement>('a[href]');
      expect(a).toBeTruthy();
      expect(a!.getAttribute('href')).toBe('https://ex.com');
      expect(a!.textContent).toContain('clic');
    });

    it('TCD3.3 après insertion, la barre se ferme et ses champs sont réinitialisés (US3)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'abc', marks: [] }]);
      selectInBlock('b1', 3, 3);
      component.openLinkPopup();
      component.linkUrl.set('https://ex.com');
      component.linkLabel.set('clic');
      component.insertLinkFromUrl();
      fixture.detectChanges();
      expect(linkPopup()).toBeFalsy();
      expect(component.linkUrl()).toBe('');
      expect(component.linkLabel()).toBe('');
    });

    it('TCD3.4 le curseur se replace APRÈS le libellé inséré (borne exclue → pas d\'héritage) (US3)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'abc', marks: [] }]);
      selectInBlock('b1', 3, 3);
      component.openLinkPopup();
      component.linkUrl.set('https://ex.com');
      component.linkLabel.set('clic');
      component.insertLinkFromUrl();
      fixture.detectChanges();
      // Curseur collapsé, remis à la fin du libellé (offset 7 = 'abc' + 'clic', borne exclue).
      const selService = TestBed.inject(DocumentSelectionService);
      const sel = selService.domToModel(editorEl());
      expect(sel).toEqual({
        from: { blockId: 'b1', offset: 7 },
        to: { blockId: 'b1', offset: 7 },
      });
    });

    it('TCD3.5 une sélection non collapsée est remplacée par le libellé lié (US3)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'abcXXdef', marks: [] }]);
      selectInBlock('b1', 3, 5); // sélectionne 'XX'
      component.openLinkPopup();
      component.linkUrl.set('https://ex.com');
      component.linkLabel.set('clic');
      component.insertLinkFromUrl();
      const block = last()[0] as TextBlock;
      expect(block.text).toBe('abcclicdef');
      expect(block.marks).toEqual([{ type: 'link', start: 3, end: 7, value: 'https://ex.com' }]);
    });

    it('TCD3.6 aucun curseur dans un bloc texte (doc vide) → nouveau bloc texte lié (US3, DL7)', () => {
      setBlocks([]);
      component.openLinkPopup();
      component.linkUrl.set('https://ex.com');
      component.linkLabel.set('clic');
      component.insertLinkFromUrl();
      const linked = last().find((b) => b.kind === 'text') as TextBlock;
      expect(linked).toBeTruthy();
      expect(linked.text).toBe('clic');
      expect(linked.marks).toEqual([{ type: 'link', start: 0, end: 4, value: 'https://ex.com' }]);
    });
  });

  // ==========================================================================
  // Groupe 11 — Ouverture externe au tap — §E2 du PLAN_TESTS_INSERTION_LIEN.md (US5)
  // ==========================================================================
  // DL9 — onEditorClick : clic dans un <a href> → preventDefault + linkOpener.open(href) ;
  //       ouvre TOUJOURS (focus ou non) ; clic hors <a> → aucune ouverture.
  describe('Ouverture d\'un lien au tap', () => {
    it('TE2.1 un clic sur a[href] appelle linkOpener.open(href) et preventDefault (US5)', () => {
      setBlocks([
        { id: 'b1', kind: 'text', text: 'clic', marks: [{ type: 'link', start: 0, end: 4, value: 'https://ex.com' }] },
      ]);
      const a = editorEl().querySelector<HTMLAnchorElement>('a[href]')!;
      const evt = new MouseEvent('click', { bubbles: true, cancelable: true });
      a.dispatchEvent(evt);
      expect(linkOpener.open).toHaveBeenCalledWith('https://ex.com');
      expect(evt.defaultPrevented).toBe(true);
    });

    it('TE2.2 l\'ouverture se produit que l\'éditeur ait le focus ou non (écart US5 assumé, DL9)', () => {
      setBlocks([
        { id: 'b1', kind: 'text', text: 'clic', marks: [{ type: 'link', start: 0, end: 4, value: 'https://ex.com' }] },
      ]);
      const a = editorEl().querySelector<HTMLAnchorElement>('a[href]')!;

      editorEl().blur();
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(linkOpener.open).toHaveBeenCalledTimes(1);

      editorEl().focus();
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(linkOpener.open).toHaveBeenCalledTimes(2);
    });

    it('TE2.3 un clic hors d\'un <a> (texte normal) → linkOpener.open n\'est pas appelé (DL9)', () => {
      setBlocks([{ id: 'b1', kind: 'text', text: 'abc', marks: [] }]);
      blockEl('b1').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      expect(linkOpener.open).not.toHaveBeenCalled();
    });
  });
});
