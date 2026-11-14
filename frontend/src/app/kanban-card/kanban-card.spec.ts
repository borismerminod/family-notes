import { ComponentFixture, TestBed } from '@angular/core/testing';

import { KanbanCardPanel } from './kanban-card';
import { KanbanCard, Note } from '../core/models';

/**
 * @file kanban-card.spec.ts
 * @description Black-box TDD tests for the card panel of a kanban column.
 *
 * Expected behaviour: `.agent/KANBAN/EDITION_CARTES/PLAN_TESTS_KANBAN_CARTES.md`, groups 20 to 22
 * (cases T20.1 to T22.7, effects E115 to E126), and batch `F` of
 * `.agent/KANBAN/EDITION_CARTES/APPROCHE_KANBAN_EDITION_CARTES.md` (decisions `D-C21`, `D-C23`,
 * `D-C24`, `D-C28`, `D-C30`, `D-C36`, `D-C37`).
 *
 * The component is purely presentational (`D-C21`, in the spirit of `D-L23`): it injects no
 * service, holds no router and decides nothing. It is therefore mounted alone, fed a card, a
 * `selected` state and a `moveMode` through its inputs, and judged on what it displays and what it
 * emits. Everything it does not do is part of the contract too: no text cleaning, no fallback on
 * « Sans titre » (`D-C30`), no confirmation popup, no note picker (`D-C36`), no deletion and no
 * navigation (`D-C37`) — those live in `KanbanEditor`, in a single place.
 *
 * DOM contract — **proposed here**, §9 of the plan being unwritten for this target when this file
 * was built, and `D-C43` having left the contract of the cards to `plan_test`. This follows the
 * precedent of `kanban-column.spec.ts`, whose selectors were proposed in its header and raised
 * into §9.2 of the previous plan on 2026-11-11 (`R8` of `REVUE_KANBAN_EDITION_LISTES.md`). The
 * template must honour them:
 *
 * | Selector | Role | Cases |
 * |---|---|---|
 * | `.kanban-card` | Root of the panel | T20.4, T20.5, T22.3 |
 * | `.kanban-card.selected` | Marker of the selected card (`D-C23`) | T20.5 |
 * | `.card-body` | Touch target of the card at rest: opens the text entry out of move mode, asks for the selection in move mode | T21.1, T22.1, T22.2 |
 * | `.card-text` | The displayed text of the card | T20.1, T20.2, T20.3, T21.4 |
 * | `.card-note-title` | Title of the referenced note, link-looking control (`D-C37`); absent when the card carries no reference | T20.3, T20.4, T22.5, T22.6 |
 * | `.btn-remove-card` | The trash of this card (`D-C28`); absent in move mode | T22.3, T22.4 |
 * | `.card-text-input` | In-place text entry (`input[type="text"]`), prefilled (`D-C24`) | T21.1 to T21.4, T22.2 |
 * | `.btn-text-confirm` | Validates the text entry | T21.2, T21.3 |
 * | `.btn-text-cancel` | Gives the text entry up | T21.4 |
 * | `.btn-card-note` | The reference control, carried by the text entry (`D-C36`) | T22.7 |
 *
 * Decisions taken here for lack of a plan contract, numbered `D-PC#` so as not to collide with the
 * `D-P#` of the column panel. They are the ones to raise into §7 and §9 of the plan, or to reverse
 * before the component is written:
 * - **D-PC1** — the displayed text and the text entry **take turns**, as the name and the rename
 *   field of a column do (`D-P2`): opening the entry hides `.card-body`, which is what T21.4 reads
 *   back once the entry is given up.
 * - **D-PC2** — the entry is validated and given up by **two buttons** `✓` / `✗`, and not by the
 *   keyboard, for the reason `D-P1` already gave: `Échap` and `Entrée` are out of reach of an
 *   Android soft keyboard.
 * - **D-PC3** — the reference control `.btn-card-note` lives **inside** the entry (`D-C36`), so
 *   T22.7 opens the entry before touching it. The card at rest keeps two touch targets, its body
 *   and its trash.
 * - **D-PC4** — the selected card is distinguished by the class `selected` on its root, following
 *   `.category-list li.selected` of `CategorySelector`, the only selection marker the project
 *   already has.
 * - **D-PC5** — « nothing more than its text » (`E117`) is read as: no `.card-note-title`, and no
 *   text beyond that of the card anywhere in the panel. The trash is an icon **without text**, as
 *   `.btn-remove-column` is, so the panel's whole text is the card's text.
 * - **D-PC6** — the note title is a `<button>`, not an `<a href>`: `D-C37` wants the look of a
 *   link and the behaviour of a request, and T22.6 holds the panel to it.
 */

