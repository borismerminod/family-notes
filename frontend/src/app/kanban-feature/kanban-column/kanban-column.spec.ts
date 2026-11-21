import { DebugElement } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { KanbanColumnPanel } from './kanban-column';
import { KanbanCardPanel } from '../kanban-card/kanban-card';
import { KanbanCard, KanbanColumn, Note } from '../../core/models';
import { MoveDirection } from '../../core/services/kanban/kanban-composition';

/**
 * @file kanban-column.spec.ts
 * @description Black-box TDD tests for the column panel of a kanban board.
 *
 * Expected behaviour: `.agent/KANBAN/EDITION_LISTES/PLAN_TESTS_KANBAN_EDITION_LISTES.md`, group 5
 * (cases T5.1 to T5.11, effects E29 to E34), and batch `E` of
 * `.agent/KANBAN/EDITION_LISTES/APPROCHE_KANBAN_EDITION_LISTES.md` (decisions `D-L18`, `D-L21`,
 * `D-L22`, `D-L23`).
 *
 * The component is purely presentational (`D-L23`): it injects no service, holds no router and
 * decides nothing. It is therefore mounted alone, fed a column through its input, and judged on
 * what it displays and what it emits. Everything it does not do is part of the contract too: no
 * name cleaning, no fallback on « Sans titre », no confirmation popup and no deletion — those
 * live in `KanbanEditor`, in a single place.
 *
 * DOM contract — **§9.2 of the plan**, which these selectors are the copy of. They were proposed
 * here first, the plan's contract section being unwritten when this file was built, and were
 * raised into it on 2026-11-11 (`R8` of `REVUE_KANBAN_EDITION_LISTES.md`). The template must
 * honour them:
 *
 * | Selector | Role | Cases |
 * |---|---|---|
 * | `.kanban-column` | Root of the panel | T5.11 |
 * | `.column-header` | Header: the name and the trash | — |
 * | `.column-name` | The displayed name; touching it opens the rename field | T5.1, T5.2, T5.4, T5.10, T5.11 |
 * | `.column-name-input` | In-place rename field (`input[type="text"]`), prefilled | T5.4 to T5.10 |
 * | `.btn-rename-confirm` | Validates the rename | T5.6, T5.7, T5.8 |
 * | `.btn-rename-cancel` | Gives the rename up | T5.9, T5.10 |
 * | `.btn-remove-column` | The trash of this column (`D-L23`) | T5.11 |
 * | `.column-cards` | Area the cards are rendered in (`D-C22`), vertically scrollable (`D-C27`) | T5.3, T23.1 |
 *
 * Decisions taken here for lack of a plan contract, and since confirmed — they are **§8.2 of the
 * plan** (`D-P1` → `D-P4`), raised into it on 2026-11-11:
 * - **D-P1** — the rename is validated and given up by **two buttons** `✓` / `✗` shown in the
 *   header while the field is open, and not by the keyboard: `Échap` is out of reach of an
 *   Android soft keyboard, whereas `ConfirmDialog` can afford it on a desktop browser.
 * - **D-P2** — the displayed name and the rename field **take turns**: opening the field hides
 *   `.column-name`, which is what T5.10 reads back once the rename is given up.
 * - **D-P3** — the outputs are `renamed` (the typed text) and `removeRequested` (nothing), as the
 *   class diagram of the approach names them. They are the public API of a presentational
 *   component, hence what these tests listen to.
 * - **D-P4** — « the cards area is empty » is read as **no child element and no text**: the
 *   anchor of the next batch, not a legend to be rewritten the moment a first card lands.
 *
 * ---
 *
 * **Batch `EDITION_CARTES` — groups 23 to 26** (cases T23.1 to T26.5, effects E127 to E136), from
 * `.agent/KANBAN/EDITION_CARTES/PLAN_TESTS_KANBAN_CARTES.md` and batch `H` of
 * `.agent/KANBAN/EDITION_CARTES/APPROCHE_KANBAN_EDITION_CARTES.md` (decisions `D-C22`, `D-C23`,
 * `D-C25`, `D-C26`, `D-C27`).
 *
 * The panel now renders one `KanbanCardPanel` per card of the column (`D-C22`), relays what those
 * cards emit, and carries the four card arrows plus the add and « déplacer » buttons. It stays
 * presentational: the selection and the move mode are states of the **whole board**, fed through
 * inputs, and the availability of the ← → arrows is fed as well, the column ignoring its own rank
 * in the board (`D-C25`). It decides the ↑ ↓ ones alone, because it holds its cards.
 *
 * DOM contract of this batch — **proposed here**, §9 of the plan being unwritten, following what
 * `kanban-card.spec.ts` did for the cards:
 *
 * | Selector | Role | Cases |
 * |---|---|---|
 * | `.empty.no-cards` | Empty state of a column without cards, distinct from the `.empty.no-columns` of the board (`E128`) | T23.2 |
 * | `.btn-card-move` | Family of the four card arrows; none is rendered outside the conditions of `D-C26` | T24.1 to T25.5 |
 * | `.btn-card-move-up` · `.btn-card-move-down` | ↑ ↓, availability decided by the column itself (`D-C25`) | T25.1, T25.2, T25.5, T26.2 |
 * | `.btn-card-move-left` · `.btn-card-move-right` | ← →, availability received through the inputs (`D-C25`) | T25.3, T25.4, T25.5, T26.2 |
 * | `.btn-add-card` | Adds a card to this column, rendered even when it is empty (`E135`) | T26.3, T26.4 |
 * | `.btn-toggle-move-mode` | The « déplacer » button, which emits a toggle (`E136`) | T26.5 |
 *
 * Decisions taken here for lack of a plan contract, continuing the `D-P#` series of this file:
 * - **D-P5** — the card arrows carry their own `.btn-card-move` family, and **not** the
 *   `.btn-move-left` / `.btn-move-right` of the editor, which already name the arrows that move a
 *   **column** (`D-L23`). Telling the two sets apart is the very point of `D-C26`, and a shared
 *   selector would make the editor's own cases ambiguous.
 * - **D-P6** — the empty state of a column is read as the element `.empty.no-cards` carrying some
 *   text, following the `.empty.no-columns` of the editor, the only empty state the project
 *   already has. Its **wording** is left to the template, the plan fixing none.
 * - **D-P7** — that empty state is **not required** to sit inside `.column-cards`. Batch `H` says
 *   the column shows it « there », but T5.3 holds `.column-cards` to no child and no text for a
 *   column whose `cards` is absent, and `column().cards ?? []` makes such a column
 *   indistinguishable from an empty one. Rendering the empty state as a **sibling** of
 *   `.column-cards` satisfies both cases; see the open points below.
 * - **D-P8** — an unavailable arrow is **disabled** and not removed (`E132`, `E133`, T25.5),
 *   following the `.btn-move-left[disabled]` of the editor at the ends of the board.
 * - **D-P9** — `cardTextChanged` emits `{ cardId, text }` — the `CardTextChange` of the class
 *   diagram. That type lives nowhere yet, so this file declares the **shape** it expects rather
 *   than importing a name whose home the plan does not fix.
 * - **D-P10** — what a card emits is injected **on the output of the child panel**, and not by
 *   clicking inside it: `C157` is literally « a card emits one of its events », and going through
 *   the card's own DOM would make these cases depend on how far `KanbanCardPanel` has been
 *   implemented. The arrows and the two buttons, which belong to **this** panel, are clicked.
 *
 * Open points raised to the supervisor, and **not** decided here:
 * - **T5.3 against `E128`** — see `D-P7`. Should the empty state have to live inside
 *   `.column-cards`, T5.3 is the case to revise: « present and empty » was the anchor `D-L21` held
 *   for this very batch.
 * - **`cardNoteOpenRequested` carries the identifier of the *note***, not that of the card, which
 *   is what the class diagram and the `onNoteOpenRequested(noteId)` of the editor ask for
 *   (`D-C37`). The wording of `E134` — « labelled with the identifier of the card » — does not
 *   describe that one relay; T26.1 holds the panel to the class diagram.
 * - **The two inputs the cards receive** — `selected` and `moveMode` — are covered by no case of
 *   groups 23 to 26: nothing checks that the column hands the selection to the right card, nor the
 *   mode to all of them. `E148` covers the single selection, but on the editor.
 */

