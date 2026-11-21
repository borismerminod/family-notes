import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { KanbanEditor } from './kanban-editor';
import { KanbanService } from '../../core/services/kanban/kanban-service';
import { NotesService } from '../../core/services/notes/notes-service';
import { Kanban, KanbanCard, KanbanColumn, KanbanSaveResult, Note } from '../../core/models';

/**
 * @file kanban-editor.spec.ts
 * @description Black-box TDD tests for the kanban board editor screen.
 *
 * Expected behaviour, two batches in one file:
 * - `.agent/KANBAN/EDITION/PLAN_TESTS_KANBAN_EDITION.md`, part B (groups 2 to 10) — the screen
 *   itself: modes, loading, name, save, back. Its DOM contract (§7) comes from
 *   `MAQUETTE_KANBAN_EDITOR.html` (decision `D1`);
 * - `.agent/KANBAN/EDITION_LISTES/PLAN_TESTS_KANBAN_EDITION_LISTES.md`, groups 6 to 12 (cases
 *   T6.1 to T12.13, effects E35 to E58) — the columns the user calls « listes »: display, the
 *   four gestures, the grouped save. Decisions `D-L1` to `D-L24` of
 *   `.agent/KANBAN/EDITION_LISTES/APPROCHE_KANBAN_EDITION_LISTES.md`, batches `F` to `K`.
 *
 * The screen is tested in isolation: its data source (`KanbanService`) is a test double,
 * navigation is spied on, the route identifier comes from a stubbed `ActivatedRoute` whose
 * snapshot is read once (`D8`), and `ConfirmDialog` stays real, driven through the DOM. So does
 * `KanbanColumnPanel`: the columns are read and driven through their own rendered controls, never
 * through the editor's fields, which is what keeps these cases black-box.
 *
 * **Case identifiers of the two batches collide** (both plans number their groups from 1), so the
 * cases of the columns batch carry a « (listes) » suffix: `T6.1 (listes)` is the first case of
 * group 6 of `PLAN_TESTS_KANBAN_EDITION_LISTES.md`, `T6.1` alone would be the one of the previous
 * plan — which this file does not hold, its part B starting at group 2.
 *
 * Two deliberate departures from what this file held before the columns batch, both of them
 * consequences of the new plan rather than choices made here:
 * - **the save path moved**: `onSave` now asks for one single grouped write (`E48`, `D-L9`,
 *   `D-L24`), so groups 5 to 7 and 9 observe `saveKanbanWithColumns` where they observed
 *   `createKanban` and `renameKanban`. The creation / rename distinction did not disappear, it
 *   moved into the identifier the call carries: `null` creates, an identifier renames. Both
 *   methods stay on the double, and every migrated case now checks they are **not** called
 *   directly;
 * - **the ghost column is gone** (`D-E11` withdrawn by batch `F`): the two cases of the old
 *   group 10 asserted the placeholder announcing « *les listes et les cartes arriveront dans un
 *   prochain lot* », which `T6.2 (listes)` and `T6.3 (listes)` replace by the empty state. They
 *   are therefore dropped rather than kept red forever.
 *
 * DOM contract of the columns — **§9.1 of the plan**, which these selectors are the copy of. They
 * were proposed here first, the plan's contract section being unwritten when this file was built,
 * and were raised into it on 2026-11-11 (`R8` of `REVUE_KANBAN_EDITION_LISTES.md`): the plan is
 * what makes them a contract now, this table is the reminder. The template must honour them:
 *
 * | Selector | Role | Cases |
 * |---|---|---|
 * | `.board-canvas` | Board content area, scrollable horizontally | T6.x |
 * | `app-kanban-column` | One panel per column, in display order (`D-L21`) | T6.1, T7.x to T12.x |
 * | `.board-canvas .no-columns` | Empty state of a board without any column (`.empty` block, as the other empty states of this screen) | T6.2, T6.3, T9.4 |
 * | `.btn-move-left` / `.btn-move-right` | Move buttons the editor renders around each column (`D-L23`), one pair per column, in the same order | T6.4 to T6.7, T10.x |
 * | `.btn-add-column` | The add gesture, visible including on an empty board | T6.2, T6.3, T7.x |
 * | `.new-column-name` | In-place name field of the column being added (`input[type="text"]`, `D-L18`) | T7.x |
 * | `.btn-add-confirm` / `.btn-add-cancel` | Validates / gives up the add field | T7.x |
 * | `app-confirm-dialog.confirm-remove-column` | The removal popup (`D-L4`), which names the column at stake | T9.x, T12.3, T12.7 |
 * | `app-confirm-dialog.confirm-leave` | The abandon popup of an unsaved name or composition (`US7`) | T9.x of the previous plan, T12.5 to T12.13 |
 *
 * Decisions taken here for lack of a plan contract, and since confirmed — they are **§8.1 of the
 * plan** (`D-EL1` → `D-EL8`), raised into it on 2026-11-11:
 * - **D-EL1** — the move buttons are **disabled and not hidden** at the ends, as `E37` words it,
 *   and there is one pair **per column** whatever its rank: a case reads the pair of rank `i` as
 *   belonging to the column of rank `i`.
 * - **D-EL2** — the add field is validated and given up by **two buttons**, as the rename of the
 *   panel is (`D-P1` of `kanban-column.spec.ts`): the keyboard is out of reach on a phone.
 * - **D-EL3** — these cases do not say whether the add field **stays open** after a validation
 *   (batch `G` says it does, so columns can be added in a row): the helper reopens it when it
 *   finds the add button, so both templates pass.
 * - **D-EL4** — the removal popup is only required to **name** the column, between the quotes the
 *   other deletion popups of the repository use (`Supprimer le tableau « … » ?`): the wording of
 *   the sentence is left to the template.
 * - **D-EL8** — the **two** `ConfirmDialog` instances of the screen are told apart by a class of
 *   their own (`R5` of `REVUE_KANBAN_EDITION_LISTES.md`, closing what §4 of the approach asked
 *   for), and every case says which popup it drives. Relying on « whichever popup is open » used
 *   to work only because the screen never opens both at once — which nothing enforces — and it
 *   silently sent two cases of group 12 at the removal popup through the abandon selector.
 * - **D-EL5** — the identifiers and the positions of the columns are **not displayed**, so the
 *   cases that bear on them (a fresh identifier, contiguous positions) read the composition the
 *   grouped save carries. It is the public API of the screen's single dependency, which is where
 *   the plan's own ⚠️ note on observability points.
 * - **D-EL6** — the save double **echoes** what it is given: the board it hands back carries the
 *   name and the composition it received, which is what `D-L24` promises on success. A case that
 *   needs a failure, a half success or a created identifier overrides it.
 * - **D-EL7** — a column name is read from the DOM **trimmed but not normalized**: inner spaces
 *   are part of a name (`US2`), so collapsing runs of spaces would hide what `T7.3 (listes)`
 *   checks.
 *
 * ---
 *
 * **Batch `EDITION_CARTES` — groups 27 to 34** (cases T27.1 to T34.1, effects E138 to E168), from
 * `.agent/KANBAN/EDITION_CARTES/PLAN_TESTS_KANBAN_CARTES.md` §6.9, and batches `I` and `J` of
 * `.agent/KANBAN/EDITION_CARTES/APPROCHE_KANBAN_EDITION_CARTES.md` (decisions `D-C18`, `D-C20`,
 * `D-C23`, `D-C28`, `D-C29`, `D-C30`, `D-C36`, `D-C37`, `D-C38`, `D-C39`, `D-C40`, `D-C42`).
 *
 * **No suffix on these identifiers**: the groups of that plan start at 27, so they collide with
 * neither the part B of the first plan (groups 2 to 10) nor the columns batch (groups 6 to 12).
 *
 * The screen now holds the cards **inside** its composition — there is no signal of their own
 * (`D-C18`) — plus the single selection of the whole board, the move mode, the draft of a card
 * being typed, and the note the picker answers with. The cards themselves are rendered by
 * `KanbanColumnPanel`, which relays what they emit (`D-C22`), so every gesture of these cases
 * goes through the controls those two panels render: the card's body, its trash, its text entry
 * and its reference control, the column's add, « déplacer » and four arrows. Both panels stay
 * real, as `ConfirmDialog` does, which is what keeps these cases black-box.
 *
 * DOM contract of this batch — **the parts the editor itself renders are proposed here**, §9 of
 * the plan being unwritten, following what `kanban-card.spec.ts` and the groups 23 to 26 of
 * `kanban-column.spec.ts` did. The selectors of the two panels are **theirs**, quoted from their
 * own contracts rather than redefined:
 *
 * | Selector | Owner | Role | Cases |
 * |---|---|---|---|
 * | `.new-card` | editor | The draft of a card being typed, rendered in the slot of the column it targets, **outside** the composition (`D-C29`) | T27.x |
 * | `.new-card-text` | editor | In-place text field of that draft (`input[type="text"]`) | T27.x |
 * | `.btn-new-card-confirm` · `.btn-new-card-cancel` | editor | Validates / gives up the draft | T27.x |
 * | `.btn-new-card-note` | editor | Reference control of the draft, which opens the picker before the card exists (`E156`) | T27.8 |
 * | `app-confirm-dialog.confirm-remove-card` | editor | The **third** `ConfirmDialog` instance, whose message names the card (`D-C28`) | T29.x, T33.x |
 * | `app-note-picker` | editor | The note picker, one instance per screen, driven by `[(open)]` (`D-C31`) | T27.8, T31.x |
 * | `.btn-add-card` · `.btn-toggle-move-mode` | column | Asks for a card in that list / toggles the mode (`E135`, `E136`) | T27.x, T30.x |
 * | `.btn-card-move-up` · `.btn-card-move-down` · `.btn-card-move-left` · `.btn-card-move-right` | column | The four arrows of the selected card (`D-C26`) | T30.3, T30.4 |
 * | `app-kanban-card` · `.kanban-card.selected` | card | One panel per card, and the marker of the selected one (`D-PC4`) | T27.x to T33.x |
 * | `.card-body` · `.card-text` · `.card-note-title` · `.btn-remove-card` | card | Touch target, text, note title, trash | T27.x to T34.1 |
 * | `.card-text-input` · `.btn-text-confirm` · `.btn-text-cancel` · `.btn-card-note` | card | Text entry of a card and the reference control it carries (`D-PC3`) | T28.x, T31.x |
 *
 * Decisions taken here for lack of a plan contract, numbered `D-EC#` so as not to collide with the
 * `D-EL#` of the columns batch nor with the `D-P#` / `D-PC#` of the two panels. They are the ones
 * to raise into §7, §8 and §9 of the plan, or to reverse before the screen is written:
 * - **D-EC1** — the draft of a new card is a `.new-card` block rendered **in the slot of the
 *   column it targets**, with its own field and its two buttons, named apart from the
 *   `.new-column` / `.btn-add-confirm` of a new **list**: a case must be able to aim at one of
 *   the two drafts, and both may be open at once.
 * - **D-EC2** — the draft is validated and given up by **two buttons**, for the reason `D-EL2`
 *   and `D-PC2` already gave: the soft keyboard of a phone puts `Entrée` and `Échap` out of
 *   reach.
 * - **D-EC3** — these cases do not say whether the draft **stays open** after a validation: the
 *   helper reopens it when it finds the add button, so both templates pass — `D-EL3` for the
 *   lists.
 * - **D-EC4** — the removal popup of a card is only required to **name** the card between the
 *   quotes the other deletion popups use, and to be a **third instance** carrying
 *   `.confirm-remove-card`: the wording of the sentence is left to the template, and `D-EL8`
 *   already made every case say which popup it drives.
 * - **D-EC5** — identifiers, positions and the referenced note of a card are **not all
 *   displayed**, so the cases bearing on them read the composition the grouped save carries, as
 *   `D-EL5` does for the columns. `cards: []` against `cards: undefined` (`E168`, `D-C9`) is read
 *   there too: nothing on screen tells them apart.
 * - **D-EC6** — the note picker is driven **through the child component**, not through its own
 *   DOM: a case reads its `open` model and makes it emit on `selected`, which is the editor-side
 *   contract (`D-C31`, `D-C33`). It is `D-P10` of the column panel applied here, and it keeps
 *   these cases independent of a template whose own plan (groups 35 to 37) is not written yet.
 *   The handle is taken by `By.css('app-note-picker')` rather than by importing `NotePicker`, so
 *   that this file compiles before that component exists.
 * - **D-EC7** — the editor renders `app-note-picker` **always**, its `open` state driving the
 *   popup, exactly as the two `ConfirmDialog` instances are rendered.
 * - **D-EC8** — a card text is read from the DOM **raw** when the case bears on the spaces
 *   (T27.4, T28.2), and trimmed otherwise: `D-EL7` trims, which would make a screen that forgets
 *   to clean the text pass. The cleaned text is also read back from the save, which is where
 *   `D-EC5` points.
 * - **D-EC9** — `NotesService` is **doubled** in this file although the screen does not inject it
 *   (§8 of the plan says so, and it still holds): the picker it hosts does inject it (`D-C32`),
 *   and a real `NotesService` would open a database connection in its constructor. The double is
 *   also what makes `E146` observable — « no note deletion is asked for » needs something to ask.
 * - **D-EC10** — `T33.3` is split into **five cases**, one per gesture, because a fresh screen
 *   cannot be mounted twice inside one case: it is `E164`'s « five paths, five checks » taken
 *   literally, and the precedent of `T12.1` to `T12.4` of the columns batch.
 *
 * Open point raised to the supervisor, and **not** decided here:
 * - **`T29.6` has no reachable gesture** (`C161`, `E147`). The trash of a card is **out of the
 *   document in move mode** (`D-C28`, `E124`), and leaving the mode drops the selection
 *   (`E149`): there is no moment where the user can ask for the removal of the card they have
 *   selected. The case therefore drives the only sequence that reaches that state — asking for
 *   the removal **first**, then entering the mode and selecting the card behind the open popup —
 *   which the guard of `E147` is what makes correct. On a phone the backdrop makes that sequence
 *   impossible, so either `E147` becomes an invariant of the screen rather than a gesture, or
 *   `D-C28` has to let the trash live in move mode.
 */

/** The board the data source returns in edit mode, without any column unless a case adds some. */
const EXISTING_KANBAN: Kanban = {
  id: 'k-maison',
  name: 'Travaux de la maison',
  updatedAt: '2026-09-28T18:30:00.000Z',
  columns: [],
};

/** Date the save double stamps the board it hands back, so what comes back stays predictable. */
const SAVED_UPDATED_AT = '2026-11-09T10:00:00.000Z';

/** Identifier the save double gives the board it had to create, i.e. the one it got none for. */
const CREATED_KANBAN_ID = 'k-nouvellement-cree';

/** First column of the composition most cases of the columns batch start from. */
const COLUMN_TO_DO: KanbanColumn = { id: 'col-a-faire', name: 'À faire', position: 0 };

/** Second column, the one in the middle: the only rank where both move buttons are active. */
const COLUMN_IN_PROGRESS: KanbanColumn = { id: 'col-en-cours', name: 'En cours', position: 1 };

/** Third and last column of the starting composition. */
const COLUMN_DONE: KanbanColumn = { id: 'col-fait', name: 'Fait', position: 2 };

/**
 * Starting composition: **three** columns, and not two. One step to the left and « sent to the
 * far end » give the same result on two columns, so three are needed to tell them apart (`E45`),
 * and a removal only digs a hole in the positions when it happens in the middle (`E46`).
 */
const THREE_COLUMNS: KanbanColumn[] = [COLUMN_TO_DO, COLUMN_IN_PROGRESS, COLUMN_DONE];

/** First of two columns sharing the same name: only their identifiers tell them apart (`D-L6`). */
const COLUMN_SHOPPING_A: KanbanColumn = { id: 'col-courses-a', name: 'Courses', position: 0 };

/** Second column of the same name, the one the homonym cases aim at. */
const COLUMN_SHOPPING_B: KanbanColumn = { id: 'col-courses-b', name: 'Courses', position: 1 };

/** Composition holding two homonyms, which is what a designation by name would get wrong. */
const HOMONYM_COLUMNS: KanbanColumn[] = [COLUMN_SHOPPING_A, COLUMN_SHOPPING_B, COLUMN_DONE];

/**
 * Composition stored with a **hole** in its positions — `0` then `2`, no `1`. The database is
 * allowed to hold that: a save is not atomic (`D-L13`), so one interrupted halfway can leave the
 * columns of a board renumbered in part. Nothing forbids it either, no uniqueness constraint
 * bearing on `(kanban_id, position)` (`D-L6`). The screen must therefore not take the positions
 * it reads for granted.
 */
const COLUMNS_WITH_POSITION_HOLE: KanbanColumn[] = [
  { id: 'col-a-faire', name: 'À faire', position: 0 },
  { id: 'col-fait', name: 'Fait', position: 2 },
];

/**
 * Name a column is stored under when the typed name is empty or made of spaces (`D-L17`). It
 * reads the same as the fallback of the board name, and that is the point: the rule lives in one
 * single place, the editor.
 */
const FALLBACK_COLUMN_NAME = 'Sans titre';

/**
 * Hint carried by the name field while it is empty (`D2`). It is only a hint: an empty name falls
 * back to 'Sans titre' when saving (`D-E2`), never while typing.
 */
const NAME_PLACEHOLDER = 'Sans titre';

/**
 * Name a board is stored under when the field is left empty, or holds nothing but spaces
 * (`D-E2`). It reads the same as the field hint on purpose, but it is a different thing: the hint
 * is never sent anywhere, whereas this name is what reaches the data source. An empty name is
 * therefore never refused by this screen, it is replaced — the service's own refusal staying a
 * safety net this screen never trips (`D-E10`).
 */
const FALLBACK_SAVED_NAME = 'Sans titre';

/** Screen title shown when no identifier comes from the route, i.e. a brand new board (`D2`). */
const CREATION_SCREEN_TITLE = 'Nouveau tableau';

/** Screen title shown when the route carries an identifier, i.e. an existing board (`D2`). */
const EDITION_SCREEN_TITLE = 'Modifier le tableau';

/** The only exit of this screen: the board list (`D-E1`). */
const KANBAN_LIST_ROUTE = '/kanban';