/** A note two cards may reference, and whose title the panel displays (`D-C3`). */
const NOTE_COURSES: Note = {
  id: 'note-courses',
  title: 'Liste de courses',
  category: null,
  blocks: [],
  updatedAt: '2026-11-10T08:00:00.000Z',
};

/** The card fed to the panel in most cases: a text, and no reference. */
const CARD_PAIN: KanbanCard = {
  id: 'card-pain',
  text: 'Acheter du pain',
  note: null,
  position: 0,
};

/**
 * The card the editor substitutes for the previous one. Its text and identifier both differ: the
 * panel must follow its input rather than an internal copy made on construction (`E115`).
 */
const CARD_MENAGE: KanbanCard = {
  id: 'card-menage',
  text: 'Faire le ménage',
  note: null,
  position: 1,
};

/** A card carrying a reference, the one that makes a card more than a sticky note (`US1`). */
const CARD_RENTREE: KanbanCard = {
  id: 'card-rentree',
  text: 'Préparer la rentrée',
  note: NOTE_COURSES,
  position: 2,
};

/**
 * Text a card is stored under when the typed text is empty (`D-C30`). The panel must **not** know
 * it: the fallback belongs to the editor, and T21.3 checks the panel emits the empty text instead.
 */
const FALLBACK_CARD_TEXT = 'Sans titre';