/** The column fed to the panel in most cases. */
const COLUMN_TO_DO: KanbanColumn = { id: 'col-a-faire', name: 'À faire', position: 0 };

/**
 * The column the editor substitutes for the previous one. Its name and identifier both differ:
 * the panel must follow its input rather than an internal copy made on construction.
 */
const COLUMN_IN_PROGRESS: KanbanColumn = { id: 'col-en-cours', name: 'En cours', position: 1 };

/**
 * Name a column is stored under when the typed name is empty (`D-L17`). The panel must **not**
 * know it: the fallback belongs to the editor (`D-L23`), and T5.8 checks the panel emits the
 * empty text instead.
 */
const FALLBACK_COLUMN_NAME = 'Sans titre';

/**
 * Shape this file expects on `cardTextChanged`: the `CardTextChange` of the class diagram of the
 * approach, which says which card had its text validated (`D-P9`). Declared here because the plan
 * does not say where that type lives.
 */
type ExpectedCardTextChange = {
  cardId: string;
  text: string;
};

/** A note one of the cards references, and whose identifier the panel relays as is (`D-C37`). */
const NOTE_COURSES: Note = {
  id: 'note-courses',
  title: 'Liste de courses',
  category: null,
  blocks: [],
  updatedAt: '2026-11-10T08:00:00.000Z',
};