/**
 * Message shown when the route carries an identifier no board matches (`D-E4`, revised on
 * 2026-10-11): the screen says so and lets the user leave, rather than navigating away by itself,
 * a silent redirection having read as a bug.
 */
const BOARD_NOT_FOUND_MESSAGE = 'Tableau introuvable.';

/** Message shown when the board could not be read at all, as opposed to not existing (`D2`). */
const LOAD_FAILED_MESSAGE = 'Impossible de charger ce tableau.';

/**
 * Message of the banner shown when the save was refused and wrote **nothing** (`D2`, `D-E9`). The
 * screen must show it, not merely log it: a message left in the console alone never reaches the
 * user.
 */
const SAVE_FAILED_MESSAGE = "Impossible d'enregistrer le tableau.";

/**
 * Message of the banner shown when the board **was** stored but its lists did not follow
 * (`D-L24`). A distinct message from the one above, decided by `R4` of
 * `REVUE_KANBAN_EDITION_LISTES.md`: the board does exist, so announcing that it could not be saved
 * would say the opposite of what happened — and the screen title, which switches to « Modifier le
 * tableau » on that very path (`T11.6`), would contradict the banner.
 */
const COLUMNS_SAVE_FAILED_MESSAGE =
  'Le tableau est enregistré, mais pas ses listes. Réessayez pour les enregistrer.';

/** Warning of the popup shown when leaving would lose the typed name (`D2`). */
const DISCARD_CHANGES_MESSAGE = 'Vos modifications ne seront pas enregistrées. Quitter ce tableau ?';

/** Label of the popup button that leaves the screen anyway (`D2`). */
const DISCARD_CONFIRM_LABEL = 'Quitter';

/** Label of the popup button that keeps the user on the screen (`D2`). */
const DISCARD_CANCEL_LABEL = 'Annuler';

/**
 * A note a card may reference. The whole note travels, title included (`D-C3`), so a case reads
 * the title the card displays rather than resolving an identifier.
 */
const NOTE_COURSES: Note = {
  id: 'note-courses',
  title: 'Liste de courses',
  category: null,
  blocks: [],
  updatedAt: '2026-11-10T08:00:00.000Z',
};

/**
 * A second note, which is what tells « the note of **this** card » from « a note » apart: with a
 * single one, a screen navigating to whichever note it finds first would pass (`T32.2`).
 */
const NOTE_PEINTURE: Note = {
  id: 'note-peinture',
  title: 'Choix de la peinture',
  category: null,
  blocks: [],
  updatedAt: '2026-11-10T09:00:00.000Z',
};

/** First card of the first list: a text, and no reference. */
const CARD_PAIN: KanbanCard = {
  id: 'card-pain',
  text: 'Acheter du pain',
  note: null,
  position: 0,
};

/** Second card of the first list: the one that must stay intact when the first is aimed at. */
const CARD_LAIT: KanbanCard = {
  id: 'card-lait',
  text: 'Acheter du lait',
  note: null,
  position: 1,
};

/**
 * Card of the second list, and the only one carrying a reference: removing it must leave its note
 * alone (`E146`), and unlinking it must leave its text alone (`E154`).
 */
const CARD_PEINDRE: KanbanCard = {
  id: 'card-peindre',
  text: 'Peindre le salon',
  note: NOTE_PEINTURE,
  position: 0,
};

/** The same first card, linked to a note, for the cases that need **two** linked cards. */
const CARD_PAIN_LINKED: KanbanCard = { ...CARD_PAIN, note: NOTE_COURSES };

/** First list with its two cards: two are needed for « this one, and it alone » to mean anything. */
const COLUMN_TO_DO_WITH_CARDS: KanbanColumn = { ...COLUMN_TO_DO, cards: [CARD_PAIN, CARD_LAIT] };

/** Second list, with the single card that carries a reference. */
const COLUMN_IN_PROGRESS_WITH_CARDS: KanbanColumn = {
  ...COLUMN_IN_PROGRESS,
  cards: [CARD_PEINDRE],
};

/**
 * Starting composition of the cards batch: **two** lists carrying cards. Two are enough here —
 * what a horizontal move needs is a neighbour, and `kanban-composition.spec.ts` is where the
 * notches and the landing ranks are exercised.
 */
const TWO_COLUMNS_WITH_CARDS: KanbanColumn[] = [
  COLUMN_TO_DO_WITH_CARDS,
  COLUMN_IN_PROGRESS_WITH_CARDS,
];

/** Composition where **two** cards of two different lists reference two different notes. */
const COLUMNS_WITH_TWO_LINKED_CARDS: KanbanColumn[] = [
  { ...COLUMN_TO_DO, cards: [CARD_PAIN_LINKED, CARD_LAIT] },
  COLUMN_IN_PROGRESS_WITH_CARDS,
];

/**
 * Text a card is stored under when the typed text is empty or made of spaces (`D-C30`). It reads
 * the same as the fallback of a board name and of a list name, and that is the point: one single
 * rule, in one single place.
 */
const FALLBACK_CARD_TEXT = 'Sans titre';

/**
 * What a case reads of a saved card (`D-EC5`): its text, its rank, and the note it references **by
 * identifier** — comparing two whole notes would freeze blocks no gesture of this screen touches.
 */
interface SavedCardOutline {
  text: string;
  position: number;
  noteId: string | null;
}

/**
 * The only part of the note picker these cases need (`D-EC6`): the `open` model the editor drives,
 * and the `selected` output it answers through. Declared here rather than imported, so this file
 * compiles before `NotePicker` exists.
 */
interface NotePickerHandle {
  open: { (): boolean; set: (open: boolean) => void };
  selected: { emit: (note: Note | null) => void };
}

