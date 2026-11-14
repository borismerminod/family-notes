import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { NotePicker } from './note-picker';
import { NotesService } from '../../services/notes-service';
import { Category, Note } from '../../models';
import { TextBlock } from '../../models/document.model';

/**
 * @file note-picker.spec.ts
 * @description Black-box TDD tests for the popup that picks the note a card references.
 *
 * Expected behaviour: `.agent/KANBAN/EDITION_CARTES/PLAN_TESTS_KANBAN_CARTES.md`, groups 35 to 37
 * (cases T35.1 to T37.5, effects E169 to E179), and batch `G` of
 * `.agent/KANBAN/EDITION_CARTES/APPROCHE_KANBAN_EDITION_CARTES.md` (decisions `D-C31` to `D-C35`),
 * serving `US4` of `FEATURE_KANBAN_EDITION_CARTES.md`.
 *
 * Unlike every other component of the board, this one **reads its own data** (`D-C32`): it injects
 * `NotesService` and loads the notes **lazily, when it opens** — never when the board opens. That
 * is why its loading state, its two empty states and its read failure are its own, and stay out of
 * `KanbanEditor`. What it answers is a whole `Note`, or `null` for the explicit « Aucune note »
 * that unlinks a card (`D-C33`, `D-C35`); giving the popup up answers **nothing**, which is what
 * leaves a reference untouched without the host having to handle it.
 *
 * DOM contract — **proposed here and validated on 2026-11-14**, §9 of the plan being unwritten for
 * this target, following the precedent of `kanban-column.spec.ts` and `kanban-card.spec.ts` whose
 * selectors were proposed in their header before being raised into the plan. The template must
 * honour them:
 *
 * | Selector | Role | Cases |
 * |---|---|---|
 * | `.note-picker-backdrop` / `.note-picker-panel` | The backdrop and the panel, both already carried by the skeleton of batch G | T35.1, T37.5 |
 * | `.note-picker-search` | The search field (`input[type="text"]`), filtering in memory (`D-C34`) | T36.1 to T36.4 |
 * | `.note-option` | One entry per choice, in display order | T35.3, T36.x, T37.2 to T37.4 |
 * | `.note-option-none` | The « Aucune note » choice, **first** `.note-option` (`D-C35`) | T37.2, T37.4 |
 * | `.note-option-title` | The title of the note an entry stands for | T35.3, T36.1, T37.3 |
 * | `.note-picker-loading` | Loading indicator of the popup's own read | T35.2 |
 * | `.note-picker-error[role="alert"]` | Read failure, after `.action-error[role="alert"]` of the editor | T35.4 |
 * | `.no-notes` | « Aucune note dans l'application » | T37.1 |
 * | `.no-notes-match` | « Aucune note ne correspond à la recherche » — a selector **distinct** from the previous one | T36.4 |
 * | `.btn-note-picker-close` | Gives the popup up, already carried by the skeleton | T37.5 |
 *
 * Decisions taken here for lack of a plan contract, numbered `D-NP#` so as not to collide with the
 * `D-P#` of the column panel nor the `D-PC#` of the card panel. They are the ones to raise into §7
 * and §9 of the plan:
 * - **D-NP1** — the two empty states are **two distinct selectors**, and not one element holding
 *   two texts: it is the only way to hold `E173` apart from `E174` in black box.
 * - **D-NP2** — an entry of the list is a `<button>` carrying `.note-option`, and the title it
 *   displays is read in `.note-option-title` — never an identifier (`E170`). Reading of `D-NP2`
 *   with `D-NP3`: `.note-option-none` carries **no** `.note-option-title`, so the titles the popup
 *   lists are exactly the `.note-option-title` elements.
 * - **D-NP3** — « Aucune note » is a `.note-option` like the others, marked `.note-option-none`, so
 *   T37.2 reads the **index 0** of the entries rather than a control standing outside the list.
 * - **D-NP4** — the filter looks at `note.title` alone. T36.2 and T36.3 therefore mount notes whose
 *   **category name** and whose **content** contain the search, to check they are left out.
 * - **D-NP5** — `NotesService` is doubled **by injection**, never by mocking the sqlite module
 *   (project memory `run-frontend-tests`, `D-C32`).
 */