/** Card at the **head** of the pile: the one that cannot go up (T25.1). */
const CARD_PAIN: KanbanCard = {
  id: 'card-pain',
  text: 'Acheter du pain',
  note: null,
  position: 0,
};

/**
 * Card in the **middle** of the pile, carrying a reference. Most cases of group 26 go through it:
 * a relay wired on the first card, or arrows wired on an end of the pile, would pass on any other.
 */
const CARD_MENAGE: KanbanCard = {
  id: 'card-menage',
  text: 'Faire le ménage',
  note: NOTE_COURSES,
  position: 1,
};

/** Card at the **tail** of the pile: the one that cannot go down (T25.2). */
const CARD_RENTREE: KanbanCard = {
  id: 'card-rentree',
  text: 'Préparer la rentrée',
  note: null,
  position: 2,
};

/** The three cards of the column, in the order of their positions. */
const CARDS_OF_COLUMN: KanbanCard[] = [CARD_PAIN, CARD_MENAGE, CARD_RENTREE];

/** The column of the `EDITION_CARTES` cases: the one of group 5, carrying its three cards. */
const COLUMN_WITH_CARDS: KanbanColumn = { ...COLUMN_TO_DO, cards: CARDS_OF_COLUMN };

/**
 * A column whose cards are **loaded and none** — `cards: []`, and not `undefined`: that is the
 * empty state of a column on the edit screen, the one `E128` describes, where `undefined` means
 * « cards not loaded » (`D-C4`).
 */
const COLUMN_WITHOUT_CARDS: KanbanColumn = { ...COLUMN_IN_PROGRESS, cards: [] };

/**
 * Identifier of a card of **another** column, the one the editor holds as selected in T24.4: the
 * panel must find none of its own cards under it.
 */
const SELECTED_CARD_OF_ANOTHER_COLUMN = 'card-dune-autre-colonne';

/** The four card arrows (`D-C26`), named apart from the column arrows of the editor (`D-P5`). */
const ARROW_UP = '.btn-card-move-up';
const ARROW_DOWN = '.btn-card-move-down';
const ARROW_LEFT = '.btn-card-move-left';
const ARROW_RIGHT = '.btn-card-move-right';