describe("KanbanEditor (écran d'édition d'un tableau)", () => {
  let fixture: ComponentFixture<KanbanEditor>;
  let el: HTMLElement;
  let kanbanService: {
    getKanbanById: ReturnType<typeof vi.fn>;
    saveKanbanWithColumns: ReturnType<typeof vi.fn>;
    createKanban: ReturnType<typeof vi.fn>;
    renameKanban: ReturnType<typeof vi.fn>;
    getAllKanbans: ReturnType<typeof vi.fn>;
    deleteKanban: ReturnType<typeof vi.fn>;
  };
  let notesService: {
    getAllNotes: ReturnType<typeof vi.fn>;
    getNoteById: ReturnType<typeof vi.fn>;
    deleteNote: ReturnType<typeof vi.fn>;
  };
  let navigateSpy: ReturnType<typeof vi.spyOn>;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Mounts the screen in the mode the route asks for.
   *
   * The service double also exposes `getAllKanbans` and `deleteKanban`, which this screen never
   * calls, and keeps `createKanban` and `renameKanban` although the save now goes through
   * `saveKanbanWithColumns` (`E48`): exposing them makes a stray call visible instead of letting
   * it throw, and lets every save case state that neither is called directly.
   *
   * `NotesService` is doubled as well (`D-EC9`): the screen itself does not inject it, but the
   * note picker it hosts does (`D-C32`), and the real service opens a database connection in its
   * constructor. Its `deleteNote` is what `E146` reads — a deletion that must never be asked
   * for.
   *
   * The save double echoes what it receives (`D-EL6`): the board it hands back carries the name
   * and the composition it was given, and the identifier it was given — or a fresh one when it
   * got none, as a creation does. A case needing a failure, a half success (`columnsSaved: false`)
   * or a specific stored board overrides it after the call to this function.
   * @param options.id The identifier carried by the route; absent means creation mode.
   * @param options.board The board the single-read double answers with, for cases needing a
   * specific composition.
   * @param options.getKanbanById The single-read double, for cases expecting a specific answer
   * (missing board, read failure, deferred answer).
   */
  async function setup(
    options: { id?: string; board?: Kanban; getKanbanById?: ReturnType<typeof vi.fn> } = {},
  ): Promise<void> {
    const boardToRead = options.board ?? EXISTING_KANBAN;
    const readKanban = options.getKanbanById ?? vi.fn().mockResolvedValue(boardToRead);
    const echoSavedBoard = async (
      id: string | null,
      name: string,
      columns: KanbanColumn[],
    ): Promise<KanbanSaveResult> => {
      const savedId = id ?? CREATED_KANBAN_ID;
      const savedKanban: Kanban = { id: savedId, name, updatedAt: SAVED_UPDATED_AT, columns };
      return { kanban: savedKanban, columnsSaved: true };
    };
    kanbanService = {
      getKanbanById: readKanban,
      saveKanbanWithColumns: vi.fn(echoSavedBoard),
      createKanban: vi.fn().mockResolvedValue(EXISTING_KANBAN),
      renameKanban: vi.fn().mockResolvedValue(EXISTING_KANBAN),
      getAllKanbans: vi.fn().mockResolvedValue([]),
      deleteKanban: vi.fn().mockResolvedValue(undefined),
    };
    notesService = {
      getAllNotes: vi.fn().mockResolvedValue([NOTE_COURSES, NOTE_PEINTURE]),
      getNoteById: vi.fn().mockResolvedValue(NOTE_COURSES),
      deleteNote: vi.fn().mockResolvedValue(undefined),
    };

    const routeParams = options.id === undefined ? {} : { id: options.id };
    const activatedRouteStub = { snapshot: { paramMap: convertToParamMap(routeParams) } };

    await TestBed.configureTestingModule({
      imports: [KanbanEditor],
      providers: [
        provideRouter([]),
        { provide: KanbanService, useValue: kanbanService },
        { provide: NotesService, useValue: notesService },
        { provide: ActivatedRoute, useValue: activatedRouteStub },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(KanbanEditor);
    el = fixture.nativeElement as HTMLElement;
  }

  /** Triggers the first render, lets the data source answer, then refreshes the DOM. */
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Tells whether an element is currently on screen.
   * @param selector The CSS selector looked up in the screen template.
   * @returns True when at least one element matches.
   */
  function isShown(selector: string): boolean {
    const found = el.querySelector(selector);
    return found !== null;
  }

  /**
   * Reads the text of an element, ignoring how the template lays it out: non-breaking spaces
   * become plain ones, and runs of whitespace collapse to a single space. Lets a label be checked
   * without freezing the icon, line break or indentation the template puts around it.
   * @param selector The CSS selector looked up in the screen template.
   * @returns The normalized text, trimmed, or an empty string when the element is absent.
   */
  function normalizedTextOf(selector: string): string {
    const found = el.querySelector(selector);
    const raw = found?.textContent ?? '';
    return raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Clicks an element of the screen, then waits for the screen to finish updating.
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
   * Gives the addresses the screen asked the router to go to. What matters is the screen reached,
   * not the way of reaching it; this screen navigates from code only, so the spied `navigate` is
   * the single source — unlike the board list, which also navigates through template links.
   * @returns The requested addresses, in call order.
   */
  function navigations(): string[] {
    return navigateSpy.mock.calls.map((call: unknown[]) => (call[0] as unknown[]).join('/'));
  }

  /**
   * Presses the Escape key the way the user would, on the document itself: the confirmation popup
   * listens for it through a host listener, not through any element of this screen.
   */
  async function pressEscape(): Promise<void> {
    const escapeKeyDown = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(escapeKeyDown);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Types a board name the way the user would, through the name field, then lets the screen
   * update. Going through the field rather than the component signal keeps the test black-box:
   * the binding is part of what is being checked.
   * @param name The name to type.
   * @throws When the name field is not on screen, which would signal an unexpected state.
   */
  async function typeName(name: string): Promise<void> {
    const field = nameInput();
    if (field === null) {
      throw new Error('Aucun champ de nom à remplir.');
    }
    field.value = name;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Counts the writes asked of the data source, whatever the operation: the grouped save the
   * save button presses (`E48`), and the three single writes this screen no longer calls —
   * counted so that a stray call shows up here rather than passing unnoticed.
   * @returns The number of write calls the double received.
   */
  function writeCalls(): number {
    const saved = kanbanService.saveKanbanWithColumns.mock.calls.length;
    const created = kanbanService.createKanban.mock.calls.length;
    const renamed = kanbanService.renameKanban.mock.calls.length;
    const deleted = kanbanService.deleteKanban.mock.calls.length;
    return saved + created + renamed + deleted;
  }

  /**
   * Gives the grouped saves asked of the data source, in call order, as what they carry: the
   * identifier of the board — `null` for a creation (`D-L24`) —, the name to store and the
   * composition shown.
   * @returns One entry per call, in call order.
   */
  function saveCalls(): { id: string | null; name: string; columns: KanbanColumn[] }[] {
    const calls = kanbanService.saveKanbanWithColumns.mock.calls;
    return calls.map((call: unknown[]) => ({
      id: call[0] as string | null,
      name: call[1] as string,
      columns: call[2] as KanbanColumn[],
    }));
  }

  /**
   * Gives the composition carried by the last grouped save. Identifiers and positions are not
   * displayed anywhere, so this is where the cases bearing on them read what the screen holds
   * (`D-EL5`).
   * @returns The columns of the last call, or an empty composition when no save was asked.
   */
  function lastSavedColumns(): KanbanColumn[] {
    const requestedSaves = saveCalls();
    const lastSave = requestedSaves[requestedSaves.length - 1] ?? null;
    return lastSave === null ? [] : lastSave.columns;
  }

  /**
   * Gives the name and the position of each column of the last grouped save, in call order:
   * what a case about the order or the renumbering of the composition needs, and nothing else.
   * @returns One name and position per saved column.
   */
  function lastSavedOutline(): { name: string; position: number }[] {
    const savedColumns = lastSavedColumns();
    return savedColumns.map((column) => ({ name: column.name, position: column.position }));
  }

  /**
   * Gives the board name input.
   * @returns The input, or `null` when the screen does not show it (loading, load error).
   */
  function nameInput(): HTMLInputElement | null {
    return el.querySelector<HTMLInputElement>('.editor-name');
  }

  /** Lets the screen finish updating after an interaction driven from an element. */
  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Clicks an element the test already holds, then waits for the screen to finish updating.
   * Unlike {@link clickOn} it takes the element itself, which is the only way to reach a control
   * carried by one column among several.
   * @param target The element to click.
   * @param role What that element is, named in the failure message when it is missing.
   * @throws When the element is absent, which would signal an unexpected template.
   */
  async function clickElement(target: HTMLElement | null, role: string): Promise<void> {
    if (target === null) {
      throw new Error(`Aucun élément « ${role} » à cliquer.`);
    }
    target.click();
    await settle();
  }

  /**
   * Mounts the screen on an existing board carrying that composition, and renders it.
   * @param columns The columns the data source answers with, in their stored order.
   */
  async function openBoardWithColumns(columns: KanbanColumn[]): Promise<void> {
    const boardToEdit: Kanban = { ...EXISTING_KANBAN, columns };
    await setup({ id: EXISTING_KANBAN.id, board: boardToEdit });
    await render();
  }

  /**
   * Gives the column panels rendered in the board content area, in display order.
   * @returns One element per rendered column, left to right.
   */
  function columnPanels(): HTMLElement[] {
    const panels = el.querySelectorAll<HTMLElement>('app-kanban-column');
    return Array.from(panels);
  }

  /**
   * Gives the names the columns display, in display order. The text is trimmed but **not**
   * normalized (`D-EL7`): inner spaces are part of a column name, so collapsing runs of spaces
   * would hide what the cleaning cases check.
   * @returns One name per rendered column, left to right.
   */
  function columnNamesShown(): string[] {
    const panels = columnPanels();
    return panels.map((panel) => {
      const nameElement = panel.querySelector('.column-name');
      const displayedName = nameElement?.textContent ?? '';
      return displayedName.trim();
    });
  }

  /**
   * Gives the move buttons of one direction, in display order: the button of rank `i` is the one
   * of the column of rank `i` (`D-EL1`).
   * @param direction The direction the buttons move a column towards.
   * @returns One button per rendered column, left to right.
   */
  function moveButtonsOf(direction: 'left' | 'right'): HTMLButtonElement[] {
    const buttons = el.querySelectorAll<HTMLButtonElement>(`.btn-move-${direction}`);
    return Array.from(buttons);
  }

  /**
   * Opens the in-place field of a new column, the way the add gesture does (`D-L18`).
   * @throws When the add button is not on screen, which would signal an unexpected state.
   */
  async function openAddColumnField(): Promise<void> {
    const addButton = el.querySelector<HTMLElement>('.btn-add-column');
    await clickElement(addButton, "ajout d'une liste");
  }

  /**
   * Types a name in the field of the new column, leaving the field open.
   * @param typedName The name to type, as the user would.
   * @throws When the field is not open, which would signal an unexpected state.
   */
  async function typeNewColumnName(typedName: string): Promise<void> {
    const field = el.querySelector<HTMLInputElement>('.new-column-name');
    if (field === null) {
      throw new Error('Aucun champ de nom de nouvelle liste à remplir.');
    }
    field.value = typedName;
    field.dispatchEvent(new Event('input'));
    await settle();
  }

  /** Gives the add field up, which must leave the composition untouched. */
  async function giveUpAddColumn(): Promise<void> {
    const cancelButton = el.querySelector<HTMLElement>('.btn-add-cancel');
    await clickElement(cancelButton, "abandon de l'ajout d'une liste");
  }

  /**
   * Adds a column the way the user does: the add gesture, the name, then the validation. The
   * gesture is only played when the add button is there, the field being allowed to stay open
   * after a validation so columns can be added in a row (`D-EL3`).
   * @param typedName The name to type before validating.
   * @throws When the field or its validation button is missing.
   */
  async function addColumn(typedName: string): Promise<void> {
    const addButton = el.querySelector<HTMLElement>('.btn-add-column');
    if (addButton !== null) {
      await openAddColumnField();
    }
    await typeNewColumnName(typedName);
    const confirmButton = el.querySelector<HTMLElement>('.btn-add-confirm');
    await clickElement(confirmButton, "validation de l'ajout d'une liste");
  }

  /**
   * Renames the column of that rank through its own panel: its displayed name opens the in-place
   * field, which is then filled and validated.
   * @param index The rank of the column to rename, counted from the left.
   * @param typedName The name to type, emitted as it is typed by the panel (`D-L23`).
   * @throws When the panel, its name, its field or its validation button is missing.
   */
  async function renameColumnAt(index: number, typedName: string): Promise<void> {
    const panels = columnPanels();
    const panelToRename = panels[index] ?? null;
    const nameElement = panelToRename?.querySelector<HTMLElement>('.column-name') ?? null;
    await clickElement(nameElement, `nom de la liste de rang ${index}`);

    const openedPanels = columnPanels();
    const openedPanel = openedPanels[index] ?? null;
    const field = openedPanel?.querySelector<HTMLInputElement>('.column-name-input') ?? null;
    if (field === null) {
      throw new Error(`Aucun champ de renommage sur la liste de rang ${index}.`);
    }
    field.value = typedName;
    field.dispatchEvent(new Event('input'));
    await settle();

    const filledPanels = columnPanels();
    const filledPanel = filledPanels[index] ?? null;
    const confirmButton = filledPanel?.querySelector<HTMLElement>('.btn-rename-confirm') ?? null;
    await clickElement(confirmButton, `validation du renommage de rang ${index}`);
  }

  /**
   * Asks for the removal of the column of that rank, through the trash of its own panel. The
   * panel only emits a request: the confirmation belongs to the editor (`D-L4`).
   * @param index The rank of the column to remove, counted from the left.
   * @throws When the panel or its trash is missing.
   */
  async function requestRemovalOfColumnAt(index: number): Promise<void> {
    const panels = columnPanels();
    const panelToRemove = panels[index] ?? null;
    const trashButton = panelToRemove?.querySelector<HTMLElement>('.btn-remove-column') ?? null;
    await clickElement(trashButton, `corbeille de la liste de rang ${index}`);
  }

  /**
   * Moves the column of that rank one step in that direction, through the button the editor
   * renders beside it.
   * @param index The rank of the column to move, counted from the left.
   * @param direction The direction to move it towards.
   * @throws When the button is missing.
   */
  async function moveColumnAt(index: number, direction: 'left' | 'right'): Promise<void> {
    const buttons = moveButtonsOf(direction);
    const buttonToPress = buttons[index] ?? null;
    await clickElement(buttonToPress, `déplacement « ${direction} » de rang ${index}`);
  }

  /**
   * Gives the card panels rendered by the list of that rank, in display order.
   * @param columnIndex The rank of the list, counted from the left.
   * @returns One element per rendered card, top to bottom.
   */
  function cardPanelsOf(columnIndex: number): HTMLElement[] {
    const panels = columnPanels();
    const panelOfColumn = panels[columnIndex] ?? null;
    if (panelOfColumn === null) {
      return [];
    }
    const cardElements = panelOfColumn.querySelectorAll<HTMLElement>('app-kanban-card');
    return Array.from(cardElements);
  }

  /**
   * Gives the texts the cards of that list display, in display order, trimmed but **not**
   * normalized (`D-EL7`). A case bearing on the spaces of a text reads {@link rawCardTextOf}
   * instead (`D-EC8`).
   * @param columnIndex The rank of the list, counted from the left.
   * @returns One text per rendered card, top to bottom.
   */
  function cardTextsOf(columnIndex: number): string[] {
    const cards = cardPanelsOf(columnIndex);
    return cards.map((card: HTMLElement): string => {
      const textElement = card.querySelector('.card-text');
      const displayedText = textElement?.textContent ?? '';
      return displayedText.trim();
    });
  }

  /**
   * Gives the text of one card **exactly** as the panel renders it, spaces included: what a case
   * about the cleaning of a text needs, a trimmed reading letting a screen that cleans nothing
   * pass (`D-EC8`).
   * @param columnIndex The rank of the list, counted from the left.
   * @param cardIndex The rank of the card inside that list, counted from the top.
   * @returns The rendered text, or an empty string when the card or its text is absent.
   */
  function rawCardTextOf(columnIndex: number, cardIndex: number): string {
    const cards = cardPanelsOf(columnIndex);
    const cardAimedAt = cards[cardIndex] ?? null;
    const textElement = cardAimedAt?.querySelector('.card-text') ?? null;
    return textElement?.textContent ?? '';
  }

  /**
   * Gives the note titles the cards of that list display, in display order. A card without a
   * reference shows none, so it contributes nothing (`E117`): the length of the result is the
   * number of **linked** cards, not the number of cards.
   * @param columnIndex The rank of the list, counted from the left.
   * @returns One title per linked card, top to bottom.
   */
  function noteTitlesOf(columnIndex: number): string[] {
    const cards = cardPanelsOf(columnIndex);
    const shownTitles: string[] = [];
    cards.forEach((card: HTMLElement): void => {
      const titleElement = card.querySelector('.card-note-title');
      if (titleElement !== null) {
        const displayedTitle = titleElement.textContent ?? '';
        shownTitles.push(displayedTitle.trim());
      }
    });
    return shownTitles;
  }

  /**
   * Gives the texts of the cards marked as selected, **across the whole board**: the single
   * selection spans it (`D-C23`), so a case reads it here rather than list by list.
   * @returns One text per selected card, which `E148` holds to at most one.
   */
  function selectedCardTexts(): string[] {
    const selectedCards = el.querySelectorAll<HTMLElement>('.kanban-card.selected');
    const selectedElements = Array.from(selectedCards);
    return selectedElements.map((card: HTMLElement): string => {
      const textElement = card.querySelector('.card-text');
      const displayedText = textElement?.textContent ?? '';
      return displayedText.trim();
    });
  }

  /**
   * Opens the draft of a new card in the list of that rank, through the add button that list
   * renders (`E135`).
   * @param columnIndex The rank of the list the card is added to.
   * @throws When that list or its add button is missing.
   */
  async function startAddCardIn(columnIndex: number): Promise<void> {
    const panels = columnPanels();
    const panelAimedAt = panels[columnIndex] ?? null;
    const addButton = panelAimedAt?.querySelector<HTMLElement>('.btn-add-card') ?? null;
    await clickElement(addButton, `ajout d'une carte à la liste de rang ${columnIndex}`);
  }

  /**
   * Types a text in the field of the draft, leaving the draft open.
   * @param typedText The text to type, as the user would.
   * @throws When the draft field is not open.
   */
  async function typeNewCardText(typedText: string): Promise<void> {
    const field = el.querySelector<HTMLInputElement>('.new-card-text');
    if (field === null) {
      throw new Error('Aucun champ de texte de nouvelle carte à remplir.');
    }
    field.value = typedText;
    field.dispatchEvent(new Event('input'));
    await settle();
  }

  /** Validates the draft, which is the only moment the card enters the composition (`D-C29`). */
  async function confirmAddCard(): Promise<void> {
    const confirmButton = el.querySelector<HTMLElement>('.btn-new-card-confirm');
    await clickElement(confirmButton, "validation de l'ajout d'une carte");
  }

  /** Gives the draft up, which must leave the composition untouched (`E140`). */
  async function giveUpAddCard(): Promise<void> {
    const cancelButton = el.querySelector<HTMLElement>('.btn-new-card-cancel');
    await clickElement(cancelButton, "abandon de l'ajout d'une carte");
  }

  /**
   * Adds a card to that list the way the user does: the add gesture, the text, then the
   * validation. The gesture is only played when no draft is open, the draft being allowed to stay
   * open after a validation so cards can be added in a row (`D-EC3`).
   * @param columnIndex The rank of the list the card is added to.
   * @param typedText The text to type before validating.
   * @throws When the draft, its field or its validation button is missing.
   */
  async function addCardToColumn(columnIndex: number, typedText: string): Promise<void> {
    const openedDraft = el.querySelector<HTMLInputElement>('.new-card-text');
    if (openedDraft === null) {
      await startAddCardIn(columnIndex);
    }
    await typeNewCardText(typedText);
    await confirmAddCard();
  }

  /**
   * Retypes the text of one card through its own panel: its body opens the in-place entry, which
   * is then filled and validated. The panel emits the text **as it was typed** (`D-C30`), so what
   * a case reads back is what the screen made of it.
   * @param columnIndex The rank of the list holding the card.
   * @param cardIndex The rank of the card inside that list.
   * @param typedText The text to type.
   * @throws When the card, its entry or its validation button is missing.
   */
  async function retypeCardText(
    columnIndex: number,
    cardIndex: number,
    typedText: string,
  ): Promise<void> {
    await openTextEntryOf(columnIndex, cardIndex);

    const filledCards = cardPanelsOf(columnIndex);
    const filledCard = filledCards[cardIndex] ?? null;
    const field = filledCard?.querySelector<HTMLInputElement>('.card-text-input') ?? null;
    if (field === null) {
      throw new Error(`Aucun champ de texte sur la carte de rang ${cardIndex}.`);
    }
    field.value = typedText;
    field.dispatchEvent(new Event('input'));
    await settle();

    const typedCards = cardPanelsOf(columnIndex);
    const typedCard = typedCards[cardIndex] ?? null;
    const confirmButton = typedCard?.querySelector<HTMLElement>('.btn-text-confirm') ?? null;
    await clickElement(confirmButton, `validation du texte de la carte de rang ${cardIndex}`);
  }

  /**
   * Touches the body of one card, the single touch target that means two things: it opens the
   * text entry out of move mode (`E119`) and asks for the selection in move mode (`E120`).
   * @param columnIndex The rank of the list holding the card.
   * @param cardIndex The rank of the card inside that list.
   * @throws When the card or its body is missing.
   */
  async function touchCardBody(columnIndex: number, cardIndex: number): Promise<void> {
    const cards = cardPanelsOf(columnIndex);
    const cardAimedAt = cards[cardIndex] ?? null;
    const bodyButton = cardAimedAt?.querySelector<HTMLElement>('.card-body') ?? null;
    await clickElement(bodyButton, `corps de la carte de rang ${cardIndex}`);
  }

  /**
   * Opens the text entry of one card, which is what touching its body does **out** of move mode
   * (`E119`).
   * @param columnIndex The rank of the list holding the card.
   * @param cardIndex The rank of the card inside that list.
   */
  async function openTextEntryOf(columnIndex: number, cardIndex: number): Promise<void> {
    await touchCardBody(columnIndex, cardIndex);
  }

  /**
   * Gives the text entry of one card up, which emits nothing (`E122`) and brings the card back to
   * rest so its text and its note title can be read. Does nothing when no entry is open: that
   * state belongs to the card panel (`D-PC1`), not to the screen under test.
   * @param columnIndex The rank of the list holding the card.
   * @param cardIndex The rank of the card inside that list.
   */
  async function giveUpTextEntryOf(columnIndex: number, cardIndex: number): Promise<void> {
    const cards = cardPanelsOf(columnIndex);
    const cardAimedAt = cards[cardIndex] ?? null;
    const cancelButton = cardAimedAt?.querySelector<HTMLElement>('.btn-text-cancel') ?? null;
    if (cancelButton === null) {
      return;
    }
    await clickElement(cancelButton, `abandon de la saisie de la carte de rang ${cardIndex}`);
  }

  /**
   * Asks for the removal of one card, through the trash its own panel carries. The panel only
   * emits a request: the confirmation belongs to the editor (`D-C28`).
   * @param columnIndex The rank of the list holding the card.
   * @param cardIndex The rank of the card inside that list.
   * @throws When the card or its trash is missing.
   */
  async function requestRemovalOfCard(columnIndex: number, cardIndex: number): Promise<void> {
    const cards = cardPanelsOf(columnIndex);
    const cardAimedAt = cards[cardIndex] ?? null;
    const trashButton = cardAimedAt?.querySelector<HTMLElement>('.btn-remove-card') ?? null;
    await clickElement(trashButton, `corbeille de la carte de rang ${cardIndex}`);
  }

  /**
   * Toggles the move mode through the « déplacer » button of that list. The mode is worth the
   * whole board whichever list it was touched from (`D-C23`).
   * @param columnIndex The rank of the list whose button is touched.
   * @throws When that list or its button is missing.
   */
  async function toggleMoveModeFrom(columnIndex: number): Promise<void> {
    const panels = columnPanels();
    const panelAimedAt = panels[columnIndex] ?? null;
    const toggleButton =
      panelAimedAt?.querySelector<HTMLElement>('.btn-toggle-move-mode') ?? null;
    await clickElement(toggleButton, `bascule du mode déplacement depuis le rang ${columnIndex}`);
  }

  /**
   * Selects one card by touching its body **in move mode**, where that very touch asks for the
   * selection instead of opening the entry (`E120`).
   * @param columnIndex The rank of the list holding the card.
   * @param cardIndex The rank of the card inside that list.
   * @throws When the card or its body is missing.
   */
  async function selectCard(columnIndex: number, cardIndex: number): Promise<void> {
    await touchCardBody(columnIndex, cardIndex);
  }

  /**
   * Moves the selected card one notch, through the arrow of that direction. Only the list holding
   * the selected card renders them (`D-C26`), so the selector is unambiguous.
   * @param direction Where the selected card is asked to go.
   * @throws When that arrow is not rendered.
   */
  async function moveSelectedCard(direction: 'up' | 'down' | 'left' | 'right'): Promise<void> {
    const arrowButton = el.querySelector<HTMLElement>(`.btn-card-move-${direction}`);
    await clickElement(arrowButton, `flèche « ${direction} » de la carte sélectionnée`);
  }

  /**
   * Asks for the choice of a note for one card, through the reference control its text entry
   * carries (`D-PC3`): the entry is therefore opened first, and left open — closing it is the job
   * of {@link giveUpTextEntryOf}.
   * @param columnIndex The rank of the list holding the card.
   * @param cardIndex The rank of the card inside that list.
   * @throws When the card, its entry or its reference control is missing.
   */
  async function requestNoteFor(columnIndex: number, cardIndex: number): Promise<void> {
    await openTextEntryOf(columnIndex, cardIndex);

    const openedCards = cardPanelsOf(columnIndex);
    const openedCard = openedCards[cardIndex] ?? null;
    const noteButton = openedCard?.querySelector<HTMLElement>('.btn-card-note') ?? null;
    await clickElement(noteButton, `contrôle de référence de la carte de rang ${cardIndex}`);
  }

  /**
   * Asks for the choice of a note for the **draft** being typed, which is a target like any other
   * (`E152`).
   * @throws When the draft or its reference control is missing.
   */
  async function requestNoteForDraft(): Promise<void> {
    const noteButton = el.querySelector<HTMLElement>('.btn-new-card-note');
    await clickElement(noteButton, 'contrôle de référence de la nouvelle carte');
  }

  /**
   * Gives the note picker the screen hosts, taken through its element rather than through an
   * import (`D-EC6`).
   * @returns The `open` model the editor drives, and the `selected` output it answers through.
   * @throws When the screen renders no picker, which `D-EC7` requires it to.
   */
  function notePicker(): NotePickerHandle {
    const pickerElement = fixture.debugElement.query(By.css('app-note-picker'));
    if (pickerElement === null) {
      throw new Error('Aucune popup de sélection de note dans le gabarit.');
    }
    return pickerElement.componentInstance as NotePickerHandle;
  }

  /**
   * Tells whether the note picker is open, which is the editor's own side of the contract: it
   * drives `[(open)]` (`D-EC6`).
   * @returns True when the screen holds the picker open.
   */
  function notePickerIsOpen(): boolean {
    const picker = notePicker();
    return picker.open();
  }

  /**
   * Answers the picker the way the user's choice does: the whole note, or `null` for the explicit
   * « Aucune note » (`D-C33`).
   * @param chosenNote The note chosen, or `null` for « Aucune note ».
   */
  async function chooseNoteInPicker(chosenNote: Note | null): Promise<void> {
    const picker = notePicker();
    picker.selected.emit(chosenNote);
    await settle();
  }

  /**
   * Gives the picker up the way a click outside of it does: it closes and emits **nothing**, so
   * the screen has nothing to handle (`E155`).
   */
  async function giveUpNotePicker(): Promise<void> {
    const picker = notePicker();
    picker.open.set(false);
    await settle();
  }

  /**
   * Links a note to one card the way the user does, and brings the card back to rest: the entry
   * it went through emits nothing when given up (`E122`), so it cannot change what a case reads.
   * @param columnIndex The rank of the list holding the card.
   * @param cardIndex The rank of the card inside that list.
   * @param chosenNote The note chosen, or `null` for « Aucune note ».
   */
  async function linkNoteTo(
    columnIndex: number,
    cardIndex: number,
    chosenNote: Note | null,
  ): Promise<void> {
    await requestNoteFor(columnIndex, cardIndex);
    await chooseNoteInPicker(chosenNote);
    await giveUpTextEntryOf(columnIndex, cardIndex);
  }

  /**
   * Asks for the opening of the note one card references, through the title it displays: a
   * request, not a navigation — the screen is the one that decides (`D-C37`).
   * @param columnIndex The rank of the list holding the card.
   * @param cardIndex The rank of the card inside that list.
   * @throws When the card or its note title is missing.
   */
  async function openNoteOf(columnIndex: number, cardIndex: number): Promise<void> {
    const cards = cardPanelsOf(columnIndex);
    const cardAimedAt = cards[cardIndex] ?? null;
    const titleButton = cardAimedAt?.querySelector<HTMLElement>('.card-note-title') ?? null;
    await clickElement(titleButton, `titre de note de la carte de rang ${cardIndex}`);
  }

  /**
   * Gives the address of the screen that edits one note, which is where `US5` sends the user.
   * @param note The note to open.
   * @returns The address as {@link navigations} reads it.
   */
  function noteRouteOf(note: Note): string {
    return `/notes/edit/${note.id}`;
  }

  /**
   * Gives the cards carried by one list of the last grouped save, as what a case bears on
   * (`D-EC5`): their text, their rank and the note they reference by identifier.
   * @param columnIndex The rank of the list, counted from the left.
   * @returns One entry per saved card, in the order the save carried them.
   */
  function savedCardsOf(columnIndex: number): SavedCardOutline[] {
    const savedColumns = lastSavedColumns();
    const savedColumn = savedColumns[columnIndex] ?? null;
    const savedCards = savedColumn?.cards ?? [];
    return savedCards.map((card: KanbanCard): SavedCardOutline => {
      const referencedNote: Note | null = card.note;
      return { text: card.text, position: card.position, noteId: referencedNote?.id ?? null };
    });
  }

  /**
   * Gives the identifiers of the cards one list carried in the last grouped save. Identifiers are
   * displayed nowhere, so this is where a case about a **fresh** one reads it (`D-EC5`, `D-C20`).
   * @param columnIndex The rank of the list, counted from the left.
   * @returns One identifier per saved card, in the order the save carried them.
   */
  function savedCardIdsOf(columnIndex: number): string[] {
    const savedColumns = lastSavedColumns();
    const savedColumn = savedColumns[columnIndex] ?? null;
    const savedCards = savedColumn?.cards ?? [];
    return savedCards.map((card: KanbanCard): string => card.id);
  }

  // ---------------------------------------------------------------------------
  // Groupe 2 — Ouverture d'un tableau neuf (`/kanban/new`)
  // ---------------------------------------------------------------------------
  describe("Ouverture d'un tableau neuf", () => {
    it('T2.1 affiche un champ de nom vide portant « Sans titre » en simple indication', async () => {
      await setup();
      await render();

      const field = nameInput();
      expect(field).not.toBeNull();

      const displayedValue = field?.value;
      const displayedPlaceholder = field?.placeholder;

      expect(displayedValue).toBe('');
      expect(displayedPlaceholder).toBe(NAME_PLACEHOLDER);
    });

    it("T2.2 ne demande aucune lecture à la source de données : il n'y a rien à charger", async () => {
      await setup();
      await render();

      expect(kanbanService.getKanbanById).not.toHaveBeenCalled();
    });

    it("T2.3 n'affiche aucun indicateur de chargement : un tableau neuf n'attend rien de la base", async () => {
      await setup();

      fixture.detectChanges();
      const overlayWhileOpening = isShown('.loading-overlay');
      const spinnerWhileOpening = isShown('.spinner');

      await fixture.whenStable();
      fixture.detectChanges();
      const overlayOnceOpen = isShown('.loading-overlay');
      const spinnerOnceOpen = isShown('.spinner');

      expect(overlayWhileOpening).toBe(false);
      expect(spinnerWhileOpening).toBe(false);
      expect(overlayOnceOpen).toBe(false);
      expect(spinnerOnceOpen).toBe(false);
    });

    it("T2.4 affiche « Nouveau tableau » comme titre de l'écran", async () => {
      await setup();
      await render();

      const displayedTitle = normalizedTextOf('.editor-navbar-title');

      expect(displayedTitle).toBe(CREATION_SCREEN_TITLE);
    });

    it("T2.5 n'écrit rien à l'ouverture : en repartir ne laisse aucun tableau fantôme dans la liste", async () => {
      await setup();
      await render();

      const writesOnOpening = writeCalls();

      expect(writesOnOpening).toBe(0);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 3 — Ouverture d'un tableau existant (`/kanban/edit/:id`)
  // ---------------------------------------------------------------------------
  describe("Ouverture d'un tableau existant", () => {
    it('T3.1 demande le tableau de la route une seule fois, sur son identifiant', async () => {
      await setup({ id: EXISTING_KANBAN.id });
      await render();

      expect(kanbanService.getKanbanById).toHaveBeenCalledTimes(1);
      expect(kanbanService.getKanbanById).toHaveBeenCalledWith(EXISTING_KANBAN.id);
    });

    it('T3.2 pré-remplit le champ de nom avec le nom du tableau', async () => {
      await setup({ id: EXISTING_KANBAN.id });
      await render();

      const field = nameInput();
      expect(field).not.toBeNull();

      const displayedValue = field?.value;

      expect(displayedValue).toBe(EXISTING_KANBAN.name);
    });

    it("T3.3 affiche « Modifier le tableau » comme titre de l'écran", async () => {
      await setup({ id: EXISTING_KANBAN.id });
      await render();

      const displayedTitle = normalizedTextOf('.editor-navbar-title');

      expect(displayedTitle).toBe(EDITION_SCREEN_TITLE);
    });

    it("T3.4 affiche un indicateur de chargement tant que la source n'a pas répondu, puis le retire", async () => {
      let respond!: (kanban: Kanban) => void;
      const pendingRead = new Promise<Kanban>((resolve) => {
        respond = resolve;
      });
      const deferredRead = vi.fn().mockReturnValue(pendingRead);

      await setup({ id: EXISTING_KANBAN.id, getKanbanById: deferredRead });

      fixture.detectChanges();
      const overlayWhileLoading = isShown('.loading-overlay');
      const spinnerWhileLoading = isShown('.spinner');

      respond(EXISTING_KANBAN);
      await fixture.whenStable();
      fixture.detectChanges();

      const overlayOnceLoaded = isShown('.loading-overlay');
      const spinnerOnceLoaded = isShown('.spinner');
      const fieldOnceLoaded = nameInput();

      expect(overlayWhileLoading).toBe(true);
      expect(spinnerWhileLoading).toBe(true);
      expect(overlayOnceLoaded).toBe(false);
      expect(spinnerOnceLoaded).toBe(false);
      expect(fieldOnceLoaded).not.toBeNull();
    });

    it("T3.5 n'écrit rien à l'ouverture d'un tableau existant", async () => {
      await setup({ id: EXISTING_KANBAN.id });
      await render();

      const writesOnOpening = writeCalls();

      expect(writesOnOpening).toBe(0);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 4 — Identifiant inexistant et erreur de chargement
  // ---------------------------------------------------------------------------
  describe('Identifiant inexistant et erreur de chargement', () => {
    it("T4.1 affiche « Tableau introuvable. » et un bouton de retour quand aucun tableau ne porte l'identifiant de la route, sans navigation spontanée", async () => {
      const missingBoard = vi.fn().mockResolvedValue(null);

      await setup({ id: 'k-disparu', getKanbanById: missingBoard });
      await render();

      const notFoundShown = isShown('.not-found');
      const notFoundText = normalizedTextOf('.not-found');
      const backToListShown = isShown('.not-found .btn-back-to-list');
      const requestedNavigations = navigations();
      const loadErrorShown = isShown('.error-state');
      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const fieldShown = isShown('.editor-name');
      const saveShown = isShown('.btn-save');

      expect(notFoundShown).toBe(true);
      expect(notFoundText).toContain(BOARD_NOT_FOUND_MESSAGE);
      expect(backToListShown).toBe(true);
      expect(requestedNavigations).toEqual([]);
      expect(loadErrorShown).toBe(false);
      expect(confirmPopupShown).toBe(false);
      expect(fieldShown).toBe(false);
      expect(saveShown).toBe(false);
    });

    it("T4.1b ramène à la liste quand on touche « Revenir à la liste » depuis l'état « introuvable »", async () => {
      const missingBoard = vi.fn().mockResolvedValue(null);

      await setup({ id: 'k-disparu', getKanbanById: missingBoard });
      await render();

      const navigationsBeforeClick = navigations();

      await clickOn('.not-found .btn-back-to-list');

      const navigationsAfterClick = navigations();

      expect(navigationsBeforeClick).toEqual([]);
      expect(navigationsAfterClick).toEqual([KANBAN_LIST_ROUTE]);
    });

    it("T4.2 affiche « Impossible de charger ce tableau. » quand la lecture échoue, retire l'indicateur de chargement et n'affiche ni champ de nom ni « Enregistrer »", async () => {
      const failingRead = vi.fn().mockRejectedValue(new Error('Base indisponible'));

      await setup({ id: EXISTING_KANBAN.id, getKanbanById: failingRead });
      await render();

      const loadErrorShown = isShown('.error-state');
      const loadErrorText = normalizedTextOf('.error-state');
      const overlayShown = isShown('.loading-overlay');
      const spinnerShown = isShown('.spinner');
      const fieldShown = isShown('.editor-name');
      const saveShown = isShown('.btn-save');
      const navbarShown = isShown('.editor-navbar');
      const notFoundShown = isShown('.not-found');

      expect(loadErrorShown).toBe(true);
      expect(loadErrorText).toContain(LOAD_FAILED_MESSAGE);
      expect(overlayShown).toBe(false);
      expect(spinnerShown).toBe(false);
      expect(fieldShown).toBe(false);
      expect(saveShown).toBe(false);
      expect(navbarShown).toBe(true);
      expect(notFoundShown).toBe(false);
    });

    it("T4.3 ramène à la liste quand on touche « Revenir à la liste » depuis l'erreur de chargement, sans popup de confirmation", async () => {
      const failingRead = vi.fn().mockRejectedValue(new Error('Base indisponible'));

      await setup({ id: EXISTING_KANBAN.id, getKanbanById: failingRead });
      await render();

      const navigationsBeforeClick = navigations();

      await clickOn('.error-state .btn-back-to-list');

      const navigationsAfterClick = navigations();
      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');

      expect(navigationsBeforeClick).toEqual([]);
      expect(navigationsAfterClick).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupShown).toBe(false);
    });

    it('T4.4 relance la lecture du tableau sur « Réessayer » : la source rétablie, le champ se remplit et le message d’erreur disparaît', async () => {
      const recoveringRead = vi
        .fn()
        .mockRejectedValueOnce(new Error('Base indisponible'))
        .mockResolvedValue(EXISTING_KANBAN);

      await setup({ id: EXISTING_KANBAN.id, getKanbanById: recoveringRead });
      await render();

      const loadErrorBeforeRetry = isShown('.error-state');
      const readIdentifiersBeforeRetry = recoveringRead.mock.calls.map(
        (call: unknown[]) => call[0],
      );

      await clickOn('.error-state .btn-retry');

      const loadErrorAfterRetry = isShown('.error-state');
      const field = nameInput();
      const displayedValue = field?.value;
      const readIdentifiersAfterRetry = recoveringRead.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      const requestedNavigations = navigations();

      expect(loadErrorBeforeRetry).toBe(true);
      expect(readIdentifiersBeforeRetry).toEqual([EXISTING_KANBAN.id]);
      expect(loadErrorAfterRetry).toBe(false);
      expect(displayedValue).toBe(EXISTING_KANBAN.name);
      expect(readIdentifiersAfterRetry).toEqual([EXISTING_KANBAN.id, EXISTING_KANBAN.id]);
      expect(requestedNavigations).toEqual([]);
    });

    it("T4.5 n'écrit rien depuis l'état d'erreur de chargement, pas même en réessayant", async () => {
      const failingRead = vi.fn().mockRejectedValue(new Error('Base indisponible'));

      await setup({ id: EXISTING_KANBAN.id, getKanbanById: failingRead });
      await render();

      const writesInErrorState = writeCalls();
      const saveShown = isShown('.btn-save');

      await clickOn('.error-state .btn-retry');

      const writesAfterRetry = writeCalls();
      const stillInErrorState = isShown('.error-state');

      expect(writesInErrorState).toBe(0);
      expect(saveShown).toBe(false);
      expect(writesAfterRetry).toBe(0);
      expect(stillInErrorState).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 5 — Enregistrement d'un tableau neuf
  // ---------------------------------------------------------------------------
  describe("Enregistrement d'un tableau neuf", () => {
    it('T5.1 demande la création avec le nom saisi sans ses espaces de début et de fin, les espaces intérieurs conservés', async () => {
      const typedName = '   Anniversaire de   Léa  ';
      const expectedStoredName = 'Anniversaire de   Léa';

      await setup();
      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const requestedSaves = saveCalls();

      expect(requestedSaves).toEqual([{ id: null, name: expectedStoredName, columns: [] }]);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
    });

    it('T5.2 crée le tableau sous le nom « Sans titre » quand le champ est laissé vide', async () => {
      await setup();
      await render();

      const fieldBeforeSave = nameInput();
      const valueBeforeSave = fieldBeforeSave?.value;

      await clickOn('.btn-save');

      const requestedSaves = saveCalls();

      expect(valueBeforeSave).toBe('');
      expect(requestedSaves).toEqual([{ id: null, name: FALLBACK_SAVED_NAME, columns: [] }]);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
    });

    it("T5.3 crée le tableau sous le nom « Sans titre » quand le nom saisi n'est fait que d'espaces", async () => {
      const spacesOnlyName = '    ';

      await setup();
      await render();
      await typeName(spacesOnlyName);

      const fieldBeforeSave = nameInput();
      const valueBeforeSave = fieldBeforeSave?.value;

      await clickOn('.btn-save');

      const requestedSaves = saveCalls();

      expect(valueBeforeSave).toBe(spacesOnlyName);
      expect(requestedSaves).toEqual([{ id: null, name: FALLBACK_SAVED_NAME, columns: [] }]);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
    });

    it('T5.4 ne demande aucun renommage en mode création : la création est la seule écriture', async () => {
      const typedName = 'Anniversaire de Léa';

      await setup();
      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const writesOnSave = writeCalls();
      const requestedSaves = saveCalls();

      expect(requestedSaves).toEqual([{ id: null, name: typedName, columns: [] }]);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
      expect(writesOnSave).toBe(1);
    });

    it('T5.5 ramène à la liste après une création réussie', async () => {
      const typedName = 'Anniversaire de Léa';

      await setup();
      await render();
      await typeName(typedName);

      const navigationsBeforeSave = navigations();

      await clickOn('.btn-save');

      const navigationsAfterSave = navigations();

      expect(navigationsBeforeSave).toEqual([]);
      expect(navigationsAfterSave).toEqual([KANBAN_LIST_ROUTE]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 6 — Enregistrement d'un tableau existant
  // ---------------------------------------------------------------------------
  describe("Enregistrement d'un tableau existant", () => {
    it("T6.1 demande le renommage sur l'identifiant de la route, avec le nom nettoyé", async () => {
      const routeIdentifier = 'k-de-la-route';
      const boardCarryingAnotherIdentifier: Kanban = {
        ...EXISTING_KANBAN,
        id: 'k-de-la-source',
      };
      const readBoard = vi.fn().mockResolvedValue(boardCarryingAnotherIdentifier);
      const typedName = '  Travaux du   garage  ';
      const expectedStoredName = 'Travaux du   garage';

      await setup({ id: routeIdentifier, getKanbanById: readBoard });
      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const requestedSaves = saveCalls();

      expect(requestedSaves).toEqual([
        { id: routeIdentifier, name: expectedStoredName, columns: [] },
      ]);
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
    });

    it('T6.2 ne demande aucune création en mode édition : le renommage est la seule écriture', async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const writesOnSave = writeCalls();
      const requestedSaves = saveCalls();

      expect(requestedSaves).toEqual([{ id: EXISTING_KANBAN.id, name: typedName, columns: [] }]);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
      expect(writesOnSave).toBe(1);
    });

    it("T6.3 renomme le tableau « Sans titre » quand l'utilisateur vide le champ", async () => {
      const emptiedName = '';

      await setup({ id: EXISTING_KANBAN.id });
      await render();

      const fieldOnceLoaded = nameInput();
      const valueOnceLoaded = fieldOnceLoaded?.value;

      await typeName(emptiedName);

      const fieldBeforeSave = nameInput();
      const valueBeforeSave = fieldBeforeSave?.value;

      await clickOn('.btn-save');

      const requestedSaves = saveCalls();

      expect(valueOnceLoaded).toBe(EXISTING_KANBAN.name);
      expect(valueBeforeSave).toBe('');
      expect(requestedSaves).toEqual([
        { id: EXISTING_KANBAN.id, name: FALLBACK_SAVED_NAME, columns: [] },
      ]);
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
    });

    it('T6.4 ramène à la liste après un renommage réussi', async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);

      const navigationsBeforeSave = navigations();

      await clickOn('.btn-save');

      const navigationsAfterSave = navigations();

      expect(navigationsBeforeSave).toEqual([]);
      expect(navigationsAfterSave).toEqual([KANBAN_LIST_ROUTE]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 7 — Échec de l'enregistrement
  // ---------------------------------------------------------------------------
  describe("Échec de l'enregistrement", () => {
    it("T7.1 reste affiché après un échec d'enregistrement : aucune navigation vers la liste", async () => {
      const writeFailure = new Error('Écriture refusée');
      const typedName = 'Anniversaire de Léa';

      await setup();
      kanbanService.saveKanbanWithColumns.mockRejectedValue(writeFailure);

      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const requestedNavigations = navigations();
      const editorStillShown = isShown('.kanban-editor');
      const requestedSaves = saveCalls();

      expect(requestedSaves.length).toBe(1);
      expect(requestedNavigations).toEqual([]);
      expect(editorStillShown).toBe(true);
    });

    it("T7.2 garde le nom saisi dans le champ après un échec : la frappe n'est pas perdue", async () => {
      const writeFailure = new Error('Écriture refusée');
      const typedName = '  Anniversaire de Léa  ';
      const expectedStoredName = 'Anniversaire de Léa';

      await setup();
      kanbanService.saveKanbanWithColumns.mockRejectedValue(writeFailure);

      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const fieldAfterFailure = nameInput();
      const valueAfterFailure = fieldAfterFailure?.value;
      const requestedSaves = saveCalls();

      expect(requestedSaves).toEqual([{ id: null, name: expectedStoredName, columns: [] }]);
      expect(fieldAfterFailure).not.toBeNull();
      expect(valueAfterFailure).toBe(typedName);
    });

    it("T7.3 affiche le bandeau « Impossible d'enregistrer le tableau. », annoncé comme une alerte", async () => {
      const writeFailure = new Error('Écriture refusée');
      const typedName = 'Anniversaire de Léa';

      await setup();
      kanbanService.saveKanbanWithColumns.mockRejectedValue(writeFailure);

      await render();
      await typeName(typedName);

      const bannerBeforeSave = isShown('.action-error');

      await clickOn('.btn-save');

      const bannerAfterSave = el.querySelector<HTMLElement>('.action-error');
      const bannerText = normalizedTextOf('.action-error');
      const bannerRole = bannerAfterSave?.getAttribute('role');

      expect(bannerBeforeSave).toBe(false);
      expect(bannerAfterSave).not.toBeNull();
      expect(bannerText).toContain(SAVE_FAILED_MESSAGE);
      expect(bannerRole).toBe('alert');
    });

    it("T7.4 efface le bandeau de l'essai précédent avant de retenter l'enregistrement", async () => {
      const writeFailure = new Error('Écriture refusée');
      const typedName = 'Anniversaire de Léa';

      const successfulSave: KanbanSaveResult = { kanban: EXISTING_KANBAN, columnsSaved: true };

      await setup();
      kanbanService.saveKanbanWithColumns
        .mockRejectedValueOnce(writeFailure)
        .mockResolvedValue(successfulSave);

      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const bannerAfterFirstAttempt = isShown('.action-error');

      await clickOn('.btn-save');

      const bannerAfterSecondAttempt = isShown('.action-error');
      const requestedSaves = saveCalls();
      const storedNames = requestedSaves.map((requestedSave) => requestedSave.name);

      expect(bannerAfterFirstAttempt).toBe(true);
      expect(bannerAfterSecondAttempt).toBe(false);
      expect(storedNames).toEqual([typedName, typedName]);
    });

    it("T7.5 ramène à la liste, bandeau disparu, quand on retouche le nom puis que l'enregistrement réussit", async () => {
      const writeFailure = new Error('Écriture refusée');
      const refusedName = 'Travaux du garage';
      const correctedName = 'Travaux de la cave';
      const renamedBoard: Kanban = { ...EXISTING_KANBAN, name: correctedName };

      const successfulSave: KanbanSaveResult = { kanban: renamedBoard, columnsSaved: true };

      await setup({ id: EXISTING_KANBAN.id });
      kanbanService.saveKanbanWithColumns
        .mockRejectedValueOnce(writeFailure)
        .mockResolvedValue(successfulSave);

      await render();
      await typeName(refusedName);
      await clickOn('.btn-save');

      const bannerAfterFailure = isShown('.action-error');
      const navigationsAfterFailure = navigations();

      await typeName(correctedName);
      await clickOn('.btn-save');

      const bannerAfterSuccess = isShown('.action-error');
      const navigationsAfterSuccess = navigations();
      const requestedSaves = saveCalls();

      expect(bannerAfterFailure).toBe(true);
      expect(navigationsAfterFailure).toEqual([]);
      expect(bannerAfterSuccess).toBe(false);
      expect(navigationsAfterSuccess).toEqual([KANBAN_LIST_ROUTE]);
      expect(requestedSaves).toEqual([
        { id: EXISTING_KANBAN.id, name: refusedName, columns: [] },
        { id: EXISTING_KANBAN.id, name: correctedName, columns: [] },
      ]);
    });

    it("T7.6 traite un tableau supprimé pendant l'édition comme n'importe quel échec d'enregistrement", async () => {
      const boardGoneFailure = new Error('Kanban introuvable');
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      kanbanService.saveKanbanWithColumns.mockRejectedValue(boardGoneFailure);

      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const editorStillShown = isShown('.kanban-editor');
      const fieldAfterFailure = nameInput();
      const valueAfterFailure = fieldAfterFailure?.value;
      const bannerText = normalizedTextOf('.action-error');
      const requestedNavigations = navigations();
      const notFoundShown = isShown('.not-found');
      const loadErrorShown = isShown('.error-state');

      expect(editorStillShown).toBe(true);
      expect(valueAfterFailure).toBe(typedName);
      expect(bannerText).toContain(SAVE_FAILED_MESSAGE);
      expect(bannerText).not.toContain('introuvable');
      expect(requestedNavigations).toEqual([]);
      expect(notFoundShown).toBe(false);
      expect(loadErrorShown).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 8 — Retour sans modification en attente
  // ---------------------------------------------------------------------------
  describe('Retour sans modification en attente', () => {
    it("T8.1 ramène immédiatement à la liste en mode création quand le champ est resté vide, sans aucune popup", async () => {
      await setup();
      await render();

      const navigationsBeforeBack = navigations();

      await clickOn('.btn-back');

      const navigationsAfterBack = navigations();
      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');

      expect(navigationsBeforeBack).toEqual([]);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupShown).toBe(false);
    });

    it('T8.2 ramène immédiatement à la liste en mode édition quand le nom est inchangé, sans popup', async () => {
      await setup({ id: EXISTING_KANBAN.id });
      await render();

      const fieldBeforeBack = nameInput();
      const valueBeforeBack = fieldBeforeBack?.value;
      const navigationsBeforeBack = navigations();

      await clickOn('.btn-back');

      const navigationsAfterBack = navigations();
      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');

      expect(valueBeforeBack).toBe(EXISTING_KANBAN.name);
      expect(navigationsBeforeBack).toEqual([]);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupShown).toBe(false);
    });

    it('T8.3 ne compte pas comme une modification le fait de retaper exactement le nom de départ', async () => {
      const intermediateName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(intermediateName);
      await typeName(EXISTING_KANBAN.name);

      const navigationsBeforeBack = navigations();

      await clickOn('.btn-back');

      const navigationsAfterBack = navigations();
      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');

      expect(navigationsBeforeBack).toEqual([]);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupShown).toBe(false);
    });

    it("T8.4 ne compte pas comme une modification l'ajout de seuls espaces en début ou en fin du nom", async () => {
      const paddedName = `  ${EXISTING_KANBAN.name}  `;

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(paddedName);

      const fieldBeforeBack = nameInput();
      const valueBeforeBack = fieldBeforeBack?.value;
      const navigationsBeforeBack = navigations();

      await clickOn('.btn-back');

      const navigationsAfterBack = navigations();
      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');

      expect(valueBeforeBack).toBe(paddedName);
      expect(navigationsBeforeBack).toEqual([]);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupShown).toBe(false);
    });

    it("T8.5 n'écrit rien quand le retour est immédiat : ni création ni renommage demandés", async () => {
      const intermediateName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(intermediateName);
      await typeName(EXISTING_KANBAN.name);
      await clickOn('.btn-back');

      const writesOnBack = writeCalls();
      const navigationsAfterBack = navigations();

      expect(writesOnBack).toBe(0);
      expect(kanbanService.saveKanbanWithColumns).not.toHaveBeenCalled();
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 9 — Retour avec modification en attente
  // ---------------------------------------------------------------------------
  describe('Retour avec modification en attente', () => {
    it("T9.1 ouvre la popup d'abandon quand le nom a été modifié, sans naviguer ni écrire tant que l'utilisateur n'a pas répondu", async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-leave .confirm-message');
      const confirmLabel = normalizedTextOf('.confirm-leave .confirm-card .btn-confirm');
      const cancelLabel = normalizedTextOf('.confirm-leave .confirm-card .btn-cancel');
      const requestedNavigations = navigations();
      const writesWhileWaiting = writeCalls();

      expect(confirmPopupShown).toBe(true);
      expect(confirmMessage).toBe(DISCARD_CHANGES_MESSAGE);
      expect(confirmLabel).toBe(DISCARD_CONFIRM_LABEL);
      expect(cancelLabel).toBe(DISCARD_CANCEL_LABEL);
      expect(requestedNavigations).toEqual([]);
      expect(writesWhileWaiting).toBe(0);
    });

    it("T9.2 ferme la popup et laisse l'utilisateur sur l'écran quand il touche « Annuler », sa saisie intacte", async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);
      await clickOn('.btn-back');

      const confirmPopupBeforeAnswer = isShown('.confirm-leave .confirm-backdrop');

      await clickOn('.confirm-leave .confirm-card .btn-cancel');

      const confirmPopupAfterAnswer = isShown('.confirm-leave .confirm-backdrop');
      const editorStillShown = isShown('.kanban-editor');
      const fieldAfterAnswer = nameInput();
      const valueAfterAnswer = fieldAfterAnswer?.value;
      const requestedNavigations = navigations();
      const writesOnCancel = writeCalls();

      expect(confirmPopupBeforeAnswer).toBe(true);
      expect(confirmPopupAfterAnswer).toBe(false);
      expect(editorStillShown).toBe(true);
      expect(valueAfterAnswer).toBe(typedName);
      expect(requestedNavigations).toEqual([]);
      expect(writesOnCancel).toBe(0);
    });

    it("T9.3 traite un clic hors de la popup comme « Annuler »", async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);
      await clickOn('.btn-back');

      const confirmPopupBeforeAnswer = isShown('.confirm-leave .confirm-backdrop');

      await clickOn('.confirm-leave .confirm-backdrop');

      const confirmPopupAfterAnswer = isShown('.confirm-leave .confirm-backdrop');
      const editorStillShown = isShown('.kanban-editor');
      const fieldAfterAnswer = nameInput();
      const valueAfterAnswer = fieldAfterAnswer?.value;
      const requestedNavigations = navigations();
      const writesOnBackdropClick = writeCalls();

      expect(confirmPopupBeforeAnswer).toBe(true);
      expect(confirmPopupAfterAnswer).toBe(false);
      expect(editorStillShown).toBe(true);
      expect(valueAfterAnswer).toBe(typedName);
      expect(requestedNavigations).toEqual([]);
      expect(writesOnBackdropClick).toBe(0);
    });

    it('T9.4 traite la touche Échap comme « Annuler »', async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);
      await clickOn('.btn-back');

      const confirmPopupBeforeAnswer = isShown('.confirm-leave .confirm-backdrop');

      await pressEscape();

      const confirmPopupAfterAnswer = isShown('.confirm-leave .confirm-backdrop');
      const editorStillShown = isShown('.kanban-editor');
      const fieldAfterAnswer = nameInput();
      const valueAfterAnswer = fieldAfterAnswer?.value;
      const requestedNavigations = navigations();
      const writesOnEscape = writeCalls();

      expect(confirmPopupBeforeAnswer).toBe(true);
      expect(confirmPopupAfterAnswer).toBe(false);
      expect(editorStillShown).toBe(true);
      expect(valueAfterAnswer).toBe(typedName);
      expect(requestedNavigations).toEqual([]);
      expect(writesOnEscape).toBe(0);
    });

    it("T9.5 ramène à la liste sans rien enregistrer quand l'utilisateur touche « Quitter »", async () => {
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      await render();
      await typeName(typedName);
      await clickOn('.btn-back');

      const navigationsBeforeAnswer = navigations();

      await clickOn('.confirm-leave .confirm-card .btn-confirm');

      const navigationsAfterAnswer = navigations();
      const writesOnDiscard = writeCalls();

      expect(navigationsBeforeAnswer).toEqual([]);
      expect(navigationsAfterAnswer).toEqual([KANBAN_LIST_ROUTE]);
      expect(writesOnDiscard).toBe(0);
      expect(kanbanService.saveKanbanWithColumns).not.toHaveBeenCalled();
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
    });

    it('T9.6 ne pose plus de question au retour après un enregistrement réussi', async () => {
      const typedName = 'Travaux du garage';
      const renamedBoard: Kanban = { ...EXISTING_KANBAN, name: typedName };

      const successfulSave: KanbanSaveResult = { kanban: renamedBoard, columnsSaved: true };

      await setup({ id: EXISTING_KANBAN.id });
      kanbanService.saveKanbanWithColumns.mockResolvedValue(successfulSave);

      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const navigationsAfterSave = navigations();

      await clickOn('.btn-back');

      const confirmPopupAfterBack = isShown('.confirm-leave .confirm-backdrop');
      const navigationsAfterBack = navigations();

      expect(navigationsAfterSave).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupAfterBack).toBe(false);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE, KANBAN_LIST_ROUTE]);
    });

    it("T9.7 demande toujours confirmation au retour après un échec d'enregistrement", async () => {
      const writeFailure = new Error('Écriture refusée');
      const typedName = 'Travaux du garage';

      await setup({ id: EXISTING_KANBAN.id });
      kanbanService.saveKanbanWithColumns.mockRejectedValue(writeFailure);

      await render();
      await typeName(typedName);
      await clickOn('.btn-save');

      const bannerAfterFailure = isShown('.action-error');
      const navigationsAfterFailure = navigations();

      await clickOn('.btn-back');

      const confirmPopupAfterBack = isShown('.confirm-leave .confirm-backdrop');
      const navigationsAfterBack = navigations();

      expect(bannerAfterFailure).toBe(true);
      expect(navigationsAfterFailure).toEqual([]);
      expect(confirmPopupAfterBack).toBe(true);
      expect(navigationsAfterBack).toEqual([]);
    });

    it("T9.8 ouvre la popup d'abandon en mode création dès qu'un nom a été tapé, le nom de départ étant vide", async () => {
      const typedName = 'Anniversaire de Léa';

      await setup();
      await render();
      await typeName(typedName);
      await clickOn('.btn-back');

      const confirmPopupAfterBack = isShown('.confirm-leave .confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-leave .confirm-message');
      const requestedNavigations = navigations();
      const writesWhileWaiting = writeCalls();

      expect(confirmPopupAfterBack).toBe(true);
      expect(confirmMessage).toBe(DISCARD_CHANGES_MESSAGE);
      expect(requestedNavigations).toEqual([]);
      expect(writesWhileWaiting).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 6 (listes) — Afficher la zone de contenu
  // ---------------------------------------------------------------------------
  describe('Affichage des listes du tableau', () => {
    it('T6.1 (listes) rend une liste par élément de la composition, dans son ordre', async () => {
      await openBoardWithColumns(THREE_COLUMNS);

      const renderedPanels = columnPanels();
      const displayedNames = columnNamesShown();
      const canvasShown = isShown('.board-canvas');
      const emptyStateShown = isShown('.board-canvas .no-columns');
      const ghostColumnShown = isShown('.ghost-column');

      expect(renderedPanels.length).toBe(3);
      expect(displayedNames).toEqual([COLUMN_TO_DO.name, COLUMN_IN_PROGRESS.name, COLUMN_DONE.name]);
      expect(canvasShown).toBe(true);
      expect(emptyStateShown).toBe(false);
      expect(ghostColumnShown).toBe(false);
    });

    it("T6.2 (listes) affiche l'état vide et le bouton d'ajout sur un tableau neuf", async () => {
      await setup();
      await render();

      const renderedPanels = columnPanels();
      const canvasShown = isShown('.board-canvas');
      const emptyStateShown = isShown('.board-canvas .no-columns');
      const emptyStateText = normalizedTextOf('.board-canvas .no-columns');
      const addButtonShown = isShown('.btn-add-column');

      expect(renderedPanels).toEqual([]);
      expect(canvasShown).toBe(true);
      expect(emptyStateShown).toBe(true);
      expect(emptyStateText.length).toBeGreaterThan(0);
      expect(addButtonShown).toBe(true);
    });

    it("T6.3 (listes) affiche le même état vide sur un tableau existant sans liste, la colonne fantôme ayant disparu", async () => {
      await openBoardWithColumns([]);

      const renderedPanels = columnPanels();
      const emptyStateShown = isShown('.board-canvas .no-columns');
      const emptyStateText = normalizedTextOf('.board-canvas .no-columns');
      const addButtonShown = isShown('.btn-add-column');
      const ghostColumnShown = isShown('.ghost-column');

      expect(renderedPanels).toEqual([]);
      expect(emptyStateShown).toBe(true);
      expect(emptyStateText.length).toBeGreaterThan(0);
      expect(addButtonShown).toBe(true);
      expect(ghostColumnShown).toBe(false);
    });

    it("T6.4 (listes) désactive « gauche » sur la première liste, sans masquer le bouton", async () => {
      await openBoardWithColumns(THREE_COLUMNS);

      const leftButtons = moveButtonsOf('left');
      const firstLeftButton = leftButtons[0] ?? null;

      expect(leftButtons.length).toBe(3);
      expect(firstLeftButton).not.toBeNull();
      expect(firstLeftButton?.disabled).toBe(true);
    });

    it("T6.5 (listes) désactive « droite » sur la dernière liste, sans masquer le bouton", async () => {
      await openBoardWithColumns(THREE_COLUMNS);

      const rightButtons = moveButtonsOf('right');
      const lastRightButton = rightButtons[2] ?? null;

      expect(rightButtons.length).toBe(3);
      expect(lastRightButton).not.toBeNull();
      expect(lastRightButton?.disabled).toBe(true);
    });

    it("T6.6 (listes) désactive les deux boutons quand le tableau n'a qu'une seule liste", async () => {
      await openBoardWithColumns([COLUMN_TO_DO]);

      const leftButtons = moveButtonsOf('left');
      const rightButtons = moveButtonsOf('right');
      const onlyLeftButton = leftButtons[0] ?? null;
      const onlyRightButton = rightButtons[0] ?? null;

      expect(leftButtons.length).toBe(1);
      expect(rightButtons.length).toBe(1);
      expect(onlyLeftButton?.disabled).toBe(true);
      expect(onlyRightButton?.disabled).toBe(true);
    });

    it("T6.7 (listes) laisse les deux boutons actifs sur une liste du milieu", async () => {
      await openBoardWithColumns(THREE_COLUMNS);

      const leftButtons = moveButtonsOf('left');
      const rightButtons = moveButtonsOf('right');
      const middleLeftButton = leftButtons[1] ?? null;
      const middleRightButton = rightButtons[1] ?? null;

      expect(middleLeftButton?.disabled).toBe(false);
      expect(middleRightButton?.disabled).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 7 (listes) — Ajouter une liste
  // ---------------------------------------------------------------------------
  describe("Ajout d'une liste", () => {
    it('T7.1 (listes) ajoute la liste saisie en dernière position', async () => {
      const addedName = 'Imprévus';

      await openBoardWithColumns(THREE_COLUMNS);
      await addColumn(addedName);

      const displayedNames = columnNamesShown();
      const emptyStateShown = isShown('.board-canvas .no-columns');

      expect(displayedNames).toEqual([
        COLUMN_TO_DO.name,
        COLUMN_IN_PROGRESS.name,
        COLUMN_DONE.name,
        addedName,
      ]);
      expect(emptyStateShown).toBe(false);
    });

    it('T7.2 (listes) donne un identifiant distinct à chacune des listes ajoutées à la suite', async () => {
      const firstAddedName = 'Courses';
      const secondAddedName = 'Bricolage';

      await setup();
      await render();
      await addColumn(firstAddedName);
      await addColumn(secondAddedName);
      await clickOn('.btn-save');

      const displayedNames = columnNamesShown();
      const savedColumns = lastSavedColumns();
      const savedIdentifiers = savedColumns.map((column) => column.id);
      const distinctIdentifiers = new Set(savedIdentifiers);
      const emptyIdentifiers = savedIdentifiers.filter((identifier) => identifier.length === 0);

      expect(displayedNames).toEqual([firstAddedName, secondAddedName]);
      expect(savedColumns.length).toBe(2);
      expect(distinctIdentifiers.size).toBe(2);
      expect(emptyIdentifiers).toEqual([]);
    });

    it('T7.3 (listes) retient un nom déjà propre tel quel, espaces intérieurs compris', async () => {
      const typedName = 'À faire   plus tard';

      await setup();
      await render();
      await addColumn(typedName);
      await clickOn('.btn-save');

      const displayedNames = columnNamesShown();
      const savedOutline = lastSavedOutline();

      expect(displayedNames).toEqual([typedName]);
      expect(savedOutline).toEqual([{ name: typedName, position: 0 }]);
    });

    it('T7.4 (listes) retire les espaces de début et de fin du nom saisi', async () => {
      const typedName = '   Imprévus   ';
      const expectedStoredName = 'Imprévus';

      await setup();
      await render();
      await addColumn(typedName);
      await clickOn('.btn-save');

      const displayedNames = columnNamesShown();
      const savedOutline = lastSavedOutline();

      expect(displayedNames).toEqual([expectedStoredName]);
      expect(savedOutline).toEqual([{ name: expectedStoredName, position: 0 }]);
    });

    it("T7.5 (listes) retient « Sans titre » quand la saisie d'ajout est vide", async () => {
      const spacesOnlyName = '   ';

      await setup();
      await render();
      await addColumn(spacesOnlyName);
      await clickOn('.btn-save');

      const displayedNames = columnNamesShown();
      const savedOutline = lastSavedOutline();

      expect(displayedNames).toEqual([FALLBACK_COLUMN_NAME]);
      expect(savedOutline).toEqual([{ name: FALLBACK_COLUMN_NAME, position: 0 }]);
    });

    it("T7.6 (listes) n'ajoute aucune liste quand la saisie d'ajout est abandonnée", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await openAddColumnField();
      await giveUpAddColumn();

      const displayedNames = columnNamesShown();
      const addButtonShown = isShown('.btn-add-column');

      expect(displayedNames).toEqual([COLUMN_TO_DO.name, COLUMN_IN_PROGRESS.name, COLUMN_DONE.name]);
      expect(addButtonShown).toBe(true);
    });

    it("T7.7 (listes) n'ajoute rien et ne laisse aucune modification en attente quand l'abandon suit une frappe", async () => {
      const abandonedName = 'Imprévus';

      await openBoardWithColumns(THREE_COLUMNS);
      await openAddColumnField();
      await typeNewColumnName(abandonedName);
      await giveUpAddColumn();
      await clickOn('.btn-back');

      const displayedNames = columnNamesShown();
      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const requestedNavigations = navigations();

      expect(displayedNames).toEqual([COLUMN_TO_DO.name, COLUMN_IN_PROGRESS.name, COLUMN_DONE.name]);
      expect(confirmPopupShown).toBe(false);
      expect(requestedNavigations).toEqual([KANBAN_LIST_ROUTE]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 8 (listes) — Renommer une liste
  // ---------------------------------------------------------------------------
  describe("Renommage d'une liste", () => {
    it('T8.1 (listes) ne change que le nom de la liste visée, sans toucher à sa place ni aux autres', async () => {
      const newName = 'En cours de test';

      await openBoardWithColumns(THREE_COLUMNS);
      await renameColumnAt(1, newName);
      await clickOn('.btn-save');

      const displayedNames = columnNamesShown();
      const savedColumns = lastSavedColumns();
      const savedIdentifiers = savedColumns.map((column) => column.id);
      const savedOutline = lastSavedOutline();

      expect(displayedNames).toEqual([COLUMN_TO_DO.name, newName, COLUMN_DONE.name]);
      expect(savedIdentifiers).toEqual([COLUMN_TO_DO.id, COLUMN_IN_PROGRESS.id, COLUMN_DONE.id]);
      expect(savedOutline).toEqual([
        { name: COLUMN_TO_DO.name, position: 0 },
        { name: newName, position: 1 },
        { name: COLUMN_DONE.name, position: 2 },
      ]);
    });

    it('T8.2 (listes) renomme la bonne des deux listes homonymes', async () => {
      const newName = 'Courses du samedi';

      await openBoardWithColumns(HOMONYM_COLUMNS);
      await renameColumnAt(1, newName);
      await clickOn('.btn-save');

      const displayedNames = columnNamesShown();
      const savedColumns = lastSavedColumns();
      const renamedColumn = savedColumns.find((column) => column.id === COLUMN_SHOPPING_B.id);
      const untouchedColumn = savedColumns.find((column) => column.id === COLUMN_SHOPPING_A.id);

      expect(displayedNames).toEqual([COLUMN_SHOPPING_A.name, newName, COLUMN_DONE.name]);
      expect(renamedColumn?.name).toBe(newName);
      expect(untouchedColumn?.name).toBe(COLUMN_SHOPPING_A.name);
    });

    it("T8.3 (listes) nettoie le nom reçu de la liste : espaces de bord retirés, intérieurs gardés", async () => {
      const typedName = '  Travaux   du garage  ';
      const expectedStoredName = 'Travaux   du garage';

      await openBoardWithColumns(THREE_COLUMNS);
      await renameColumnAt(0, typedName);
      await clickOn('.btn-save');

      const displayedNames = columnNamesShown();
      const savedOutline = lastSavedOutline();

      expect(displayedNames).toEqual([expectedStoredName, COLUMN_IN_PROGRESS.name, COLUMN_DONE.name]);
      expect(savedOutline).toEqual([
        { name: expectedStoredName, position: 0 },
        { name: COLUMN_IN_PROGRESS.name, position: 1 },
        { name: COLUMN_DONE.name, position: 2 },
      ]);
    });

    it("T8.4 (listes) retient « Sans titre » quand le nom reçu de la liste est vide", async () => {
      const spacesOnlyName = '   ';

      await openBoardWithColumns(THREE_COLUMNS);
      await renameColumnAt(0, spacesOnlyName);
      await clickOn('.btn-save');

      const displayedNames = columnNamesShown();
      const savedOutline = lastSavedOutline();

      expect(displayedNames).toEqual([
        FALLBACK_COLUMN_NAME,
        COLUMN_IN_PROGRESS.name,
        COLUMN_DONE.name,
      ]);
      expect(savedOutline).toEqual([
        { name: FALLBACK_COLUMN_NAME, position: 0 },
        { name: COLUMN_IN_PROGRESS.name, position: 1 },
        { name: COLUMN_DONE.name, position: 2 },
      ]);
    });

    it("T8.5 (listes) ne crée aucune modification en attente quand le nom revalidé est exactement le nom courant", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await renameColumnAt(0, COLUMN_TO_DO.name);
      await clickOn('.btn-back');

      const displayedNames = columnNamesShown();
      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const requestedNavigations = navigations();

      expect(displayedNames).toEqual([COLUMN_TO_DO.name, COLUMN_IN_PROGRESS.name, COLUMN_DONE.name]);
      expect(confirmPopupShown).toBe(false);
      expect(requestedNavigations).toEqual([KANBAN_LIST_ROUTE]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 9 (listes) — Retirer une liste
  // ---------------------------------------------------------------------------
  describe("Retrait d'une liste", () => {
    it('T9.1 (listes) ouvre la popup de confirmation en nommant la liste visée, sans rien retirer', async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await requestRemovalOfColumnAt(1);

      const confirmPopupShown = isShown('.confirm-remove-column .confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-remove-column .confirm-message');
      const displayedNames = columnNamesShown();
      const writesWhileWaiting = writeCalls();

      expect(confirmPopupShown).toBe(true);
      expect(confirmMessage).toContain(`« ${COLUMN_IN_PROGRESS.name} »`);
      expect(confirmMessage).not.toBe(DISCARD_CHANGES_MESSAGE);
      expect(displayedNames).toEqual([COLUMN_TO_DO.name, COLUMN_IN_PROGRESS.name, COLUMN_DONE.name]);
      expect(writesWhileWaiting).toBe(0);
    });

    it('T9.2 (listes) retire la liste confirmée, et elle seule', async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await requestRemovalOfColumnAt(1);
      await clickOn('.confirm-remove-column .confirm-card .btn-confirm');

      const displayedNames = columnNamesShown();
      const confirmPopupAfterAnswer = isShown('.confirm-remove-column .confirm-backdrop');

      expect(displayedNames).toEqual([COLUMN_TO_DO.name, COLUMN_DONE.name]);
      expect(confirmPopupAfterAnswer).toBe(false);
    });

    it('T9.3 (listes) retire la bonne des deux listes homonymes', async () => {
      await openBoardWithColumns(HOMONYM_COLUMNS);
      await requestRemovalOfColumnAt(1);
      await clickOn('.confirm-remove-column .confirm-card .btn-confirm');
      await clickOn('.btn-save');

      const displayedNames = columnNamesShown();
      const savedColumns = lastSavedColumns();
      const savedIdentifiers = savedColumns.map((column) => column.id);

      expect(displayedNames).toEqual([COLUMN_SHOPPING_A.name, COLUMN_DONE.name]);
      expect(savedIdentifiers).toEqual([COLUMN_SHOPPING_A.id, COLUMN_DONE.id]);
    });

    it("T9.4 (listes) ramène le tableau à son état vide quand sa dernière liste est retirée", async () => {
      await openBoardWithColumns([COLUMN_TO_DO]);
      await requestRemovalOfColumnAt(0);
      await clickOn('.confirm-remove-column .confirm-card .btn-confirm');

      const renderedPanels = columnPanels();
      const emptyStateShown = isShown('.board-canvas .no-columns');
      const addButtonShown = isShown('.btn-add-column');

      expect(renderedPanels).toEqual([]);
      expect(emptyStateShown).toBe(true);
      expect(addButtonShown).toBe(true);
    });

    it('T9.5 (listes) conserve la liste quand la popup de retrait est refusée', async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await requestRemovalOfColumnAt(1);

      const confirmPopupBeforeAnswer = isShown('.confirm-remove-column .confirm-backdrop');

      await clickOn('.confirm-remove-column .confirm-card .btn-cancel');

      const displayedNames = columnNamesShown();
      const confirmPopupAfterAnswer = isShown('.confirm-remove-column .confirm-backdrop');

      expect(confirmPopupBeforeAnswer).toBe(true);
      expect(displayedNames).toEqual([COLUMN_TO_DO.name, COLUMN_IN_PROGRESS.name, COLUMN_DONE.name]);
      expect(confirmPopupAfterAnswer).toBe(false);
    });

    it("T9.6 (listes) laisse les positions contiguës après le retrait d'une liste du milieu", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await requestRemovalOfColumnAt(1);
      await clickOn('.confirm-remove-column .confirm-card .btn-confirm');
      await clickOn('.btn-save');

      const savedOutline = lastSavedOutline();

      expect(savedOutline).toEqual([
        { name: COLUMN_TO_DO.name, position: 0 },
        { name: COLUMN_DONE.name, position: 1 },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 10 (listes) — Déplacer une liste
  // ---------------------------------------------------------------------------
  describe("Déplacement d'une liste", () => {
    it("T10.1 (listes) échange la liste avec sa voisine immédiate, sans l'envoyer à l'extrémité", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await moveColumnAt(0, 'right');

      const displayedNames = columnNamesShown();

      expect(displayedNames).toEqual([COLUMN_IN_PROGRESS.name, COLUMN_TO_DO.name, COLUMN_DONE.name]);
    });

    it('T10.2 (listes) renumérote les positions après un déplacement', async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await moveColumnAt(2, 'left');
      await clickOn('.btn-save');

      const displayedNames = columnNamesShown();
      const savedOutline = lastSavedOutline();

      expect(displayedNames).toEqual([COLUMN_TO_DO.name, COLUMN_DONE.name, COLUMN_IN_PROGRESS.name]);
      expect(savedOutline).toEqual([
        { name: COLUMN_TO_DO.name, position: 0 },
        { name: COLUMN_DONE.name, position: 1 },
        { name: COLUMN_IN_PROGRESS.name, position: 2 },
      ]);
    });

    it('T10.3 (listes) renumérote aussi les positions après un ajout', async () => {
      const addedName = 'Imprévus';

      await openBoardWithColumns(THREE_COLUMNS);
      await addColumn(addedName);
      await clickOn('.btn-save');

      const savedOutline = lastSavedOutline();

      expect(savedOutline).toEqual([
        { name: COLUMN_TO_DO.name, position: 0 },
        { name: COLUMN_IN_PROGRESS.name, position: 1 },
        { name: COLUMN_DONE.name, position: 2 },
        { name: addedName, position: 3 },
      ]);
    });

    it('T10.4 (listes) enregistre contiguë une composition lue avec un trou dans les positions', async () => {
      const addedName = 'Imprévus';

      await openBoardWithColumns(COLUMNS_WITH_POSITION_HOLE);
      await addColumn(addedName);
      await clickOn('.btn-save');

      const savedOutline = lastSavedOutline();

      expect(savedOutline).toEqual([
        { name: 'À faire', position: 0 },
        { name: 'Fait', position: 1 },
        { name: addedName, position: 2 },
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 11 (listes) — Enregistrer le tableau et ses listes
  // ---------------------------------------------------------------------------
  describe('Enregistrement du tableau et de ses listes', () => {
    it('T11.1 (listes) enregistre le nom du tableau et sa composition en un seul appel', async () => {
      const typedName = 'Travaux du garage';

      await openBoardWithColumns(THREE_COLUMNS);
      await typeName(typedName);
      await clickOn('.btn-save');

      const requestedSaves = saveCalls();
      const requestedSave = requestedSaves[0] ?? null;
      const savedOutline = lastSavedOutline();

      expect(requestedSaves.length).toBe(1);
      expect(requestedSave?.id).toBe(EXISTING_KANBAN.id);
      expect(requestedSave?.name).toBe(typedName);
      expect(savedOutline).toEqual([
        { name: COLUMN_TO_DO.name, position: 0 },
        { name: COLUMN_IN_PROGRESS.name, position: 1 },
        { name: COLUMN_DONE.name, position: 2 },
      ]);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
    });

    it("T11.2 (listes) ne fait qu'un seul appel après plusieurs gestes, et non un par geste", async () => {
      const addedName = 'Imprévus';
      const renamedName = 'À faire bientôt';

      await openBoardWithColumns(THREE_COLUMNS);
      await addColumn(addedName);
      await renameColumnAt(0, renamedName);
      await moveColumnAt(3, 'left');

      const writesBeforeSave = writeCalls();

      await clickOn('.btn-save');

      const requestedSaves = saveCalls();
      const savedColumns = lastSavedColumns();
      const savedNames = savedColumns.map((column) => column.name);

      expect(writesBeforeSave).toBe(0);
      expect(requestedSaves.length).toBe(1);
      expect(savedNames).toEqual([
        renamedName,
        COLUMN_IN_PROGRESS.name,
        addedName,
        COLUMN_DONE.name,
      ]);
    });

    it('T11.3 (listes) ramène à la liste des tableaux après un enregistrement réussi', async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await addColumn('Imprévus');

      const navigationsBeforeSave = navigations();

      await clickOn('.btn-save');

      const navigationsAfterSave = navigations();

      expect(navigationsBeforeSave).toEqual([]);
      expect(navigationsAfterSave).toEqual([KANBAN_LIST_ROUTE]);
    });

    it("T11.4 (listes) garde l'écran et affiche un bandeau visible après un échec", async () => {
      const saveFailure = new Error('Écriture refusée');
      const boardToEdit: Kanban = { ...EXISTING_KANBAN, columns: THREE_COLUMNS };

      await setup({ id: EXISTING_KANBAN.id, board: boardToEdit });
      kanbanService.saveKanbanWithColumns.mockRejectedValue(saveFailure);

      await render();
      await addColumn('Imprévus');
      await clickOn('.btn-save');

      const banner = el.querySelector<HTMLElement>('.action-error');
      const bannerText = normalizedTextOf('.action-error');
      const bannerRole = banner?.getAttribute('role');
      const editorStillShown = isShown('.kanban-editor');
      const requestedNavigations = navigations();

      expect(editorStillShown).toBe(true);
      expect(banner).not.toBeNull();
      expect(bannerText).toContain(SAVE_FAILED_MESSAGE);
      expect(bannerRole).toBe('alert');
      expect(requestedNavigations).toEqual([]);
    });

    it('T11.5 (listes) laisse la composition composée intacte après un échec', async () => {
      const saveFailure = new Error('Écriture refusée');
      const addedName = 'Imprévus';
      const typedName = 'Travaux du garage';
      const boardToEdit: Kanban = { ...EXISTING_KANBAN, columns: THREE_COLUMNS };

      await setup({ id: EXISTING_KANBAN.id, board: boardToEdit });
      kanbanService.saveKanbanWithColumns.mockRejectedValue(saveFailure);

      await render();
      await typeName(typedName);
      await addColumn(addedName);
      await moveColumnAt(3, 'left');
      await clickOn('.btn-save');

      const displayedNames = columnNamesShown();
      const fieldAfterFailure = nameInput();
      const valueAfterFailure = fieldAfterFailure?.value;

      expect(displayedNames).toEqual([
        COLUMN_TO_DO.name,
        COLUMN_IN_PROGRESS.name,
        addedName,
        COLUMN_DONE.name,
      ]);
      expect(valueAfterFailure).toBe(typedName);
    });

    it("T11.6 (listes) passe en mode édition quand l'échec survient après la création du tableau", async () => {
      const typedName = 'Anniversaire de Léa';
      const addedName = 'Courses';
      const createdBoard: Kanban = {
        id: CREATED_KANBAN_ID,
        name: typedName,
        updatedAt: SAVED_UPDATED_AT,
      };
      const halfSave: KanbanSaveResult = { kanban: createdBoard, columnsSaved: false };

      await setup();
      kanbanService.saveKanbanWithColumns.mockResolvedValue(halfSave);

      await render();
      await typeName(typedName);
      await addColumn(addedName);
      await clickOn('.btn-save');

      const screenTitle = normalizedTextOf('.editor-navbar-title');
      const bannerText = normalizedTextOf('.action-error');
      const displayedNames = columnNamesShown();
      const requestedNavigations = navigations();

      expect(screenTitle).toBe(EDITION_SCREEN_TITLE);
      expect(bannerText).toContain(COLUMNS_SAVE_FAILED_MESSAGE);
      expect(displayedNames).toEqual([addedName]);
      expect(requestedNavigations).toEqual([]);
    });

    it("T11.7 (listes) renomme le tableau créé au ré-essai, au lieu d'en créer un second", async () => {
      const typedName = 'Anniversaire de Léa';
      const createdBoard: Kanban = {
        id: CREATED_KANBAN_ID,
        name: typedName,
        updatedAt: SAVED_UPDATED_AT,
      };
      const halfSave: KanbanSaveResult = { kanban: createdBoard, columnsSaved: false };

      await setup();
      kanbanService.saveKanbanWithColumns.mockResolvedValue(halfSave);

      await render();
      await typeName(typedName);
      await addColumn('Courses');
      await clickOn('.btn-save');
      await clickOn('.btn-save');

      const requestedSaves = saveCalls();
      const requestedIdentifiers = requestedSaves.map((requestedSave) => requestedSave.id);

      expect(requestedSaves.length).toBe(2);
      expect(requestedIdentifiers).toEqual([null, CREATED_KANBAN_ID]);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
    });

    it("T11.8 (listes) ne laisse plus aucune modification en attente après un enregistrement réussi", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await addColumn('Imprévus');
      await clickOn('.btn-save');

      const navigationsAfterSave = navigations();

      await clickOn('.btn-back');

      const confirmPopupAfterBack = isShown('.confirm-leave .confirm-backdrop');
      const navigationsAfterBack = navigations();

      expect(navigationsAfterSave).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupAfterBack).toBe(false);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE, KANBAN_LIST_ROUTE]);
    });

    it("T11.9 (listes) ne laisse pas de modification fantôme quand un nom a été replié sur « Sans titre »", async () => {
      const spacesOnlyName = '   ';

      await setup();
      await render();
      await addColumn(spacesOnlyName);
      await clickOn('.btn-save');

      const navigationsAfterSave = navigations();

      await clickOn('.btn-back');

      const displayedNames = columnNamesShown();
      const fieldAfterSave = nameInput();
      const valueAfterSave = fieldAfterSave?.value;
      const confirmPopupAfterBack = isShown('.confirm-leave .confirm-backdrop');
      const navigationsAfterBack = navigations();

      expect(navigationsAfterSave).toEqual([KANBAN_LIST_ROUTE]);
      expect(displayedNames).toEqual([FALLBACK_COLUMN_NAME]);
      expect(valueAfterSave).toBe(FALLBACK_SAVED_NAME);
      expect(confirmPopupAfterBack).toBe(false);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE, KANBAN_LIST_ROUTE]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 12 (listes) — Ne rien écrire, et le retour
  // ---------------------------------------------------------------------------
  describe('Gestes sans écriture et retour vers la liste des tableaux', () => {
    it("T12.1 (listes) ne demande aucune écriture lors d'un ajout", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await addColumn('Imprévus');

      const writesOnGesture = writeCalls();

      expect(writesOnGesture).toBe(0);
      expect(kanbanService.saveKanbanWithColumns).not.toHaveBeenCalled();
    });

    it("T12.2 (listes) ne demande aucune écriture lors d'un renommage", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await renameColumnAt(1, 'En cours de test');

      const writesOnGesture = writeCalls();

      expect(writesOnGesture).toBe(0);
      expect(kanbanService.saveKanbanWithColumns).not.toHaveBeenCalled();
    });

    it("T12.3 (listes) ne demande aucune écriture lors d'un retrait", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await requestRemovalOfColumnAt(1);
      await clickOn('.confirm-remove-column .confirm-card .btn-confirm');

      const displayedNames = columnNamesShown();
      const writesOnGesture = writeCalls();

      expect(displayedNames).toEqual([COLUMN_TO_DO.name, COLUMN_DONE.name]);
      expect(writesOnGesture).toBe(0);
      expect(kanbanService.saveKanbanWithColumns).not.toHaveBeenCalled();
    });

    it("T12.4 (listes) ne demande aucune écriture lors d'un déplacement", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await moveColumnAt(1, 'left');

      const writesOnGesture = writeCalls();

      expect(writesOnGesture).toBe(0);
      expect(kanbanService.saveKanbanWithColumns).not.toHaveBeenCalled();
    });

    it("T12.5 (listes) rend une modification « en attente » après un ajout", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await addColumn('Imprévus');
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-leave .confirm-message');
      const requestedNavigations = navigations();

      expect(confirmPopupShown).toBe(true);
      expect(confirmMessage).toBe(DISCARD_CHANGES_MESSAGE);
      expect(requestedNavigations).toEqual([]);
    });

    it("T12.6 (listes) rend une modification « en attente » après un renommage", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await renameColumnAt(1, 'En cours de test');
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-leave .confirm-message');
      const requestedNavigations = navigations();

      expect(confirmPopupShown).toBe(true);
      expect(confirmMessage).toBe(DISCARD_CHANGES_MESSAGE);
      expect(requestedNavigations).toEqual([]);
    });

    it("T12.7 (listes) rend une modification « en attente » après un retrait", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await requestRemovalOfColumnAt(1);
      await clickOn('.confirm-remove-column .confirm-card .btn-confirm');
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-leave .confirm-message');
      const requestedNavigations = navigations();

      expect(confirmPopupShown).toBe(true);
      expect(confirmMessage).toBe(DISCARD_CHANGES_MESSAGE);
      expect(requestedNavigations).toEqual([]);
    });

    it("T12.8 (listes) rend une modification « en attente » après un déplacement", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await moveColumnAt(1, 'left');
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-leave .confirm-message');
      const requestedNavigations = navigations();

      expect(confirmPopupShown).toBe(true);
      expect(confirmMessage).toBe(DISCARD_CHANGES_MESSAGE);
      expect(requestedNavigations).toEqual([]);
    });

    it("T12.9 (listes) ramène immédiatement à la liste quand ni le nom ni la composition n'ont bougé", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const requestedNavigations = navigations();

      expect(confirmPopupShown).toBe(false);
      expect(requestedNavigations).toEqual([KANBAN_LIST_ROUTE]);
    });

    it("T12.10 (listes) ouvre la popup d'abandon quand c'est le nom du tableau qui a été modifié", async () => {
      const typedName = 'Travaux du garage';

      await openBoardWithColumns(THREE_COLUMNS);
      await typeName(typedName);
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-leave .confirm-message');
      const requestedNavigations = navigations();

      expect(confirmPopupShown).toBe(true);
      expect(confirmMessage).toBe(DISCARD_CHANGES_MESSAGE);
      expect(requestedNavigations).toEqual([]);
    });

    it("T12.11 (listes) ouvre la popup d'abandon quand c'est la composition seule qui a été modifiée", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await moveColumnAt(0, 'right');
      await clickOn('.btn-back');

      const fieldBeforeBack = nameInput();
      const valueBeforeBack = fieldBeforeBack?.value;
      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-leave .confirm-message');
      const requestedNavigations = navigations();

      expect(valueBeforeBack).toBe(EXISTING_KANBAN.name);
      expect(confirmPopupShown).toBe(true);
      expect(confirmMessage).toBe(DISCARD_CHANGES_MESSAGE);
      expect(requestedNavigations).toEqual([]);
    });

    it("T12.12 (listes) ramène à la liste sans aucune écriture quand l'abandon est confirmé", async () => {
      await openBoardWithColumns(THREE_COLUMNS);
      await addColumn('Imprévus');
      await clickOn('.btn-back');
      await clickOn('.confirm-leave .confirm-card .btn-confirm');

      const requestedNavigations = navigations();
      const writesOnDiscard = writeCalls();

      expect(requestedNavigations).toEqual([KANBAN_LIST_ROUTE]);
      expect(writesOnDiscard).toBe(0);
      expect(kanbanService.saveKanbanWithColumns).not.toHaveBeenCalled();
    });

    it("T12.13 (listes) laisse l'écran et la composition intacts quand l'abandon est refusé", async () => {
      const addedName = 'Imprévus';

      await openBoardWithColumns(THREE_COLUMNS);
      await addColumn(addedName);
      await clickOn('.btn-back');
      await clickOn('.confirm-leave .confirm-card .btn-cancel');

      const editorStillShown = isShown('.kanban-editor');
      const displayedNames = columnNamesShown();
      const confirmPopupAfterAnswer = isShown('.confirm-leave .confirm-backdrop');
      const navigationsAfterAnswer = navigations();

      await clickOn('.btn-back');

      const confirmPopupOnSecondBack = isShown('.confirm-leave .confirm-backdrop');

      expect(editorStillShown).toBe(true);
      expect(displayedNames).toEqual([
        COLUMN_TO_DO.name,
        COLUMN_IN_PROGRESS.name,
        COLUMN_DONE.name,
        addedName,
      ]);
      expect(confirmPopupAfterAnswer).toBe(false);
      expect(navigationsAfterAnswer).toEqual([]);
      expect(confirmPopupOnSecondBack).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 27 — Créer une carte (cartes)
  // ---------------------------------------------------------------------------
  describe('Créer une carte', () => {
    it('T27.1 fait apparaître la carte validée en dernière position de sa colonne', async () => {
      const typedText = 'Acheter du beurre';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addCardToColumn(0, typedText);

      const textsInFirstColumn = cardTextsOf(0);
      const textsInSecondColumn = cardTextsOf(1);

      expect(textsInFirstColumn).toEqual([CARD_PAIN.text, CARD_LAIT.text, typedText]);
      expect(textsInSecondColumn).toEqual([CARD_PEINDRE.text]);
    });

    it("T27.2 donne à la carte ajoutée un identifiant qui n'existait pas", async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addCardToColumn(0, 'Acheter du beurre');
      await clickOn('.btn-save');

      const savedIds = savedCardIdsOf(0);
      const addedId = savedIds[savedIds.length - 1] ?? '';
      const keptIds = savedIds.slice(0, 2);
      const identifiersBeforeTheAdd = [CARD_PAIN.id, CARD_LAIT.id, CARD_PEINDRE.id];

      expect(savedIds.length).toBe(3);
      expect(addedId.length).toBeGreaterThan(0);
      expect(identifiersBeforeTheAdd).not.toContain(addedId);
      expect(keptIds).toEqual([CARD_PAIN.id, CARD_LAIT.id]);
    });

    it("T27.3 enchaîne plusieurs ajouts sans quitter l'écran", async () => {
      const firstText = 'Acheter du beurre';
      const secondText = 'Acheter du miel';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addCardToColumn(0, firstText);
      await addCardToColumn(0, secondText);

      const textsInFirstColumn = cardTextsOf(0);
      const editorStillShown = isShown('.kanban-editor');
      const requestedNavigations = navigations();

      expect(textsInFirstColumn).toEqual([
        CARD_PAIN.text,
        CARD_LAIT.text,
        firstText,
        secondText,
      ]);
      expect(editorStillShown).toBe(true);
      expect(requestedNavigations).toEqual([]);
    });

    it('T27.4 retire les espaces de bord du texte entrant et garde les intérieurs', async () => {
      const typedText = '   Acheter du  pain de mie   ';
      const expectedText = 'Acheter du  pain de mie';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addCardToColumn(0, typedText);
      await clickOn('.btn-save');

      const displayedText = rawCardTextOf(0, 2);
      const savedCards = savedCardsOf(0);
      const savedTexts = savedCards.map((card: SavedCardOutline): string => card.text);

      expect(displayedText).toBe(expectedText);
      expect(savedTexts).toEqual([CARD_PAIN.text, CARD_LAIT.text, expectedText]);
    });

    it('T27.5 replie un texte entrant vide sur « Sans titre »', async () => {
      const spacesOnlyText = '   ';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addCardToColumn(0, spacesOnlyText);
      await clickOn('.btn-save');

      const textsInFirstColumn = cardTextsOf(0);
      const savedCards = savedCardsOf(0);
      const savedTexts = savedCards.map((card: SavedCardOutline): string => card.text);

      expect(textsInFirstColumn).toEqual([CARD_PAIN.text, CARD_LAIT.text, FALLBACK_CARD_TEXT]);
      expect(savedTexts).toEqual([CARD_PAIN.text, CARD_LAIT.text, FALLBACK_CARD_TEXT]);
    });

    it("T27.6 n'ajoute rien quand la saisie d'ajout est abandonnée", async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await startAddCardIn(0);
      await typeNewCardText('Acheter du beurre');
      await giveUpAddCard();

      const textsInFirstColumn = cardTextsOf(0);
      const draftFieldShown = isShown('.new-card-text');
      const writesOnGiveUp = writeCalls();

      expect(textsInFirstColumn).toEqual([CARD_PAIN.text, CARD_LAIT.text]);
      expect(draftFieldShown).toBe(false);
      expect(writesOnGiveUp).toBe(0);
    });

    it("T27.7 enregistre sans la carte en cours de saisie, et sans échouer", async () => {
      const draftText = 'Acheter du beurre';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await startAddCardIn(0);
      await typeNewCardText(draftText);
      await clickOn('.btn-save');

      const requestedSaves = saveCalls();
      const savedCards = savedCardsOf(0);
      const savedTexts = savedCards.map((card: SavedCardOutline): string => card.text);
      const errorBannerShown = isShown('.action-error');
      const requestedNavigations = navigations();

      expect(requestedSaves.length).toBe(1);
      expect(savedTexts).toEqual([CARD_PAIN.text, CARD_LAIT.text]);
      expect(errorBannerShown).toBe(false);
      expect(requestedNavigations).toEqual([KANBAN_LIST_ROUTE]);
    });

    it('T27.8 pose sur la carte créée la note choisie avant la validation', async () => {
      const typedText = 'Acheter du beurre';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await startAddCardIn(0);
      await typeNewCardText(typedText);
      await requestNoteForDraft();
      await chooseNoteInPicker(NOTE_COURSES);
      await confirmAddCard();
      await clickOn('.btn-save');

      const titlesInFirstColumn = noteTitlesOf(0);
      const savedCards = savedCardsOf(0);
      const savedNoteIds = savedCards.map((card: SavedCardOutline): string | null => card.noteId);
      const savedTexts = savedCards.map((card: SavedCardOutline): string => card.text);

      expect(titlesInFirstColumn).toEqual([NOTE_COURSES.title]);
      expect(savedTexts).toEqual([CARD_PAIN.text, CARD_LAIT.text, typedText]);
      expect(savedNoteIds).toEqual([null, null, NOTE_COURSES.id]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 28 — Modifier le texte d'une carte (cartes)
  // ---------------------------------------------------------------------------
  describe("Modifier le texte d'une carte", () => {
    it('T28.1 ne change le texte que de la carte qui a émis', async () => {
      const typedText = 'Acheter du pain complet';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await retypeCardText(0, 0, typedText);

      const textsInFirstColumn = cardTextsOf(0);
      const textsInSecondColumn = cardTextsOf(1);
      const titlesInSecondColumn = noteTitlesOf(1);

      expect(textsInFirstColumn).toEqual([typedText, CARD_LAIT.text]);
      expect(textsInSecondColumn).toEqual([CARD_PEINDRE.text]);
      expect(titlesInSecondColumn).toEqual([NOTE_PEINTURE.title]);
    });

    it('T28.2 retire les espaces de bord du texte modifié', async () => {
      const typedText = '   Acheter du  pain complet   ';
      const expectedText = 'Acheter du  pain complet';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await retypeCardText(0, 0, typedText);
      await clickOn('.btn-save');

      const displayedText = rawCardTextOf(0, 0);
      const savedCards = savedCardsOf(0);
      const savedTexts = savedCards.map((card: SavedCardOutline): string => card.text);

      expect(displayedText).toBe(expectedText);
      expect(savedTexts).toEqual([expectedText, CARD_LAIT.text]);
    });

    it('T28.3 replie un texte modifié vide sur « Sans titre »', async () => {
      const spacesOnlyText = '  ';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await retypeCardText(0, 0, spacesOnlyText);
      await clickOn('.btn-save');

      const textsInFirstColumn = cardTextsOf(0);
      const savedCards = savedCardsOf(0);
      const savedTexts = savedCards.map((card: SavedCardOutline): string => card.text);

      expect(textsInFirstColumn).toEqual([FALLBACK_CARD_TEXT, CARD_LAIT.text]);
      expect(savedTexts).toEqual([FALLBACK_CARD_TEXT, CARD_LAIT.text]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 29 — Supprimer une carte (cartes)
  // ---------------------------------------------------------------------------
  describe('Supprimer une carte', () => {
    it('T29.1 ouvre la popup de confirmation en nommant la carte visée', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await requestRemovalOfCard(0, 1);

      const confirmPopupShown = isShown('.confirm-remove-card .confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-remove-card .confirm-message');
      const columnPopupShown = isShown('.confirm-remove-column .confirm-backdrop');
      const leavePopupShown = isShown('.confirm-leave .confirm-backdrop');

      expect(confirmPopupShown).toBe(true);
      expect(confirmMessage).toContain(`« ${CARD_LAIT.text} »`);
      expect(confirmMessage).not.toBe(DISCARD_CHANGES_MESSAGE);
      expect(columnPopupShown).toBe(false);
      expect(leavePopupShown).toBe(false);
    });

    it("T29.2 laisse la carte en place tant que la popup n'a pas répondu", async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await requestRemovalOfCard(0, 1);

      const confirmPopupShown = isShown('.confirm-remove-card .confirm-backdrop');
      const textsInFirstColumn = cardTextsOf(0);
      const writesWhileWaiting = writeCalls();

      expect(confirmPopupShown).toBe(true);
      expect(textsInFirstColumn).toEqual([CARD_PAIN.text, CARD_LAIT.text]);
      expect(writesWhileWaiting).toBe(0);
    });

    it('T29.3 retire la carte confirmée, et elle seule, en refermant les positions', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await requestRemovalOfCard(0, 0);
      await clickOn('.confirm-remove-card .confirm-card .btn-confirm');
      await clickOn('.btn-save');

      const textsInFirstColumn = cardTextsOf(0);
      const textsInSecondColumn = cardTextsOf(1);
      const savedCards = savedCardsOf(0);

      expect(textsInFirstColumn).toEqual([CARD_LAIT.text]);
      expect(textsInSecondColumn).toEqual([CARD_PEINDRE.text]);
      expect(savedCards).toEqual([{ text: CARD_LAIT.text, position: 0, noteId: null }]);
    });

    it('T29.4 conserve la carte quand le retrait est refusé', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await requestRemovalOfCard(0, 0);
      await clickOn('.confirm-remove-card .confirm-card .btn-cancel');

      const textsInFirstColumn = cardTextsOf(0);
      const confirmPopupAfterAnswer = isShown('.confirm-remove-card .confirm-backdrop');
      const writesOnRefusal = writeCalls();

      expect(textsInFirstColumn).toEqual([CARD_PAIN.text, CARD_LAIT.text]);
      expect(confirmPopupAfterAnswer).toBe(false);
      expect(writesOnRefusal).toBe(0);
    });

    it("T29.5 ne demande aucune suppression de note quand la carte qui en portait une est retirée", async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await requestRemovalOfCard(1, 0);
      await clickOn('.confirm-remove-card .confirm-card .btn-confirm');

      const textsInSecondColumn = cardTextsOf(1);
      const titlesInSecondColumn = noteTitlesOf(1);

      expect(textsInSecondColumn).toEqual([]);
      expect(titlesInSecondColumn).toEqual([]);
      expect(notesService.deleteNote).not.toHaveBeenCalled();
    });

    it('T29.6 fait retomber la sélection quand la carte retirée est celle qui est sélectionnée', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await requestRemovalOfCard(0, 0);
      await toggleMoveModeFrom(0);
      await selectCard(0, 0);

      const selectedBeforeAnswer = selectedCardTexts();

      await clickOn('.confirm-remove-card .confirm-card .btn-confirm');

      const textsInFirstColumn = cardTextsOf(0);
      const selectedAfterRemoval = selectedCardTexts();
      const arrowsShown = isShown('.btn-card-move');

      expect(selectedBeforeAnswer).toEqual([CARD_PAIN.text]);
      expect(textsInFirstColumn).toEqual([CARD_LAIT.text]);
      expect(selectedAfterRemoval).toEqual([]);
      expect(arrowsShown).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 30 — Mode déplacement (cartes)
  // ---------------------------------------------------------------------------
  describe('Mode déplacement', () => {
    it("T30.1 désélectionne la carte précédente quand on sélectionne celle d'une autre colonne", async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await toggleMoveModeFrom(0);
      await selectCard(0, 0);

      const selectedAfterFirstTouch = selectedCardTexts();

      await selectCard(1, 0);

      const selectedAfterSecondTouch = selectedCardTexts();

      expect(selectedAfterFirstTouch).toEqual([CARD_PAIN.text]);
      expect(selectedAfterSecondTouch).toEqual([CARD_PEINDRE.text]);
    });

    it('T30.2 désélectionne en sortant du mode déplacement', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await toggleMoveModeFrom(0);
      await selectCard(0, 0);

      const selectedWhileInMode = selectedCardTexts();

      await toggleMoveModeFrom(0);

      const selectedAfterExit = selectedCardTexts();
      const arrowsShown = isShown('.btn-card-move');
      const trashShown = isShown('.btn-remove-card');

      expect(selectedWhileInMode).toEqual([CARD_PAIN.text]);
      expect(selectedAfterExit).toEqual([]);
      expect(arrowsShown).toBe(false);
      expect(trashShown).toBe(true);
    });

    it('T30.3 garde la carte sélectionnée après un déplacement vertical', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await toggleMoveModeFrom(0);
      await selectCard(0, 1);
      await moveSelectedCard('up');

      const textsInFirstColumn = cardTextsOf(0);
      const selectedAfterMove = selectedCardTexts();

      expect(textsInFirstColumn).toEqual([CARD_LAIT.text, CARD_PAIN.text]);
      expect(selectedAfterMove).toEqual([CARD_LAIT.text]);
    });

    it('T30.4 garde la carte sélectionnée après un changement de colonne', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await toggleMoveModeFrom(0);
      await selectCard(0, 0);
      await moveSelectedCard('right');

      const textsInFirstColumn = cardTextsOf(0);
      const textsInSecondColumn = cardTextsOf(1);
      const selectedAfterMove = selectedCardTexts();

      expect(textsInFirstColumn).toEqual([CARD_LAIT.text]);
      expect(textsInSecondColumn).toEqual([CARD_PAIN.text, CARD_PEINDRE.text]);
      expect(selectedAfterMove).toEqual([CARD_PAIN.text]);
    });

    it('T30.5 laisse le retour immédiat et sans question après être entré dans le mode, avoir sélectionné et être sorti', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await toggleMoveModeFrom(0);
      await selectCard(0, 0);

      const selectedWhileInMode = selectedCardTexts();

      await toggleMoveModeFrom(0);
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const requestedNavigations = navigations();
      const writesOnTheWayOut = writeCalls();

      expect(selectedWhileInMode).toEqual([CARD_PAIN.text]);
      expect(confirmPopupShown).toBe(false);
      expect(requestedNavigations).toEqual([KANBAN_LIST_ROUTE]);
      expect(writesOnTheWayOut).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 31 — Référence d'une carte (cartes)
  // ---------------------------------------------------------------------------
  describe("Référence d'une carte", () => {
    it('T31.1 ouvre la popup de sélection sur demande d’une carte', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);

      const pickerBeforeRequest = notePickerIsOpen();

      await requestNoteFor(0, 0);

      const pickerAfterRequest = notePickerIsOpen();

      expect(pickerBeforeRequest).toBe(false);
      expect(pickerAfterRequest).toBe(true);
    });

    it('T31.2 pose la note émise sur la carte visée, et sur elle seule', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await linkNoteTo(0, 0, NOTE_COURSES);
      await clickOn('.btn-save');

      const titlesInFirstColumn = noteTitlesOf(0);
      const titlesInSecondColumn = noteTitlesOf(1);
      const textsInFirstColumn = cardTextsOf(0);
      const savedCards = savedCardsOf(0);
      const savedNoteIds = savedCards.map((card: SavedCardOutline): string | null => card.noteId);
      const pickerAfterChoice = notePickerIsOpen();

      expect(titlesInFirstColumn).toEqual([NOTE_COURSES.title]);
      expect(titlesInSecondColumn).toEqual([NOTE_PEINTURE.title]);
      expect(textsInFirstColumn).toEqual([CARD_PAIN.text, CARD_LAIT.text]);
      expect(savedNoteIds).toEqual([NOTE_COURSES.id, null]);
      expect(pickerAfterChoice).toBe(false);
    });

    it('T31.3 vide la référence et laisse le texte quand « Aucune note » est émis', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await linkNoteTo(1, 0, null);
      await clickOn('.btn-save');

      const titlesInSecondColumn = noteTitlesOf(1);
      const textsInSecondColumn = cardTextsOf(1);
      const savedCards = savedCardsOf(1);

      expect(titlesInSecondColumn).toEqual([]);
      expect(textsInSecondColumn).toEqual([CARD_PEINDRE.text]);
      expect(savedCards).toEqual([{ text: CARD_PEINDRE.text, position: 0, noteId: null }]);
    });

    it('T31.4 laisse la référence inchangée quand on renonce à la popup', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await requestNoteFor(1, 0);
      await giveUpNotePicker();

      const titlesOfTheLinkedCard = noteTitlesOf(1);

      await requestNoteFor(0, 0);
      await giveUpNotePicker();

      const titlesOfTheUnlinkedColumn = noteTitlesOf(0);
      const writesOnGiveUp = writeCalls();

      expect(titlesOfTheLinkedCard).toEqual([NOTE_PEINTURE.title]);
      expect(titlesOfTheUnlinkedColumn).toEqual([]);
      expect(writesOnGiveUp).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 32 — Ouvrir la note référencée (cartes)
  // ---------------------------------------------------------------------------
  describe('Ouvrir la note référencée', () => {
    it("T32.1 navigue immédiatement vers la note quand rien n'est en attente", async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await openNoteOf(1, 0);

      const requestedNavigations = navigations();
      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const expectedRoute = noteRouteOf(NOTE_PEINTURE);

      expect(requestedNavigations).toEqual([expectedRoute]);
      expect(confirmPopupShown).toBe(false);
    });

    it('T32.2 ouvre la note que la carte touchée référence, et pas une autre', async () => {
      await openBoardWithColumns(COLUMNS_WITH_TWO_LINKED_CARDS);
      await openNoteOf(1, 0);
      await openNoteOf(0, 0);

      const requestedNavigations = navigations();
      const routeOfTheSecondColumn = noteRouteOf(NOTE_PEINTURE);
      const routeOfTheFirstColumn = noteRouteOf(NOTE_COURSES);

      expect(requestedNavigations).toEqual([routeOfTheSecondColumn, routeOfTheFirstColumn]);
    });

    it("T32.3 ouvre la popup d'abandon sans naviguer quand une modification est en attente", async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addCardToColumn(0, 'Acheter du beurre');
      await openNoteOf(1, 0);

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-leave .confirm-message');
      const requestedNavigations = navigations();

      expect(confirmPopupShown).toBe(true);
      expect(confirmMessage).toBe(DISCARD_CHANGES_MESSAGE);
      expect(requestedNavigations).toEqual([]);
    });

    it("T32.4 navigue vers la note sans enregistrer quand l'abandon est confirmé", async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addCardToColumn(0, 'Acheter du beurre');
      await openNoteOf(1, 0);
      await clickOn('.confirm-leave .confirm-card .btn-confirm');

      const requestedNavigations = navigations();
      const writesOnTheWayOut = writeCalls();
      const expectedRoute = noteRouteOf(NOTE_PEINTURE);

      expect(requestedNavigations).toEqual([expectedRoute]);
      expect(writesOnTheWayOut).toBe(0);
      expect(kanbanService.saveKanbanWithColumns).not.toHaveBeenCalled();
    });

    it("T32.5 laisse l'écran intact quand l'abandon est refusé", async () => {
      const typedText = 'Acheter du beurre';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addCardToColumn(0, typedText);
      await openNoteOf(1, 0);
      await clickOn('.confirm-leave .confirm-card .btn-cancel');

      const editorStillShown = isShown('.kanban-editor');
      const textsInFirstColumn = cardTextsOf(0);
      const confirmPopupAfterAnswer = isShown('.confirm-leave .confirm-backdrop');
      const requestedNavigations = navigations();

      expect(editorStillShown).toBe(true);
      expect(textsInFirstColumn).toEqual([CARD_PAIN.text, CARD_LAIT.text, typedText]);
      expect(confirmPopupAfterAnswer).toBe(false);
      expect(requestedNavigations).toEqual([]);
    });

    it('T32.6 ramène à la liste, et non à la note, quand on touche « Retour » après ce refus', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addCardToColumn(0, 'Acheter du beurre');
      await openNoteOf(1, 0);
      await clickOn('.confirm-leave .confirm-card .btn-cancel');
      await clickOn('.btn-back');

      const confirmPopupOnBack = isShown('.confirm-leave .confirm-backdrop');

      await clickOn('.confirm-leave .confirm-card .btn-confirm');

      const requestedNavigations = navigations();
      const routeOfTheNote = noteRouteOf(NOTE_PEINTURE);

      expect(confirmPopupOnBack).toBe(true);
      expect(requestedNavigations).toEqual([KANBAN_LIST_ROUTE]);
      expect(requestedNavigations).not.toContain(routeOfTheNote);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 33 — Enregistrement et modifications en attente (cartes)
  // ---------------------------------------------------------------------------
  describe('Enregistrement et modifications en attente', () => {
    it('T33.1 ne demande aucune écriture pour les gestes sur les cartes', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addCardToColumn(0, 'Acheter du beurre');
      await retypeCardText(0, 0, 'Acheter du pain complet');
      await requestRemovalOfCard(0, 1);
      await clickOn('.confirm-remove-card .confirm-card .btn-confirm');
      await toggleMoveModeFrom(0);
      await selectCard(0, 0);
      await moveSelectedCard('down');

      const writesOnGestures = writeCalls();

      expect(writesOnGestures).toBe(0);
      expect(kanbanService.saveKanbanWithColumns).not.toHaveBeenCalled();
    });

    it('T33.2 enregistre le nom, les colonnes et leurs cartes en un seul appel', async () => {
      const typedName = 'Travaux du garage';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await typeName(typedName);
      await clickOn('.btn-save');

      const requestedSaves = saveCalls();
      const requestedSave = requestedSaves[0] ?? null;
      const savedOutline = lastSavedOutline();
      const savedFirstColumn = savedCardsOf(0);
      const savedSecondColumn = savedCardsOf(1);

      expect(requestedSaves.length).toBe(1);
      expect(requestedSave?.id).toBe(EXISTING_KANBAN.id);
      expect(requestedSave?.name).toBe(typedName);
      expect(savedOutline).toEqual([
        { name: COLUMN_TO_DO.name, position: 0 },
        { name: COLUMN_IN_PROGRESS.name, position: 1 },
      ]);
      expect(savedFirstColumn).toEqual([
        { text: CARD_PAIN.text, position: 0, noteId: null },
        { text: CARD_LAIT.text, position: 1, noteId: null },
      ]);
      expect(savedSecondColumn).toEqual([
        { text: CARD_PEINDRE.text, position: 0, noteId: NOTE_PEINTURE.id },
      ]);
      expect(kanbanService.createKanban).not.toHaveBeenCalled();
      expect(kanbanService.renameKanban).not.toHaveBeenCalled();
    });

    it("T33.3 (ajout) rend le retour questionnant après l'ajout d'une carte", async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addCardToColumn(0, 'Acheter du beurre');
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const requestedNavigations = navigations();

      expect(confirmPopupShown).toBe(true);
      expect(requestedNavigations).toEqual([]);
    });

    it("T33.3 (modification) rend le retour questionnant après la modification d'un texte", async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await retypeCardText(0, 0, 'Acheter du pain complet');
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const requestedNavigations = navigations();

      expect(confirmPopupShown).toBe(true);
      expect(requestedNavigations).toEqual([]);
    });

    it('T33.3 (déplacement) rend le retour questionnant après un déplacement', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await toggleMoveModeFrom(0);
      await selectCard(0, 0);
      await moveSelectedCard('down');
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const requestedNavigations = navigations();

      expect(confirmPopupShown).toBe(true);
      expect(requestedNavigations).toEqual([]);
    });

    it('T33.3 (retrait) rend le retour questionnant après un retrait de carte', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await requestRemovalOfCard(0, 0);
      await clickOn('.confirm-remove-card .confirm-card .btn-confirm');
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const requestedNavigations = navigations();

      expect(confirmPopupShown).toBe(true);
      expect(requestedNavigations).toEqual([]);
    });

    it('T33.3 ((dé)liage) rend le retour questionnant après un (dé)liage de note', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await linkNoteTo(0, 0, NOTE_COURSES);
      await clickOn('.btn-back');

      const confirmPopupShown = isShown('.confirm-leave .confirm-backdrop');
      const requestedNavigations = navigations();

      expect(confirmPopupShown).toBe(true);
      expect(requestedNavigations).toEqual([]);
    });

    it('T33.4 rend le retour immédiat après un enregistrement réussi', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addCardToColumn(0, 'Acheter du beurre');
      await clickOn('.btn-save');

      const navigationsAfterSave = navigations();

      await clickOn('.btn-back');

      const confirmPopupAfterBack = isShown('.confirm-leave .confirm-backdrop');
      const navigationsAfterBack = navigations();

      expect(navigationsAfterSave).toEqual([KANBAN_LIST_ROUTE]);
      expect(confirmPopupAfterBack).toBe(false);
      expect(navigationsAfterBack).toEqual([KANBAN_LIST_ROUTE, KANBAN_LIST_ROUTE]);
    });

    it("T33.5 conserve l'écran et les cartes avec un message visible après un échec", async () => {
      const typedText = 'Acheter du beurre';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      kanbanService.saveKanbanWithColumns.mockRejectedValue(new Error('Base indisponible'));

      await addCardToColumn(0, typedText);
      await clickOn('.btn-save');

      const editorStillShown = isShown('.kanban-editor');
      const errorMessage = normalizedTextOf('.action-error');
      const textsInFirstColumn = cardTextsOf(0);
      const textsInSecondColumn = cardTextsOf(1);
      const requestedNavigations = navigations();

      expect(editorStillShown).toBe(true);
      expect(errorMessage).toBe(SAVE_FAILED_MESSAGE);
      expect(textsInFirstColumn).toEqual([CARD_PAIN.text, CARD_LAIT.text, typedText]);
      expect(textsInSecondColumn).toEqual([CARD_PEINDRE.text]);
      expect(requestedNavigations).toEqual([]);
    });

    it('T33.6 laisse réessayer après un échec, la modification restant en attente', async () => {
      const typedText = 'Acheter du beurre';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      kanbanService.saveKanbanWithColumns.mockRejectedValueOnce(new Error('Base indisponible'));

      await addCardToColumn(0, typedText);
      await clickOn('.btn-save');

      const errorAfterFailure = normalizedTextOf('.action-error');

      await clickOn('.btn-save');

      const requestedSaves = saveCalls();
      const savedCards = savedCardsOf(0);
      const savedTexts = savedCards.map((card: SavedCardOutline): string => card.text);
      const errorAfterRetry = isShown('.action-error');
      const requestedNavigations = navigations();

      expect(errorAfterFailure).toBe(SAVE_FAILED_MESSAGE);
      expect(requestedSaves.length).toBe(2);
      expect(savedTexts).toEqual([CARD_PAIN.text, CARD_LAIT.text, typedText]);
      expect(errorAfterRetry).toBe(false);
      expect(requestedNavigations).toEqual([KANBAN_LIST_ROUTE]);
    });

    it("T33.7 donne une liste de cartes vide à une colonne ajoutée par l'écran", async () => {
      const addedName = 'Imprévus';

      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await addColumn(addedName);
      await clickOn('.btn-save');

      const savedColumns = lastSavedColumns();
      const addedColumn = savedColumns[2] ?? null;

      expect(savedColumns.length).toBe(3);
      expect(addedColumn?.name).toBe(addedName);
      expect(addedColumn?.cards).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 34 — Retrait d'une liste qui porte des cartes (cartes)
  // ---------------------------------------------------------------------------
  describe("Retrait d'une liste qui porte des cartes", () => {
    it('T34.1 mentionne les cartes qui partiront dans la popup de retrait de la liste', async () => {
      await openBoardWithColumns(TWO_COLUMNS_WITH_CARDS);
      await requestRemovalOfColumnAt(0);

      const confirmPopupShown = isShown('.confirm-remove-column .confirm-backdrop');
      const confirmMessage = normalizedTextOf('.confirm-remove-column .confirm-message');

      expect(confirmPopupShown).toBe(true);
      expect(confirmMessage).toContain(`« ${COLUMN_TO_DO.name} »`);
      expect(confirmMessage).toMatch(/cartes/i);
    });
  });
});