/** A category whose name is searched for in T36.2, and which no title contains. */
const CATEGORY_CUISINE: Category = {
  id: 'cat-cuisine',
  name: 'Cuisine',
  color: '#ff9f0a',
};

/** The content block whose text is searched for in T36.3, and which no title contains. */
const BLOCK_FOUR: TextBlock = {
  id: 'block-four',
  kind: 'text',
  text: 'Préchauffer le four à 180 °C',
  marks: [],
};

/**
 * The note whose title carries the searched substring in another case than the typed one (`C192`),
 * « courses » sitting at the end of the title rather than at its start.
 */
const NOTE_COURSES: Note = {
  id: 'note-courses',
  title: 'Liste de courses',
  category: null,
  blocks: [],
  updatedAt: '2026-11-10T08:00:00.000Z',
};

/**
 * The note the filter must leave out twice: its **category** is searched for in T36.2 and its
 * **content** in T36.3, neither being its title (`D-NP4`).
 */
const NOTE_RECETTE: Note = {
  id: 'note-recette',
  title: 'Recette du gâteau',
  category: CATEGORY_CUISINE,
  blocks: [BLOCK_FOUR],
  updatedAt: '2026-11-11T09:30:00.000Z',
};

/** A third note, there to show a filter keeps some entries and drops others. */
const NOTE_VACANCES: Note = {
  id: 'note-vacances',
  title: 'Vacances d’été',
  category: null,
  blocks: [],
  updatedAt: '2026-11-12T17:45:00.000Z',
};

/** The three notes the application holds in most cases, in the order the read gives them. */
const ALL_NOTES: Note[] = [NOTE_COURSES, NOTE_RECETTE, NOTE_VACANCES];

