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

  // ==========================================================================
  // Undo/Redo (Lot B — câblage de EditHistory dans RichTextEditor)
  // Réf : .agent/UNDO_REDO/PLAN_TESTS_RTE_UNDO_REDO.md (validé 2026-09-20), cas TB1–TB6.
  // TDD boîte noire : on observe les signaux canUndo()/canRedo(), les émissions blocksChange
  // (last()/emitted.length), le DOM re-rendu et la sélection restaurée (domToModel). L'algèbre de
  // l'historique est déjà testée au Lot A (edit-history.spec.ts) — ici on teste le BRANCHEMENT.
  //
  // Groupe 7 (frontière Lot C : garde d'echo R1 / reset par note) = NON testé ici (cf. plan §4-G7).
  // ==========================================================================
  describe('Undo/Redo (Lot B)', () => {
    /** Horloge injectée partagée (seam Q2/DB3) : chaque test temporel la fixe avant le dispatch. */
    let clock = 0;

    /**
     * Simule une frappe dans le bloc `id` : mute le texte du DOM (comme le ferait le navigateur) puis
     * dispatche un `InputEvent` portant `data` (dernier caractère → dérive `isBoundary`, DB3/Q1), en
     * ayant d'abord positionné l'horloge injectée à `at`.
     */
    function typeKey(id: string, text: string, data: string | null, at: number): void {
      clock = at;
      blockEl(id).textContent = text;
      editorEl().dispatchEvent(new InputEvent('input', { bubbles: true, data }));
    }

    const selService = () => TestBed.inject(DocumentSelectionService);

    /**
     * Place une sélection par **offsets modèle** (via `document-selection`), robuste aux nœuds texte
     * scindés par une marque (`<strong>`…) — contrairement à `selectInBlock` qui vise le 1ᵉʳ nœud
     * texte. Utilisé pour la 2ᵉ commande d'un enchaînement, quand le DOM est déjà scindé.
     */
    function selectModel(id: string, from: number, to: number): void {
      selService().setSelection(editorEl(), { blockId: id, offset: from }, { blockId: id, offset: to });
    }

    // --- Groupe 1 — État initial des signaux (US2, US4) ---------------------
    describe('Groupe 1 — signaux initiaux', () => {
      it('TB1.1 note chargée, avant toute action : canUndo() = canRedo() = false (rien à annuler ; amorçage paresseux Lot B / eager au (re)chargement Lot C — DB4/DC7)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        expect(component.canUndo()).toBe(false);
        expect(component.canRedo()).toBe(false);
      });

      it('TB1.2 document vide : canUndo() = canRedo() = false', () => {
        setBlocks([]);
        expect(component.canUndo()).toBe(false);
        expect(component.canRedo()).toBe(false);
      });
    });

    // --- Groupe 2 — Une commande empile un pas & pilote les signaux (US1, US2)
    describe('Groupe 2 — commande → empilement', () => {
      it('TB2.1 applyMark(bold) rend canUndo() vrai et laisse canRedo() faux (US1/US2)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        expect(component.canUndo()).toBe(true);
        expect(component.canRedo()).toBe(false);
      });

      it('TB2.2 la commande émet toujours le modèle transformé (parité : l\'historique ne casse pas l\'émission)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        expect((last()[0] as TextBlock).marks).toEqual([{ type: 'bold', start: 0, end: 3 }]);
      });

      it('TB2.3 deux commandes successives : canUndo() reste vrai (deux pas annulables)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        selectModel('b1', 4, 7);
        component.applyColor('#FF0000');
        expect(component.canUndo()).toBe(true);
        expect(component.canRedo()).toBe(false);
      });

      it('TB2.4 une scission (Enter) rend aussi canUndo() vrai (tous les points d\'entrée commit empilent)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 3, 3);
        component.onKeydown(keydown('Enter'));
        expect(component.canUndo()).toBe(true);
      });
    });

    // --- Groupe 3 — undo() restaure modèle + sélection + re-render (US1, US5)
    describe('Groupe 3 — undo()', () => {
      it('TB3.1 après un gras, undo() ré-émet le modèle d\'avant et retire le <strong> du DOM (US5)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        component.undo();
        expect((last()[0] as TextBlock).marks).toEqual([]);
        expect(editorEl().innerHTML).not.toContain('<strong>');
      });

      it('TB3.2 après undo() : canUndo() = false (au fond) et canRedo() = true (US1/US4)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        component.undo();
        expect(component.canUndo()).toBe(false);
        expect(component.canRedo()).toBe(true);
      });

      it('TB3.3 undo() restaure la sélection du pas restauré (D3, DB6)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        // Deux commandes aux sélections distinctes : undo doit rétablir CELLE du pas 1 (0..3),
        // différente de la sélection laissée dans le DOM par le pas 2 (4..7).
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        selectModel('b1', 4, 7);
        component.applyColor('#FF0000');
        component.undo();
        expect(selService().domToModel(editorEl())).toEqual({
          from: { blockId: 'b1', offset: 0 },
          to: { blockId: 'b1', offset: 3 },
        });
      });

      it('TB3.4 anti-boucle (US5) : undo() puis redo() ramène exactement au modèle post-commande, canRedo() = false', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        component.undo();
        component.redo();
        expect((last()[0] as TextBlock).marks).toEqual([{ type: 'bold', start: 0, end: 3 }]);
        expect(component.canUndo()).toBe(true);
        expect(component.canRedo()).toBe(false);
      });

      it('TB3.5 plusieurs undo remontent jusqu\'à l\'état initial ; un undo de plus est sans effet', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        selectModel('b1', 4, 7);
        component.applyColor('#FF0000');
        component.undo();
        component.undo();
        expect((last()[0] as TextBlock).marks).toEqual([]);
        expect(component.canUndo()).toBe(false);
        const count = emitted.length;
        component.undo(); // au fond : no-op, aucune émission supplémentaire
        expect(emitted.length).toBe(count);
      });
    });

    // --- Groupe 4 — redo() rétablit (US3, US4) -------------------------------
    describe('Groupe 4 — redo()', () => {
      it('TB4.1 commande → undo → redo : la commande est ré-appliquée, canRedo() = false, canUndo() = true (US3)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        component.undo();
        component.redo();
        expect((last()[0] as TextBlock).marks).toEqual([{ type: 'bold', start: 0, end: 3 }]);
        expect(editorEl().innerHTML).toContain('<strong>');
        expect(component.canRedo()).toBe(false);
        expect(component.canUndo()).toBe(true);
      });

      it('TB4.2 la sélection du pas rétabli est restaurée au redo() (D3)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        selectModel('b1', 4, 7);
        component.applyColor('#FF0000');
        component.undo(); // revient au pas 1 (sél 0..3)
        component.redo(); // rétablit le pas 2 (sél 4..7)
        expect(selService().domToModel(editorEl())).toEqual({
          from: { blockId: 'b1', offset: 4 },
          to: { blockId: 'b1', offset: 7 },
        });
      });

      it('TB4.3 purge du futur (US4) : commande A → undo → commande B → canRedo() = false et redo() sans effet', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold'); // commande A
        component.undo();
        expect(component.canRedo()).toBe(true);
        selectModel('b1', 4, 7);
        component.applyColor('#FF0000'); // commande B → vide le futur
        expect(component.canRedo()).toBe(false);
        const count = emitted.length;
        component.redo(); // sans effet
        expect(emitted.length).toBe(count);
      });
    });

    // --- Groupe 5 — Saisie libre alimentée dans l'historique (US1, D1/D2) ----
    describe('Groupe 5 — saisie & coalescing (horloge injectée)', () => {
      it('TB5.1 une salve (< 500 ms, même mot) = un pas : un seul undo retire toute la salve (US1/D1)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'ab', marks: [] }]);
        component.now = () => clock;
        typeKey('b1', 'abX', 'X', 1000);
        typeKey('b1', 'abXY', 'Y', 1200);
        typeKey('b1', 'abXYZ', 'Z', 1400);
        expect(component.canUndo()).toBe(true);
        component.undo();
        expect((last()[0] as TextBlock).text).toBe('ab'); // toute la salve retirée
      });

      it('TB5.2 une frontière de mot (séparateur) ouvre un nouveau pas : deux undo séparent « mot2 » (D1/C3)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'A', marks: [] }]);
        component.now = () => clock;
        typeKey('b1', 'Amot', 't', 1000); // frappe du mot
        typeKey('b1', 'Amot ', ' ', 1050); // séparateur → isBoundary=true, scelle
        typeKey('b1', 'Amot mot2', '2', 1100); // nouveau mot → nouveau pas
        component.undo();
        expect((last()[0] as TextBlock).text).toBe('Amot '); // 1er undo : retire « mot2 »
        component.undo();
        expect((last()[0] as TextBlock).text).toBe('A'); // 2e undo : retire « mot + espace »
      });

      it('TB5.3 une pause (timer) scelle la salve : deux undo distincts de part et d\'autre (D2)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'A', marks: [] }]);
        component.now = () => clock;
        let sealCb: (() => void) | undefined;
        component.scheduleSeal = (cb) => {
          sealCb = cb;
          return () => {};
        };
        typeKey('b1', 'Aa', 'a', 1000);
        clock = 3000;
        sealCb?.(); // la pause (>= 500 ms) échoit → le timer scelle
        typeKey('b1', 'Aab', 'b', 3000);
        component.undo();
        expect((last()[0] as TextBlock).text).toBe('Aa'); // la pause a coupé la salve
        expect(component.canUndo()).toBe(true); // un pas subsiste sous la salve
      });

      it('TB5.4 une frappe après une commande = pas distinct : le 1er undo retire la frappe, le 2e la commande (D8)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold'); // commande
        component.now = () => clock;
        typeKey('b1', 'Bonjour!', '!', 1000); // frappe → nouveau pas
        component.undo(); // retire la frappe
        expect((last()[0] as TextBlock).text).toBe('Bonjour');
        expect(component.canUndo()).toBe(true); // la commande reste annulable
      });

      it('TB5.5 undo pendant une salve ouverte ramène à l\'état d\'avant la salve (granularité D1)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'ab', marks: [] }]);
        component.now = () => clock;
        typeKey('b1', 'abX', 'X', 1000);
        typeKey('b1', 'abXY', 'Y', 1100); // salve non close (pas de pause ni séparateur)
        component.undo(); // EditHistory.undo scelle d'abord, puis rembobine
        expect((last()[0] as TextBlock).text).toBe('ab');
      });

      it('TB5.6 branchement (Q4) : onInput transmet now() et isBoundary à recordTyping', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'A', marks: [] }]);
        component.now = () => clock;
        const spy = vi.spyOn(component['history'], 'recordTyping');
        typeKey('b1', 'Aa', 'a', 1000); // caractère normal → non-frontière
        typeKey('b1', 'Aa ', ' ', 1200); // espace → frontière
        expect(spy).toHaveBeenNthCalledWith(1, expect.anything(), 1000, false);
        expect(spy).toHaveBeenNthCalledWith(2, expect.anything(), 1200, true);
      });
    });

    // --- Groupe 6 — Cohérence du cycle & absence d'effet de bord (US5) -------
    describe('Groupe 6 — cohérence & nettoyage', () => {
      it('TB6.1 undo() re-peint comme commit : après undo le DOM égale le rendu du modèle restauré (US5)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        component.undo();
        expect(editorEl().innerHTML).toBe('<p data-block-id="b1">Bonjour</p>');
      });

      it('TB6.2 undo()/redo() hors de tout historique utile sont sans effet (robustesse)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        const count = emitted.length;
        const html = editorEl().innerHTML;
        expect(() => {
          component.undo();
          component.redo();
        }).not.toThrow();
        expect(emitted.length).toBe(count);
        expect(editorEl().innerHTML).toBe(html);
      });

      it('TB6.3 timer nettoyé à la destruction : une échéance de pause en attente ne rappelle pas seal() (DB7)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'A', marks: [] }]);
        component.now = () => clock;
        let sealCb: (() => void) | undefined;
        let cancelled = false;
        component.scheduleSeal = (cb) => {
          sealCb = cb;
          return () => {
            cancelled = true;
          };
        };
        const sealSpy = vi.spyOn(component['history'], 'seal');
        typeKey('b1', 'Aa', 'a', 1000); // arme le timer de pause
        fixture.destroy();
        expect(cancelled).toBe(true); // le timer a été annulé au DestroyRef
        expect(() => sealCb?.()).not.toThrow(); // une échéance obsolète est inoffensive
        expect(sealSpy).not.toHaveBeenCalled(); // pas de seal() sur un composant détruit
      });
    });
  });

  // ==========================================================================
  // Undo/Redo — garde anti-echo & reset de l'historique (Lot C)
  // Réf : .agent/UNDO_REDO/PLAN_TESTS_RTE_RELOAD_GUARD.md (validé 2026-09-20), cas TC1–TC4.
  // TDD boîte noire : on monte le vrai composant, on crée un historique via les points d'entrée du
  // Lot B (commande / frappe), puis on RÉINJECTE dans l'input `blocks` soit la MÊME référence que
  // celle émise (echo de blocksChange), soit une NOUVELLE référence (vrai (re)chargement de note).
  // On observe les signaux canUndo()/canRedo(), le résultat d'undo()/redo() (last()/emitted.length,
  // DOM restauré) et un espion léger sur component['history'].reset (Q4) pour pincer la branche de
  // garde. L'algèbre de l'historique (Lot A) et le câblage commit/onInput (Lot B) ne sont pas re-testés.
  //
  // Cœur du lot (R1) : la garde d'identité `incoming === model()` distingue l'echo (ne rien faire)
  // du (re)chargement (reset + syncButtons). Voir DC1–DC7 + arbitrages Q1–Q5 du plan.
  // ==========================================================================
  describe('Undo/Redo — garde anti-echo & reset (Lot C)', () => {
    /** Horloge injectée partagée (seam Q2/DB3), pour les salves de frappe de TC1.3. */
    let clock = 0;

    /**
     * Simule le parent renvoyant l'emit dans `blocks` (echo) : réinjecte la **même référence** que
     * le dernier `blocksChange.emit` (`last()`), qui — par construction du cycle Lot B — est
     * exactement `model()`. `detectChanges()` rejoue l'effect de synchro, qui doit alors détecter
     * `incoming === model()` (echo) et **ne pas** réinitialiser l'historique (Q1 figé). C'est le
     * mécanisme R1 du plan §2.
     */
    function echoBack(): void {
      fixture.componentRef.setInput('blocks', last());
      fixture.detectChanges();
    }

    /**
     * Simule une frappe dans le bloc `id` (comme le ferait le navigateur) : mute le texte du DOM puis
     * dispatche un `InputEvent` portant `data` (dernier caractère → dérive `isBoundary`), après avoir
     * positionné l'horloge injectée à `at`. Aligné sur le helper `typeKey` du Lot B.
     */
    function typeKey(id: string, text: string, data: string | null, at: number): void {
      clock = at;
      blockEl(id).textContent = text;
      editorEl().dispatchEvent(new InputEvent('input', { bubbles: true, data }));
    }

    // --- Groupe 1 — Echo : l'historique SURVIT (R1, US6) — cœur du Lot C -----
    describe('Groupe 1 — echo : historique préservé', () => {
      it('TC1.1 echo après une commande n\'efface pas l\'historique : canUndo() reste vrai et undo() ré-émet le modèle d\'avant le gras (DC2/R1)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        expect(component.canUndo()).toBe(true);
        echoBack(); // réinjecte last() = model() → doit être reconnu comme echo (pas de reset)
        expect(component.canUndo()).toBe(true);
        component.undo();
        expect((last()[0] as TextBlock).marks).toEqual([]);
      });

      it('TC1.2 echo n\'appelle pas history.reset (branche de garde côté echo, Q4)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        // Espion posé APRÈS le setBlocks initial (l'amorçage eager du (re)chargement est déjà passé) :
        // ni la commande (DC7 : pas de double seed) ni l'echo ne doivent rappeler reset.
        const resetSpy = vi.spyOn(component['history'], 'reset');
        selectInBlock('b1', 0, 3);
        component.applyMark('bold');
        echoBack();
        expect(resetSpy).not.toHaveBeenCalled();
      });

      it('TC1.3 echo après une salve de frappe préserve la salve : canUndo() reste vrai et un undo() retire toute la salve (DC2/R1)', () => {
        setBlocks([{ id: 'b1', kind: 'text', text: 'ab', marks: [] }]);
        component.now = () => clock;
        typeKey('b1', 'abX', 'X', 1000);
        typeKey('b1', 'abXY', 'Y', 1200);
        typeKey('b1', 'abXYZ', 'Z', 1400);
        expect(component.canUndo()).toBe(true);
        echoBack();
        expect(component.canUndo()).toBe(true);
        component.undo();
        expect((last()[0] as TextBlock).text).toBe('ab'); // toute la salve retirée
      });
    });

    // --- Groupe 2 — (Re)chargement réel : l'historique est RÉINITIALISÉ ------
    describe('Groupe 2 — (re)chargement : historique réinitialisé', () => {
      it('TC2.1 rechargement (nouvelle référence) vide passé & futur : canUndo() = canRedo() = false (US6, D7, DC3)', () => {
        setBlocks([{ id: 'a1', kind: 'text', text: 'Note A', marks: [] }]);
        selectInBlock('a1', 0, 4);
        component.applyMark('bold');
        expect(component.canUndo()).toBe(true);
        setBlocks([{ id: 'b1', kind: 'text', text: 'Note B', marks: [] }]); // autre note
        expect(component.canUndo()).toBe(false);
        expect(component.canRedo()).toBe(false);
      });

      it('TC2.2 après rechargement, undo() est sans effet : l\'ancienne note n\'est plus atteignable (D7, DC3)', () => {
        setBlocks([{ id: 'a1', kind: 'text', text: 'Note A', marks: [] }]);
        selectInBlock('a1', 0, 4);
        component.applyMark('bold');
        setBlocks([{ id: 'b1', kind: 'text', text: 'Note B', marks: [] }]);
        const n = emitted.length;
        component.undo();
        expect(emitted.length).toBe(n); // aucune émission parasite
        expect(editorEl().innerHTML).toContain('Note B');
        expect(editorEl().innerHTML).not.toContain('Note A');
      });

      it('TC2.3 rechargement après un undo purge aussi le futur : canRedo() redevient faux et redo() sans effet (D7, DC3)', () => {
        setBlocks([{ id: 'a1', kind: 'text', text: 'Note A', marks: [] }]);
        selectInBlock('a1', 0, 4);
        component.applyMark('bold');
        component.undo();
        expect(component.canRedo()).toBe(true);
        setBlocks([{ id: 'b1', kind: 'text', text: 'Note B', marks: [] }]);
        expect(component.canRedo()).toBe(false);
        const n = emitted.length;
        component.redo();
        expect(emitted.length).toBe(n);
      });

      it('TC2.4 rechargement appelle history.reset une fois avec le contenu rechargé et selection null (branche de garde côté rechargement, Q4)', () => {
        setBlocks([{ id: 'a1', kind: 'text', text: 'Note A', marks: [] }]);
        selectInBlock('a1', 0, 4);
        component.applyMark('bold'); // historique non vide
        const resetSpy = vi.spyOn(component['history'], 'reset');
        const reloaded: NoteBlock[] = [{ id: 'b1', kind: 'text', text: 'Note B', marks: [] }];
        setBlocks(reloaded); // nouvelle référence → vrai rechargement
        expect(resetSpy).toHaveBeenCalledTimes(1);
        expect(resetSpy).toHaveBeenCalledWith({ model: reloaded, selection: null });
      });
    });

    // --- Groupe 3 — Seed propre : note rechargée annulable dès sa 1re action -
    describe('Groupe 3 — seed propre', () => {
      it('TC3.1 sur la note rechargée, la 1re action est annulable et undo ramène la note telle que rechargée ; canUndo() redevient faux (DC4)', () => {
        setBlocks([{ id: 'a1', kind: 'text', text: 'Note A', marks: [] }]);
        selectInBlock('a1', 0, 4);
        component.applyMark('bold');
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]); // rechargement → reset
        selectInBlock('b1', 0, 3);
        component.applyMark('bold'); // 1re action sur la note rechargée
        expect(component.canUndo()).toBe(true);
        component.undo();
        const restored = last()[0] as TextBlock;
        expect(restored.marks).toEqual([]); // ramène [B] tel que rechargé (sans gras)
        expect(restored.text).toBe('Bonjour');
        expect(restored.id).toBe('b1');
        expect(component.canUndo()).toBe(false); // au pas initial rechargé
      });
    });

    // --- Groupe 4 — Premier chargement (initial, Q2 = inclus) ----------------
    describe('Groupe 4 — premier chargement', () => {
      it('TC4.1 le tout premier setBlocks amorce sans passé : canUndo() = canRedo() = false avant et après (Q2)', () => {
        expect(component.canUndo()).toBe(false);
        expect(component.canRedo()).toBe(false);
        setBlocks([{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }]);
        expect(component.canUndo()).toBe(false);
        expect(component.canRedo()).toBe(false);
      });
    });
  });
});