describe('KanbanCardPanel (le composant carte)', () => {
  let fixture: ComponentFixture<KanbanCardPanel>;
  let el: HTMLElement;
  let textEmissions: string[];
  let noteOpenEmissions: string[];
  let noteRequestCount: number;
  let removeRequestCount: number;
  let selectionRequestCount: number;

  /**
   * Mounts the panel on a card, unselected and out of move mode, and starts listening to what it
   * emits. The two board states are set explicitly rather than left to a default, the card being
   * the only input the panel owns nothing of.
   * @param card The card given to the panel's input.
   */
  async function setup(card: KanbanCard): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [KanbanCardPanel],
    }).compileComponents();

    fixture = TestBed.createComponent(KanbanCardPanel);
    el = fixture.nativeElement as HTMLElement;

    textEmissions = [];
    noteOpenEmissions = [];
    noteRequestCount = 0;
    removeRequestCount = 0;
    selectionRequestCount = 0;

    const panel = fixture.componentInstance;
    panel.textChanged.subscribe((typedText: string) => {
      textEmissions.push(typedText);
    });
    panel.noteOpenRequested.subscribe((noteId: string) => {
      noteOpenEmissions.push(noteId);
    });
    panel.noteRequested.subscribe(() => {
      noteRequestCount = noteRequestCount + 1;
    });
    panel.removeRequested.subscribe(() => {
      removeRequestCount = removeRequestCount + 1;
    });
    panel.selectionRequested.subscribe(() => {
      selectionRequestCount = selectionRequestCount + 1;
    });

    fixture.componentRef.setInput('card', card);
    fixture.componentRef.setInput('selected', false);
    fixture.componentRef.setInput('moveMode', false);
  }

  /** Triggers a render, lets the component settle, then refreshes the DOM. */
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Replaces the card on the input, the way the editor does when it retypes or renumbers its
   * composition, then refreshes the DOM.
   * @param card The card that takes the place of the previous one.
   */
  async function replaceCard(card: KanbanCard): Promise<void> {
    fixture.componentRef.setInput('card', card);
    await render();
  }

  /**
   * Tells the panel whether the editor holds it as the selected card of the board (`D-C23`), then
   * refreshes the DOM.
   * @param selected Whether this card is the selected one.
   */
  async function setSelected(selected: boolean): Promise<void> {
    fixture.componentRef.setInput('selected', selected);
    await render();
  }

  /**
   * Tells the panel whether the board is in move mode (`D-C23`), then refreshes the DOM.
   * @param moveMode Whether the move mode is active.
   */
  async function setMoveMode(moveMode: boolean): Promise<void> {
    fixture.componentRef.setInput('moveMode', moveMode);
    await render();
  }

  /**
   * Reads the text of an element, ignoring how the template lays it out: non-breaking spaces
   * become plain ones, and runs of whitespace collapse to a single space.
   * @param selector The CSS selector looked up in the panel template.
   * @returns The normalized text, trimmed, or an empty string when the element is absent.
   */
  function normalizedTextOf(selector: string): string {
    const found = el.querySelector(selector);
    const raw = found?.textContent ?? '';
    return raw.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Clicks an element of the panel, then waits for it to finish updating.
   * @param selector The CSS selector of the element to click.
   * @throws When no element matches, which would signal an unexpected template.
   */
  async function clickOn(selector: string): Promise<void> {
    const target = el.querySelector<HTMLElement>(selector);
    if (target === null) {
      throw new Error(`Aucun élément « ${selector} » à cliquer.`);
    }
    target.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Gives the in-place text entry.
   * @returns The field, or `null` as long as the entry is not open.
   */
  function textInput(): HTMLInputElement | null {
    return el.querySelector<HTMLInputElement>('.card-text-input');
  }

  /**
   * Types a text the way the user would, through the entry field. Going through the field rather
   * than the component keeps the test black-box: the binding is part of what is checked.
   * @param typedText The text to type, kept as is — trailing spaces included.
   * @throws When the text entry is not open, which would signal an unexpected state.
   */
  async function typeCardText(typedText: string): Promise<void> {
    const field = textInput();
    if (field === null) {
      throw new Error('Aucune saisie de texte ouverte à remplir.');
    }
    field.value = typedText;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Says whether the panel marks itself as the selected card (`D-PC4`).
   * @returns `true` when the root carries the selection marker.
   */
  function isMarkedSelected(): boolean {
    const markedRoot = el.querySelector('.kanban-card.selected');
    return markedRoot !== null;
  }

  // ---------------------------------------------------------------------------
  // Groupe 20 — Affichage de la carte
  // ---------------------------------------------------------------------------
  describe('Affichage de la carte', () => {
    it('T20.1 affiche le texte de la carte reçue', async () => {
      await setup(CARD_PAIN);
      await render();

      const displayedText = normalizedTextOf('.card-text');

      expect(displayedText).toBe(CARD_PAIN.text);
    });

    it('T20.2 change le texte affiché quand une nouvelle carte arrive en entrée : aucune copie interne', async () => {
      await setup(CARD_PAIN);
      await render();

      const textBeforeReplacement = normalizedTextOf('.card-text');

      await replaceCard(CARD_MENAGE);

      const textAfterReplacement = normalizedTextOf('.card-text');

      expect(textBeforeReplacement).toBe(CARD_PAIN.text);
      expect(textAfterReplacement).toBe(CARD_MENAGE.text);
    });

    it('T20.3 affiche le titre de la note portée par la carte, distinctement de son texte', async () => {
      await setup(CARD_RENTREE);
      await render();

      const displayedText = normalizedTextOf('.card-text');
      const displayedNoteTitle = normalizedTextOf('.card-note-title');
      const textElement = el.querySelector('.card-text');
      const noteTitleElement = el.querySelector('.card-note-title');

      expect(displayedText).toBe(CARD_RENTREE.text);
      expect(displayedNoteTitle).toBe(NOTE_COURSES.title);
      expect(noteTitleElement).not.toBeNull();
      expect(noteTitleElement).not.toBe(textElement);
    });

    it('T20.4 n’affiche que son texte quand la carte ne porte aucune référence : ni emplacement vide, ni mention « aucune note »', async () => {
      await setup(CARD_PAIN);
      await render();

      const noteTitleElement = el.querySelector('.card-note-title');
      const wholePanelText = normalizedTextOf('.kanban-card');

      expect(noteTitleElement).toBeNull();
      expect(wholePanelText).toBe(CARD_PAIN.text);
    });

    it('T20.5 distingue la carte sélectionnée, et ne distingue pas une carte non sélectionnée', async () => {
      await setup(CARD_PAIN);
      await render();

      const markedWhileUnselected = isMarkedSelected();

      await setSelected(true);

      const markedWhileSelected = isMarkedSelected();

      expect(markedWhileUnselected).toBe(false);
      expect(markedWhileSelected).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 21 — Saisie du texte
  // ---------------------------------------------------------------------------
  describe('Saisie du texte', () => {
    it('T21.1 ouvre, en touchant le corps hors mode déplacement, une saisie pré-remplie du texte courant', async () => {
      await setup(CARD_PAIN);
      await render();

      const fieldBeforeTouch = textInput();

      await clickOn('.card-body');

      const fieldAfterTouch = textInput();
      const prefilledValue = fieldAfterTouch?.value;

      expect(fieldBeforeTouch).toBeNull();
      expect(fieldAfterTouch).not.toBeNull();
      expect(prefilledValue).toBe(CARD_PAIN.text);
    });

    it('T21.2 émet le texte tapé tel quel à la validation, espaces de bord compris : le nettoyage appartient à l’éditeur', async () => {
      await setup(CARD_PAIN);
      await render();

      const typedTextWithSpaces = '   Acheter  du  lait   ';

      await clickOn('.card-body');
      await typeCardText(typedTextWithSpaces);
      await clickOn('.btn-text-confirm');

      expect(textEmissions).toEqual([typedTextWithSpaces]);
    });

    it('T21.3 émet une saisie vide telle quelle, sans repli sur « Sans titre »', async () => {
      await setup(CARD_PAIN);
      await render();

      await clickOn('.card-body');
      await typeCardText('');
      await clickOn('.btn-text-confirm');

      expect(textEmissions).toEqual(['']);
      expect(textEmissions).not.toContain(FALLBACK_CARD_TEXT);
      expect(textEmissions).not.toContain(CARD_PAIN.text);
    });

    it('T21.4 n’émet rien et restaure le texte affiché quand la saisie est abandonnée après avoir tapé', async () => {
      await setup(CARD_PAIN);
      await render();

      await clickOn('.card-body');
      await typeCardText('Brouillon abandonné');
      await clickOn('.btn-text-cancel');

      const fieldAfterCancel = textInput();
      const displayedText = normalizedTextOf('.card-text');

      expect(textEmissions).toEqual([]);
      expect(fieldAfterCancel).toBeNull();
      expect(displayedText).toBe(CARD_PAIN.text);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 22 — Commandes de la carte
  // ---------------------------------------------------------------------------
  describe('Commandes de la carte', () => {
    it('T22.1 émet une demande de sélection quand on touche le corps en mode déplacement', async () => {
      await setup(CARD_PAIN);
      await render();
      await setMoveMode(true);

      await clickOn('.card-body');

      expect(selectionRequestCount).toBe(1);
    });

    it('T22.2 n’ouvre pas la saisie quand on touche le corps en mode déplacement', async () => {
      await setup(CARD_PAIN);
      await render();
      await setMoveMode(true);

      await clickOn('.card-body');

      const fieldAfterTouch = textInput();

      expect(fieldAfterTouch).toBeNull();
      expect(textEmissions).toEqual([]);
    });

    it('T22.3 n’émet qu’une demande de retrait à la corbeille : aucune popup, aucune suppression', async () => {
      await setup(CARD_PAIN);
      await render();

      await clickOn('.btn-remove-card');

      const panelStillShown = el.querySelector('.kanban-card');
      const displayedText = normalizedTextOf('.card-text');
      const confirmDialogShown = el.querySelector('app-confirm-dialog, .confirm-backdrop');

      expect(removeRequestCount).toBe(1);
      expect(textEmissions).toEqual([]);
      expect(panelStillShown).not.toBeNull();
      expect(displayedText).toBe(CARD_PAIN.text);
      expect(confirmDialogShown).toBeNull();
    });

    it('T22.4 ne rend pas la corbeille en mode déplacement, alors qu’elle est là au repos', async () => {
      await setup(CARD_PAIN);
      await render();

      const trashOutOfMoveMode = el.querySelector('.btn-remove-card');

      await setMoveMode(true);

      const trashInMoveMode = el.querySelector('.btn-remove-card');

      expect(trashOutOfMoveMode).not.toBeNull();
      expect(trashInMoveMode).toBeNull();
    });

    it('T22.5 émet une demande d’ouverture portant l’identifiant de la note quand on touche son titre', async () => {
      await setup(CARD_RENTREE);
      await render();

      await clickOn('.card-note-title');

      expect(noteOpenEmissions).toEqual([NOTE_COURSES.id]);
    });

    it('T22.6 ne navigue pas en touchant le titre de la note : un contrôle d’apparence de lien, pas un lien', async () => {
      await setup(CARD_RENTREE);
      await render();

      await clickOn('.card-note-title');

      const noteTitleTagName = el.querySelector('.card-note-title')?.tagName;
      const navigatingAnchor = el.querySelector('a[href]');

      expect(noteTitleTagName).toBe('BUTTON');
      expect(navigatingAnchor).toBeNull();
      expect(noteOpenEmissions).toEqual([NOTE_COURSES.id]);
    });

    it('T22.7 émet une demande de choix de note au contrôle de référence, sans ouvrir de popup', async () => {
      await setup(CARD_PAIN);
      await render();

      await clickOn('.card-body');
      await clickOn('.btn-card-note');

      const notePickerShown = el.querySelector('app-note-picker, .note-picker-backdrop');

      expect(noteRequestCount).toBe(1);
      expect(notePickerShown).toBeNull();
    });
  });
});