describe('KanbanColumnPanel (le composant colonne)', () => {
  let fixture: ComponentFixture<KanbanColumnPanel>;
  let el: HTMLElement;
  let renameEmissions: string[];
  let removeRequestCount: number;
  let cardSelectedEmissions: string[];
  let cardTextChangeEmissions: ExpectedCardTextChange[];
  let cardNoteRequestEmissions: string[];
  let cardNoteOpenRequestEmissions: string[];
  let cardRemoveRequestEmissions: string[];
  let cardMoveRequestEmissions: MoveDirection[];
  let addCardRequestCount: number;
  let moveModeToggleCount: number;

  /**
   * Mounts the panel on a column and starts listening to what it emits. The three board states
   * the panel owns nothing of — the selected card, the move mode and the availability of the side
   * moves — are set explicitly rather than left to a default: the column is the only input the
   * panel decides anything from (`D-C25`). At rest, nothing is selected, the board is out of move
   * mode, and both side moves are announced possible, so that each case sets only what it is
   * about.
   * @param column The column given to the panel's input.
   */
  async function setup(column: KanbanColumn): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [KanbanColumnPanel],
    }).compileComponents();

    fixture = TestBed.createComponent(KanbanColumnPanel);
    el = fixture.nativeElement as HTMLElement;

    renameEmissions = [];
    removeRequestCount = 0;
    cardSelectedEmissions = [];
    cardTextChangeEmissions = [];
    cardNoteRequestEmissions = [];
    cardNoteOpenRequestEmissions = [];
    cardRemoveRequestEmissions = [];
    cardMoveRequestEmissions = [];
    addCardRequestCount = 0;
    moveModeToggleCount = 0;

    const panel = fixture.componentInstance;
    panel.renamed.subscribe((typedName: string) => {
      renameEmissions.push(typedName);
    });
    panel.removeRequested.subscribe(() => {
      removeRequestCount = removeRequestCount + 1;
    });
    panel.cardSelected.subscribe((cardId: string) => {
      cardSelectedEmissions.push(cardId);
    });
    panel.cardTextChanged.subscribe((change: ExpectedCardTextChange) => {
      cardTextChangeEmissions.push(change);
    });
    panel.cardNoteRequested.subscribe((cardId: string) => {
      cardNoteRequestEmissions.push(cardId);
    });
    panel.cardNoteOpenRequested.subscribe((noteId: string) => {
      cardNoteOpenRequestEmissions.push(noteId);
    });
    panel.cardRemoveRequested.subscribe((cardId: string) => {
      cardRemoveRequestEmissions.push(cardId);
    });
    panel.cardMoveRequested.subscribe((direction: MoveDirection) => {
      cardMoveRequestEmissions.push(direction);
    });
    panel.addCardRequested.subscribe(() => {
      addCardRequestCount = addCardRequestCount + 1;
    });
    panel.moveModeToggled.subscribe(() => {
      moveModeToggleCount = moveModeToggleCount + 1;
    });

    fixture.componentRef.setInput('column', column);
    fixture.componentRef.setInput('selectedCardId', null);
    fixture.componentRef.setInput('moveMode', false);
    fixture.componentRef.setInput('canMoveCardLeft', true);
    fixture.componentRef.setInput('canMoveCardRight', true);
  }

  /** Triggers a render, lets the component settle, then refreshes the DOM. */
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Replaces the column on the input, the way the editor does when it renumbers or renames its
   * composition, then refreshes the DOM.
   * @param column The column that takes the place of the previous one.
   */
  async function replaceColumn(column: KanbanColumn): Promise<void> {
    fixture.componentRef.setInput('column', column);
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
    return raw.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
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
   * Gives the in-place rename field.
   * @returns The field, or `null` as long as the rename is not open.
   */
  function renameInput(): HTMLInputElement | null {
    return el.querySelector<HTMLInputElement>('.column-name-input');
  }

  /**
   * Types a name the way the user would, through the rename field. Going through the field rather
   * than the component keeps the test black-box: the binding is part of what is checked.
   * @param typedName The text to type, kept as is — trailing spaces included.
   * @throws When the rename field is not open, which would signal an unexpected state.
   */
  async function typeRenameName(typedName: string): Promise<void> {
    const field = renameInput();
    if (field === null) {
      throw new Error('Aucune saisie de renommage ouverte à remplir.');
    }
    field.value = typedName;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Lets the panel finish updating after something was emitted or set outside the DOM. */
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Puts the board in move mode, or takes it out, the way the editor does: the mode belongs to
   * the whole board and not to the column (`D-C23`).
   * @param active Whether the move mode is on.
   */
  async function setMoveMode(active: boolean): Promise<void> {
    fixture.componentRef.setInput('moveMode', active);
    await render();
  }

  /**
   * Tells the panel which card the editor holds as selected — possibly one of another column, or
   * none at all.
   * @param cardId Identifier of the selected card, or `null` when none is.
   */
  async function selectCard(cardId: string | null): Promise<void> {
    fixture.componentRef.setInput('selectedCardId', cardId);
    await render();
  }

  /**
   * Announces, the way the editor does, whether the selected card may leave this column towards
   * the left and towards the right: the column ignores its own rank in the board (`D-C25`).
   * @param leftPossible Whether the editor announces the move to the left as possible.
   * @param rightPossible Whether the editor announces the move to the right as possible.
   */
  async function announceSideMoves(leftPossible: boolean, rightPossible: boolean): Promise<void> {
    fixture.componentRef.setInput('canMoveCardLeft', leftPossible);
    fixture.componentRef.setInput('canMoveCardRight', rightPossible);
    await render();
  }

  /**
   * Puts the board in move mode with one card of this column selected: the only state in which
   * the arrows are rendered (`D-C26`).
   * @param cardId Identifier of the card the editor selects.
   */
  async function enterMoveModeOn(cardId: string): Promise<void> {
    await setMoveMode(true);
    await selectCard(cardId);
  }

  /**
   * Gives the card panels the column renders, in the order of the document.
   * @returns One instance per rendered card, empty when the column renders none.
   */
  function renderedCardPanels(): KanbanCardPanel[] {
    const found = fixture.debugElement.queryAll(By.directive(KanbanCardPanel));
    return found.map((reference: DebugElement): KanbanCardPanel => reference.componentInstance);
  }

  /**
   * Gives the panel the column rendered for one card, addressed by its identifier: the order of
   * the panels is what T23.1 is about, the other cases name the card they act on.
   * @param cardId Identifier of the card whose panel is wanted.
   * @returns The panel that received that card.
   * @throws When no rendered panel carries it, which would signal an unexpected rendering.
   */
  function cardPanelOf(cardId: string): KanbanCardPanel {
    const panels = renderedCardPanels();
    const found = panels.find((panel: KanbanCardPanel): boolean => panel.card().id === cardId);
    if (found === undefined) {
      throw new Error(`Aucune carte « ${cardId} » rendue par la colonne.`);
    }
    return found;
  }

  /**
   * Reads the texts displayed in the cards area, in the order of the document. It goes through
   * the DOM the card panels produce, that area being where the column renders them (`D-C22`).
   * @returns One text per rendered card, in order.
   */
  function renderedCardTexts(): string[] {
    const found = el.querySelectorAll('.column-cards app-kanban-card .card-text');
    const displayed = Array.from(found);
    return displayed.map((element: Element): string => (element.textContent ?? '').trim());
  }

  /**
   * Gives one card move arrow of the column.
   * @param selector CSS selector of the arrow, from the `.btn-card-move` family (`D-P5`).
   * @returns The arrow, or `null` when the column renders it not.
   */
  function moveArrow(selector: string): HTMLButtonElement | null {
    return el.querySelector<HTMLButtonElement>(selector);
  }

  /**
   * Gives every card move arrow the column renders, whatever its direction and its availability:
   * a disabled arrow is a rendered one (`D-P8`).
   * @returns The rendered arrows, empty when the column renders none.
   */
  function renderedMoveArrows(): HTMLButtonElement[] {
    const found = el.querySelectorAll<HTMLButtonElement>('.btn-card-move');
    return Array.from(found);
  }

  // ---------------------------------------------------------------------------
  // Groupe 5 — Afficher, renommer, demander le retrait
  // ---------------------------------------------------------------------------
  describe('Afficher, renommer, demander le retrait', () => {
    it('T5.1 affiche le nom de la colonne reçue', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      const displayedName = normalizedTextOf('.column-name');

      expect(displayedName).toBe(COLUMN_TO_DO.name);
    });

    it('T5.2 change le nom affiché quand une nouvelle colonne arrive en entrée : aucune copie interne', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      const nameBeforeReplacement = normalizedTextOf('.column-name');

      await replaceColumn(COLUMN_IN_PROGRESS);

      const nameAfterReplacement = normalizedTextOf('.column-name');

      expect(nameBeforeReplacement).toBe(COLUMN_TO_DO.name);
      expect(nameAfterReplacement).toBe(COLUMN_IN_PROGRESS.name);
    });

    it('T5.3 réserve aux futures cartes une zone présente et vide', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      const cardsArea = el.querySelector('.column-cards');
      const cardsAreaChildren = cardsArea === null ? [] : Array.from(cardsArea.children);
      const cardsAreaText = normalizedTextOf('.column-cards');

      expect(cardsArea).not.toBeNull();
      expect(cardsAreaChildren).toEqual([]);
      expect(cardsAreaText).toBe('');
    });

    it('T5.4 ouvre, en touchant le nom, une saisie pré-remplie du nom courant', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      const fieldBeforeTouch = renameInput();

      await clickOn('.column-name');

      const fieldAfterTouch = renameInput();
      const prefilledValue = fieldAfterTouch?.value;

      expect(fieldBeforeTouch).toBeNull();
      expect(fieldAfterTouch).not.toBeNull();
      expect(prefilledValue).toBe(COLUMN_TO_DO.name);
    });

    it('T5.5 fait repartir la saisie du nouveau nom après un remplacement de la colonne', async () => {
      await setup(COLUMN_TO_DO);
      await render();
      await replaceColumn(COLUMN_IN_PROGRESS);

      await clickOn('.column-name');

      const prefilledValue = renameInput()?.value;

      expect(prefilledValue).toBe(COLUMN_IN_PROGRESS.name);
    });

    it('T5.6 émet le texte tapé à la validation', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      await clickOn('.column-name');
      await typeRenameName('Terminé');
      await clickOn('.btn-rename-confirm');

      expect(renameEmissions).toEqual(['Terminé']);
    });

    it('T5.7 émet les espaces superflus sans les nettoyer : le nettoyage appartient à l’éditeur', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      const typedNameWithSpaces = '   En  cours   ';

      await clickOn('.column-name');
      await typeRenameName(typedNameWithSpaces);
      await clickOn('.btn-rename-confirm');

      expect(renameEmissions).toEqual([typedNameWithSpaces]);
    });

    it('T5.8 émet une saisie vide telle quelle, sans repli sur « Sans titre »', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      await clickOn('.column-name');
      await typeRenameName('');
      await clickOn('.btn-rename-confirm');

      expect(renameEmissions).toEqual(['']);
      expect(renameEmissions).not.toContain(FALLBACK_COLUMN_NAME);
      expect(renameEmissions).not.toContain(COLUMN_TO_DO.name);
    });

    it('T5.9 n’émet rien quand la saisie est abandonnée', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      await clickOn('.column-name');
      await clickOn('.btn-rename-cancel');

      const fieldAfterCancel = renameInput();

      expect(renameEmissions).toEqual([]);
      expect(fieldAfterCancel).toBeNull();
    });

    it('T5.10 laisse le nom affiché inchangé quand la saisie est abandonnée après avoir tapé', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      await clickOn('.column-name');
      await typeRenameName('Brouillon abandonné');
      await clickOn('.btn-rename-cancel');

      const displayedName = normalizedTextOf('.column-name');

      expect(displayedName).toBe(COLUMN_TO_DO.name);
      expect(renameEmissions).toEqual([]);
    });

    it('T5.11 n’émet qu’une demande de retrait à la corbeille : aucune popup, aucune suppression', async () => {
      await setup(COLUMN_TO_DO);
      await render();

      await clickOn('.btn-remove-column');

      const panelStillShown = el.querySelector('.kanban-column');
      const displayedName = normalizedTextOf('.column-name');
      const confirmDialogShown = el.querySelector('app-confirm-dialog, .confirm-backdrop');

      expect(removeRequestCount).toBe(1);
      expect(renameEmissions).toEqual([]);
      expect(panelStillShown).not.toBeNull();
      expect(displayedName).toBe(COLUMN_TO_DO.name);
      expect(confirmDialogShown).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 23 — Rendu des cartes par la colonne
  // ---------------------------------------------------------------------------
  describe('Rendu des cartes par la colonne', () => {
    it('T23.1 rend une carte par élément, dans l’ordre des positions', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();

      const renderedPanels = renderedCardPanels();
      const displayedTexts = renderedCardTexts();
      const expectedTexts = [CARD_PAIN.text, CARD_MENAGE.text, CARD_RENTREE.text];

      expect(renderedPanels.length).toBe(CARDS_OF_COLUMN.length);
      expect(displayedTexts).toEqual(expectedTexts);
    });

    it('T23.2 affiche son état vide quand elle n’a aucune carte, distinct de celui du tableau', async () => {
      await setup(COLUMN_WITHOUT_CARDS);
      await render();

      const emptyState = el.querySelector('.empty.no-cards');
      const emptyStateText = normalizedTextOf('.empty.no-cards');
      const boardEmptyState = el.querySelector('.empty.no-columns');
      const renderedPanels = renderedCardPanels();

      expect(emptyState).not.toBeNull();
      expect(emptyStateText).not.toBe('');
      expect(boardEmptyState).toBeNull();
      expect(renderedPanels).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 24 — Présence des flèches
  // ---------------------------------------------------------------------------
  describe('Présence des flèches', () => {
    it('T24.1 ne rend aucune flèche hors mode déplacement, même avec une carte sélectionnée', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();
      await selectCard(CARD_MENAGE.id);

      const renderedArrows = renderedMoveArrows();

      expect(renderedArrows).toEqual([]);
    });

    it('T24.2 ne rend aucune flèche en mode déplacement tant qu’aucune carte n’est sélectionnée', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();
      await setMoveMode(true);

      const renderedArrows = renderedMoveArrows();

      expect(renderedArrows).toEqual([]);
    });

    it('T24.3 rend les quatre flèches quand elle porte la carte sélectionnée', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();
      await enterMoveModeOn(CARD_MENAGE.id);

      const upArrow = moveArrow(ARROW_UP);
      const downArrow = moveArrow(ARROW_DOWN);
      const leftArrow = moveArrow(ARROW_LEFT);
      const rightArrow = moveArrow(ARROW_RIGHT);

      expect(upArrow).not.toBeNull();
      expect(downArrow).not.toBeNull();
      expect(leftArrow).not.toBeNull();
      expect(rightArrow).not.toBeNull();
    });

    it('T24.4 ne rend aucune flèche quand la carte sélectionnée est celle d’une autre colonne', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();
      await setMoveMode(true);
      await selectCard(SELECTED_CARD_OF_ANOTHER_COLUMN);

      const renderedArrows = renderedMoveArrows();

      expect(renderedArrows).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 25 — Disponibilité des flèches
  // ---------------------------------------------------------------------------
  describe('Disponibilité des flèches', () => {
    it('T25.1 désactive la flèche haute pour une carte en tête, et laisse la basse disponible', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();
      await enterMoveModeOn(CARD_PAIN.id);

      const upArrow = moveArrow(ARROW_UP);
      const downArrow = moveArrow(ARROW_DOWN);

      expect(upArrow?.disabled).toBe(true);
      expect(downArrow?.disabled).toBe(false);
    });

    it('T25.2 désactive la flèche basse pour une carte en queue, et laisse la haute disponible', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();
      await enterMoveModeOn(CARD_RENTREE.id);

      const upArrow = moveArrow(ARROW_UP);
      const downArrow = moveArrow(ARROW_DOWN);

      expect(downArrow?.disabled).toBe(true);
      expect(upArrow?.disabled).toBe(false);
    });

    it('T25.3 désactive la flèche gauche quand l’éditeur annonce la gauche impossible', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();
      await enterMoveModeOn(CARD_MENAGE.id);
      await announceSideMoves(false, true);

      const leftArrow = moveArrow(ARROW_LEFT);
      const rightArrow = moveArrow(ARROW_RIGHT);

      expect(leftArrow?.disabled).toBe(true);
      expect(rightArrow?.disabled).toBe(false);
    });

    it('T25.4 désactive la flèche droite quand l’éditeur annonce la droite impossible', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();
      await enterMoveModeOn(CARD_MENAGE.id);
      await announceSideMoves(true, false);

      const leftArrow = moveArrow(ARROW_LEFT);
      const rightArrow = moveArrow(ARROW_RIGHT);

      expect(rightArrow?.disabled).toBe(true);
      expect(leftArrow?.disabled).toBe(false);
    });

    it('T25.5 désactive les flèches indisponibles sans les retirer du document', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();
      await enterMoveModeOn(CARD_PAIN.id);
      await announceSideMoves(false, true);

      const upArrow = moveArrow(ARROW_UP);
      const leftArrow = moveArrow(ARROW_LEFT);
      const renderedArrows = renderedMoveArrows();

      expect(upArrow).not.toBeNull();
      expect(leftArrow).not.toBeNull();
      expect(upArrow?.disabled).toBe(true);
      expect(leftArrow?.disabled).toBe(true);
      expect(renderedArrows.length).toBe(4);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 26 — Relais et boutons de la colonne
  // ---------------------------------------------------------------------------
  describe('Relais et boutons de la colonne', () => {
    it('T26.1 relaie chaque événement de carte étiqueté de l’identifiant de la carte', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();

      const cardPanel = cardPanelOf(CARD_MENAGE.id);
      const typedText = 'Faire le ménage à fond';

      cardPanel.selectionRequested.emit();
      cardPanel.textChanged.emit(typedText);
      cardPanel.noteRequested.emit();
      cardPanel.noteOpenRequested.emit(NOTE_COURSES.id);
      cardPanel.removeRequested.emit();
      await settle();

      const expectedTextChange = { cardId: CARD_MENAGE.id, text: typedText };

      expect(cardSelectedEmissions).toEqual([CARD_MENAGE.id]);
      expect(cardTextChangeEmissions).toEqual([expectedTextChange]);
      expect(cardNoteRequestEmissions).toEqual([CARD_MENAGE.id]);
      expect(cardNoteOpenRequestEmissions).toEqual([NOTE_COURSES.id]);
      expect(cardRemoveRequestEmissions).toEqual([CARD_MENAGE.id]);
    });

    it('T26.2 relaie la direction de la flèche touchée', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();
      await enterMoveModeOn(CARD_MENAGE.id);

      await clickOn(ARROW_UP);
      await clickOn(ARROW_DOWN);
      await clickOn(ARROW_LEFT);
      await clickOn(ARROW_RIGHT);

      const expectedDirections: MoveDirection[] = ['up', 'down', 'left', 'right'];

      expect(cardMoveRequestEmissions).toEqual(expectedDirections);
    });

    it('T26.3 émet une demande d’ajout au bouton d’ajout, et rien d’autre', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();

      await clickOn('.btn-add-card');

      expect(addCardRequestCount).toBe(1);
      expect(moveModeToggleCount).toBe(0);
      expect(cardSelectedEmissions).toEqual([]);
    });

    it('T26.4 rend le bouton d’ajout même sur une colonne vide, et y émet la demande', async () => {
      await setup(COLUMN_WITHOUT_CARDS);
      await render();

      const addButton = el.querySelector('.btn-add-card');

      await clickOn('.btn-add-card');

      expect(addButton).not.toBeNull();
      expect(addCardRequestCount).toBe(1);
    });

    it('T26.5 émet une bascule de mode au bouton « déplacer », sans rien changer par elle-même', async () => {
      await setup(COLUMN_WITH_CARDS);
      await render();
      await selectCard(CARD_MENAGE.id);

      await clickOn('.btn-toggle-move-mode');

      const renderedArrows = renderedMoveArrows();

      expect(moveModeToggleCount).toBe(1);
      expect(renderedArrows).toEqual([]);
      expect(addCardRequestCount).toBe(0);
    });
  });
});