describe('NotePicker (la popup de sélection de note)', () => {
  let fixture: ComponentFixture<NotePicker>;
  let el: HTMLElement;
  let notesServiceDouble: { getAllNotes: ReturnType<typeof vi.fn> };
  let selectedEmissions: (Note | null)[];

  /**
   * Mounts the popup **closed**, on a doubled `NotesService` that holds no note yet, and starts
   * listening to what it answers. Closed is the starting state of every case: the read is expected
   * to depart on the opening, and nowhere else (`E169`).
   */
  async function mountClosedPicker(): Promise<void> {
    notesServiceDouble = { getAllNotes: vi.fn().mockResolvedValue([]) };

    await TestBed.configureTestingModule({
      imports: [NotePicker],
      providers: [{ provide: NotesService, useValue: notesServiceDouble }],
    }).compileComponents();

    fixture = TestBed.createComponent(NotePicker);
    el = fixture.nativeElement as HTMLElement;

    selectedEmissions = [];

    const picker = fixture.componentInstance;
    picker.selected.subscribe((chosenNote: Note | null) => {
      selectedEmissions.push(chosenNote);
    });

    fixture.componentRef.setInput('open', false);
    await render();
  }

  /** Triggers a render, lets the component settle, then refreshes the DOM. */
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Seeds the notes the application holds, behind the doubled service. Called before the opening,
   * since that is when the popup reads them.
   * @param storedNotes The notes the read answers with.
   */
  function givenStoredNotes(storedNotes: Note[]): void {
    notesServiceDouble.getAllNotes.mockResolvedValue(storedNotes);
  }

  /**
   * Makes the read of the notes fail, the way a broken database does. The popup is held to
   * containing that failure instead of letting it fall through to the board (`E179`).
   */
  function givenFailingNotesRead(): void {
    const readFailure = new Error('Erreur lors de la récupération des notes');
    notesServiceDouble.getAllNotes.mockRejectedValue(readFailure);
  }

  /**
   * Makes the read hang, so that the state of the popup **during** its own loading can be read.
   * @returns The function that completes the read with the given notes and refreshes the DOM.
   */
  function givenHangingNotesRead(): (loadedNotes: Note[]) => Promise<void> {
    let releaseRead: (loadedNotes: Note[]) => void = () => undefined;
    const hangingRead: Promise<Note[]> = new Promise<Note[]>((resolve) => {
      releaseRead = resolve;
    });
    notesServiceDouble.getAllNotes.mockReturnValue(hangingRead);

    return async (loadedNotes: Note[]): Promise<void> => {
      releaseRead(loadedNotes);
      await render();
    };
  }

  /**
   * Opens the popup the way the editor does, through its `open` model (`D-C31`), then refreshes
   * the DOM.
   */
  async function openPicker(): Promise<void> {
    fixture.componentRef.setInput('open', true);
    await render();
  }

  /**
   * Re-opens the popup after it closed itself, the way a host holding `[(open)]` does: the close
   * the popup wrote back is taken in first, then the opening is driven again. Driving `open` to
   * `true` on its own would change nothing, `setInput` comparing against the last value **it** set
   * rather than against the state of the model.
   */
  async function reopenPicker(): Promise<void> {
    fixture.componentRef.setInput('open', false);
    await render();
    await openPicker();
  }

  /**
   * Says whether the popup is on screen, which is how it tells a host it closed itself: the
   * template renders nothing while `open` is false.
   * @returns True while the popup shows its backdrop.
   */
  function isShown(): boolean {
    const backdrop = el.querySelector('.note-picker-backdrop');
    return backdrop !== null;
  }

  /**
   * Reads the text of an element, ignoring how the template lays it out: non-breaking spaces
   * become plain ones, and runs of whitespace collapse to a single space.
   * @param selector The CSS selector looked up in the popup template.
   * @returns The normalized text, trimmed, or an empty string when the element is absent.
   */
  function normalizedTextOf(selector: string): string {
    const found = el.querySelector(selector);
    const raw = found?.textContent ?? '';
    return raw.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Gives the titles the popup currently lists, in display order. « Aucune note » carries no title
   * (`D-NP2`), so these are exactly the notes proposed.
   * @returns One title per listed note.
   */
  function listedNoteTitles(): string[] {
    const titleElements = el.querySelectorAll<HTMLElement>('.note-option-title');
    const titles = Array.from(titleElements);
    return titles.map((titleElement: HTMLElement): string => {
      const raw = titleElement.textContent ?? '';
      return raw.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    });
  }

  /**
   * Gives the entries of the list, in display order, « Aucune note » included (`D-NP3`).
   * @returns The entry elements.
   */
  function noteOptions(): HTMLElement[] {
    const optionElements = el.querySelectorAll<HTMLElement>('.note-option');
    return Array.from(optionElements);
  }

  /**
   * Clicks an element of the popup, then waits for it to finish updating.
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
   * Chooses a note the way the user does: by touching the entry that displays its title.
   * @param noteTitle The title of the note to choose.
   * @throws When no entry displays that title, which would signal a filtered-out note.
   */
  async function chooseNoteByTitle(noteTitle: string): Promise<void> {
    const titleElements = el.querySelectorAll<HTMLElement>('.note-option-title');
    const titles = Array.from(titleElements);
    const matchingTitle = titles.find((titleElement: HTMLElement): boolean => {
      const displayedTitle = titleElement.textContent?.trim() ?? '';
      return displayedTitle === noteTitle;
    });
    if (matchingTitle === undefined) {
      throw new Error(`Aucune entrée ne propose la note « ${noteTitle} ».`);
    }
    const entry = matchingTitle.closest<HTMLElement>('.note-option');
    if (entry === null) {
      throw new Error(`Le titre « ${noteTitle} » n'est pas porté par une entrée de la liste.`);
    }
    entry.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Types a search the way the user would, through the field itself: the binding is part of what
   * the case checks.
   * @param typedSearch The text to type, kept as is.
   * @throws When the search field is absent, which would signal an unexpected template.
   */
  async function typeSearch(typedSearch: string): Promise<void> {
    const field = el.querySelector<HTMLInputElement>('.note-picker-search');
    if (field === null) {
      throw new Error('Aucun champ de recherche dans la popup.');
    }
    field.value = typedSearch;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // Groupe 35 — Chargement
  // ---------------------------------------------------------------------------
  describe('Chargement', () => {
    it('T35.1 ne demande aucune note tant qu’elle est fermée, et ne rend rien', async () => {
      await mountClosedPicker();

      const readCallCount = notesServiceDouble.getAllNotes.mock.calls.length;
      const shownWhileClosed = isShown();

      expect(readCallCount).toBe(0);
      expect(shownWhileClosed).toBe(false);
    });

    it('T35.2 lance la lecture des notes à l’ouverture, et montre son propre chargement en attendant', async () => {
      await mountClosedPicker();

      const completeRead = givenHangingNotesRead();

      await openPicker();

      const readCallCountAfterOpening = notesServiceDouble.getAllNotes.mock.calls.length;
      const loadingWhileReading = el.querySelector('.note-picker-loading');

      await completeRead(ALL_NOTES);

      const loadingAfterRead = el.querySelector('.note-picker-loading');

      expect(readCallCountAfterOpening).toBe(1);
      expect(loadingWhileReading).not.toBeNull();
      expect(loadingAfterRead).toBeNull();
    });

    it('T35.3 propose chaque note par son titre, et n’affiche aucun identifiant', async () => {
      await mountClosedPicker();
      givenStoredNotes(ALL_NOTES);

      await openPicker();

      const displayedTitles = listedNoteTitles();
      const wholePanelText = normalizedTextOf('.note-picker-panel');

      expect(displayedTitles).toEqual([
        NOTE_COURSES.title,
        NOTE_RECETTE.title,
        NOTE_VACANCES.title,
      ]);
      expect(wholePanelText).not.toContain(NOTE_COURSES.id);
      expect(wholePanelText).not.toContain(NOTE_RECETTE.id);
      expect(wholePanelText).not.toContain(NOTE_VACANCES.id);
    });

    it('T35.4 signale un échec de lecture dans la popup, sans liste ni état vide, et laisse se refermer', async () => {
      await mountClosedPicker();
      givenFailingNotesRead();

      await openPicker();

      const errorBanner = el.querySelector('.note-picker-error[role="alert"]');
      const displayedTitles = listedNoteTitles();
      const emptyApplicationMessage = el.querySelector('.no-notes');
      const loadingAfterFailure = el.querySelector('.note-picker-loading');

      await clickOn('.btn-note-picker-close');

      const shownAfterClose = isShown();

      expect(errorBanner).not.toBeNull();
      expect(displayedTitles).toEqual([]);
      expect(emptyApplicationMessage).toBeNull();
      expect(loadingAfterFailure).toBeNull();
      expect(shownAfterClose).toBe(false);
      expect(selectedEmissions).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 36 — Filtre par titre
  // ---------------------------------------------------------------------------
  describe('Filtre par titre', () => {
    it('T36.1 retient les titres contenant la recherche, casse ignorée, et écarte les autres', async () => {
      await mountClosedPicker();
      givenStoredNotes(ALL_NOTES);
      await openPicker();

      const searchInAnotherCase = 'COURSES';

      await typeSearch(searchInAnotherCase);

      const displayedTitles = listedNoteTitles();

      expect(displayedTitles).toEqual([NOTE_COURSES.title]);
    });

    it('T36.2 ne retient rien quand la recherche est un nom de catégorie absent des titres', async () => {
      await mountClosedPicker();
      givenStoredNotes(ALL_NOTES);
      await openPicker();

      const searchOnCategoryName = CATEGORY_CUISINE.name;

      await typeSearch(searchOnCategoryName);

      const displayedTitles = listedNoteTitles();

      expect(displayedTitles).toEqual([]);
      expect(displayedTitles).not.toContain(NOTE_RECETTE.title);
    });

    it('T36.3 ne retient rien quand la recherche est dans le contenu d’une note, absent des titres', async () => {
      await mountClosedPicker();
      givenStoredNotes(ALL_NOTES);
      await openPicker();

      const searchOnNoteContent = 'four';

      await typeSearch(searchOnNoteContent);

      const displayedTitles = listedNoteTitles();

      expect(displayedTitles).toEqual([]);
      expect(displayedTitles).not.toContain(NOTE_RECETTE.title);
    });

    it('T36.4 affiche « aucune note ne correspond », et non l’état vide de l’application, quand le filtre ne retient rien', async () => {
      await mountClosedPicker();
      givenStoredNotes(ALL_NOTES);
      await openPicker();

      const searchWithoutMatch = 'zzz';

      await typeSearch(searchWithoutMatch);

      const noMatchMessage = el.querySelector('.no-notes-match');
      const emptyApplicationMessage = el.querySelector('.no-notes');
      const displayedTitles = listedNoteTitles();

      expect(noMatchMessage).not.toBeNull();
      expect(emptyApplicationMessage).toBeNull();
      expect(displayedTitles).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 37 — États vides et choix
  // ---------------------------------------------------------------------------
  describe('États vides et choix', () => {
    it('T37.1 affiche « aucune note dans l’application » quand il n’y en a aucune, et non une liste vide', async () => {
      await mountClosedPicker();
      givenStoredNotes([]);

      await openPicker();

      const emptyApplicationMessage = el.querySelector('.no-notes');
      const noMatchMessage = el.querySelector('.no-notes-match');
      const displayedTitles = listedNoteTitles();

      expect(emptyApplicationMessage).not.toBeNull();
      expect(noMatchMessage).toBeNull();
      expect(displayedTitles).toEqual([]);
    });

    it('T37.2 rend le choix « Aucune note » en tête de liste, avant la première note', async () => {
      await mountClosedPicker();
      givenStoredNotes(ALL_NOTES);

      await openPicker();

      const entries = noteOptions();
      const firstEntry = entries[0];
      const firstEntryIsTheUnlinkChoice = firstEntry.classList.contains('note-option-none');
      const titleInsideFirstEntry = firstEntry.querySelector('.note-option-title');
      const displayedTitles = listedNoteTitles();

      expect(entries.length).toBe(ALL_NOTES.length + 1);
      expect(firstEntryIsTheUnlinkChoice).toBe(true);
      expect(titleInsideFirstEntry).toBeNull();
      expect(displayedTitles).toEqual([
        NOTE_COURSES.title,
        NOTE_RECETTE.title,
        NOTE_VACANCES.title,
      ]);
    });

    it('T37.3 émet la note choisie entière, et se referme', async () => {
      await mountClosedPicker();
      givenStoredNotes(ALL_NOTES);
      await openPicker();

      await chooseNoteByTitle(NOTE_RECETTE.title);

      const shownAfterChoice = isShown();

      expect(selectedEmissions).toEqual([NOTE_RECETTE]);
      expect(shownAfterChoice).toBe(false);
    });

    it('T37.4 émet une absence de note au choix « Aucune note », et se referme', async () => {
      await mountClosedPicker();
      givenStoredNotes(ALL_NOTES);
      await openPicker();

      await clickOn('.note-option-none');

      const shownAfterChoice = isShown();

      expect(selectedEmissions).toEqual([null]);
      expect(shownAfterChoice).toBe(false);
    });

    it('T37.5 n’émet rien quand on renonce, au bouton de fermeture comme au clic hors de la popup', async () => {
      await mountClosedPicker();
      givenStoredNotes(ALL_NOTES);
      await openPicker();

      await clickOn('.btn-note-picker-close');

      const shownAfterCloseButton = isShown();
      const emissionsAfterCloseButton = selectedEmissions.length;

      await reopenPicker();
      await clickOn('.note-picker-backdrop');

      const shownAfterBackdropClick = isShown();

      expect(shownAfterCloseButton).toBe(false);
      expect(emissionsAfterCloseButton).toBe(0);
      expect(shownAfterBackdropClick).toBe(false);
      expect(selectedEmissions).toEqual([]);
    });
  });
});
