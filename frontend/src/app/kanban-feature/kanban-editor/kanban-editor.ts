import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CardTextChange } from '../../core/models/card-text-change.model';
import { KanbanCard } from '../../core/models/kanban-card.model';
import { KanbanColumn } from '../../core/models/kanban-column.model';
import { KanbanSaveResult } from '../../core/models/kanban-save-result.model';
import { Note } from '../../core/models/note.model';
import { KanbanService } from '../../core/services/kanban/kanban-service';
import {
  CardLocation,
  MoveDirection,
  addCardTo,
  canMoveCard,
  compositionSignature,
  locateCard,
  moveCardDown,
  moveCardToNextColumn,
  moveCardToPreviousColumn,
  moveCardUp,
  removeCard,
  replaceCardText,
  setCardNote,
} from '../../core/services/kanban/kanban-composition';
import { ConfirmDialog } from '../../core/components/confirm-dialog/confirm-dialog';
import { NotePicker } from '../../core/components/note-picker/note-picker';
import { KanbanColumnPanel } from '../kanban-column/kanban-column';

/**
 * The gesture of the pure module each arrow asks for (D-C18). A table rather than a `switch`: the
 * four directions are one single mapping, which is also what the module itself does to answer
 * whether a move is possible.
 */
const MOVE_CARD_GESTURE_BY_DIRECTION: Record<
  MoveDirection,
  (columns: KanbanColumn[], cardId: string) => KanbanColumn[]
> = {
  up: moveCardUp,
  down: moveCardDown,
  left: moveCardToPreviousColumn,
  right: moveCardToNextColumn,
};

/** Name a board falls back on when the name field is left empty (D-E2). */
const DEFAULT_NAME = 'Sans titre';

/**
 * Banner shown when the save wrote **nothing at all** — the board itself was refused (D-E9). The
 * user must see it: a message left in the console alone never reaches them.
 */
const SAVE_FAILED_MESSAGE = "Impossible d'enregistrer le tableau.";

/**
 * Banner shown when the board **was** stored but its lists did not follow (D-L24). It is a
 * different message from {@link SAVE_FAILED_MESSAGE} on purpose: telling the user the board could
 * not be saved would be the opposite of what happened, and the title of the navigation bar — which
 * switches to « Modifier le tableau » the moment the board exists (D-L13) — would contradict it.
 * What the banner has to say is the true state and what to do about it: the composition is intact
 * on screen, and saving again replays it whole, that replay being idempotent (D-L10).
 */
const COLUMNS_SAVE_FAILED_MESSAGE =
  'Le tableau est enregistré, mais pas ses listes. Réessayez pour les enregistrer.';

/**
 * Board edit screen, served by the `/kanban/new` and `/kanban/edit/:id` routes (see
 * .agent/KANBAN/EDITION/APPROCHE_KANBAN_EDITION.md). One single component serves both: the
 * presence of an identifier in the route tells edit mode from create mode (D-E8), exactly as
 * `NoteEditor` does for the notes (D1). That identifier is read once, from the route snapshot
 * (D8): the screen is never reused for another board without being created again.
 *
 * The board is only written when the user saves it, so opening this screen and leaving it writes
 * nothing (D-K11). A successful save goes back to the list, where the new card or the corrected
 * name is immediately visible (D-E1); a failed one keeps the user here, name untouched, with a
 * visible banner rather than a message left in the console (D-E9).
 *
 * The board content area carries the columns the user calls « listes »: one `KanbanColumnPanel`
 * per column of the displayed composition, horizontally and in order (D-L21). It replaces the
 * ghost column the previous batch showed there, D-E11 being withdrawn.
 *
 * Each list carries its **cards** inside that composition — there is no signal of their own
 * (D-C18) — and every gesture on them is one call to the pure `kanban-composition` module whose
 * result is reposed in {@link columns}. The draft of a card being typed is the single exception:
 * it stays **out** of the composition until it is validated (D-C29).
 *
 * Built against `PLAN_TESTS_KANBAN_EDITION.md`, part B (groups 2 to 10),
 * `PLAN_TESTS_KANBAN_EDITION_LISTES.md`, groups 6 to 12, and `PLAN_TESTS_KANBAN_CARTES.md`,
 * groups 27 to 34.
 */
@Component({
  selector: 'app-kanban-editor',
  standalone: true,
  imports: [ConfirmDialog, NotePicker, KanbanColumnPanel],
  templateUrl: './kanban-editor.html',
  styleUrl: './kanban-editor.css',
})
export class KanbanEditor implements OnInit {
  /** Current route, read once to tell edit mode (id present) from create mode (absent) — D8. */
  private readonly route = inject(ActivatedRoute);
  /** Data source used to read the board being edited, and to create or rename it on save. */
  private readonly kanbanService = inject(KanbanService);
  /** Router used to go back to the board list, which is the only way out of this screen. */
  private readonly router = inject(Router);

  /**
   * Name the board falls back on, exposed so the template can use it as the hint of the name field:
   * D-E2 ties the two usages together — what is merely suggested while typing is what gets stored
   * on save — so the string lives in one place only.
   */
  readonly defaultName = DEFAULT_NAME;

  /**
   * Board name as the user typed it, two-way bound to the name field. It starts empty on a brand
   * new board, 'Sans titre' being a mere placeholder: the fallback on that name happens on save,
   * not while typing (D-E2).
   */
  name = signal<string>('');

  /**
   * Columns of the board as they are currently displayed, in their display order. This is the
   * composition the four gestures work on, and it is not the database: only a save reconciles the
   * two (D-L1). Empty on a brand new board, which therefore starts without any column.
   */
  columns = signal<KanbanColumn[]>([]);

  /**
   * Whether the in-place field of a new list takes the place of the add gesture, at the right of
   * the existing lists (D-L18).
   */
  addingColumn = signal<boolean>(false);

  /** Name typed in the field of the new list, as it is typed: nothing is cleaned up here (D-L17). */
  newColumnName = signal<string>('');

  /**
   * Identifier of the list the draft of a new card targets, `null` when no card is being typed.
   * The draft is rendered in the slot of **that** list, and it lives here rather than in the
   * composition: a card momentarily carrying an empty text would make the whole save fail
   * (D-C29).
   */
  addingCardInColumnId = signal<string | null>(null);

  /** Text typed in the field of the draft, as it is typed: nothing is cleaned up here (D-C30). */
  newCardText = signal<string>('');

  /** Note chosen for the card being typed, posed on it when the draft is validated (D-C29). */
  newCardNote = signal<Note | null>(null);

  /** Whether the popup that picks the note of a card is open (D-C31). */
  notePickerOpen = signal<boolean>(false);

  /**
   * Identifier of the card the open picker answers for, `null` when it answers for the **draft**
   * of a new card — which is a target like any other (D-C36).
   */
  cardAwaitingNote = signal<string | null>(null);

  /**
   * Name the screen started from — empty on a brand new board, the stored name in edit mode. It is
   * what the typed name is compared to in order to tell whether a change is pending (D-E3), and it
   * is refreshed by a successful save.
   */
  initialName = signal<string>('');

  /**
   * Composition the screen started from — empty on a brand new board, so its very first add
   * counts as a pending change. It is what the displayed composition is compared to (D-E3
   * extended to the lists), and it is refreshed by a successful save.
   */
  initialColumns = signal<KanbanColumn[]>([]);

  /**
   * Whether the route carried an identifier, which is what tells edit mode from create mode (D-E8)
   * and drives the title of the navigation bar (D-E5). **Derived** from {@link kanbanId} rather
   * than stored beside it, so the two can never disagree.
   */
  editing = computed(() => this.kanbanId() !== null);

  /** True while the board is being read from the data source (edit mode only). */
  isLoading = signal<boolean>(false);

  /** True when the board could not be read, which puts the screen in its error state (US1). */
  loadError = signal<boolean>(false);

  /**
   * True when the route carries an identifier no board answers to (D-E4, revised on 2026-10-11).
   * The screen then says so and offers a way back, rather than taking the user to the list on its
   * own, which left a touch of a stale card looking like a bug.
   */
  notFound = signal<boolean>(false);

  /** Message of the banner shown after a failed save, empty when there is none (US5, D-E9). */
  saveError = signal<string>('');

  /**
   * List whose removal the user asked for, `null` when no removal is being confirmed. Kept apart
   * from the composition: the list is only dropped once the popup has been confirmed (D-L4).
   */
  columnToRemove = signal<KanbanColumn | null>(null);

  /** Whether the popup confirming the removal of a list is open (US4 of the lists batch). */
  removeConfirmOpen = signal<boolean>(false);

  /**
   * Card whose removal the user asked for, `null` when no removal is being confirmed. Kept apart
   * from the composition: the card is only dropped once the popup has been confirmed (D-C28), and
   * it is held whole so the popup can name it.
   */
  cardToRemove = signal<KanbanCard | null>(null);

  /**
   * Whether the popup confirming the removal of a card is open — a **third** instance of
   * `ConfirmDialog`, with its own state: its question and what follows it differ from those of
   * the two others (D-C28).
   */
  removeCardConfirmOpen = signal<boolean>(false);

  /** Whether the popup warning that the typed name is about to be lost is open (US4). */
  confirmOpen = signal<boolean>(false);

  /**
   * Identifier of the note the user asked to open while changes were pending, `null` when no such
   * exit is waiting for an answer. It is what routes the answer of the **shared** abandon popup
   * towards the note rather than towards the board list (D-C38), and declining must set it back
   * to `null`: a « Retour » afterwards would otherwise jump to the note (E161).
   */
  pendingNoteNavigationId = signal<string | null>(null);

  /**
   * Whether the board is in move mode, where touching a card selects it instead of opening its
   * text entry (US7). The mode is worth the **whole board** whichever list it was toggled from:
   * that is what lets a card cross the lists without being deselected (D-C23).
   */
  moveMode = signal<boolean>(false);

  /**
   * Identifier of the single selected card of the whole board, `null` when none is. One single
   * signal rather than a flag per card: `US7` holds the selection to one card across the board,
   * and the selection being held **by identifier** is what makes it survive a move, the
   * composition being replaced by a new one at each notch (D-C23).
   */
  selectedCardId = signal<string | null>(null);

  /**
   * Whether what the screen holds differs from what it started from — the board name, or its
   * composition of lists — which is what this screen can lose (US4, US7). Derived state rather
   * than a flag, so there is nothing to reset (D-E3): the comparison is made on trimmed values, so
   * retyping the very same name — or adding only leading or trailing spaces — is not a change.
   */
  hasPendingChanges = computed(() => {
    const nameChanged = this.name().trim() !== this.initialName().trim();
    return nameChanged || this.hasColumnChanges();
  });

  /**
   * Question the popup asks before a list is removed. A list that **carries cards** says so: the
   * cards leave with it, which the user cannot guess from a question about a list alone (US10,
   * D-C40). An empty list keeps the plain question — warning about cards that do not exist would
   * read as a bug.
   */
  removeColumnMessage = computed(() => {
    const columnAimedAt = this.columnToRemove();
    const nameAimedAt = columnAimedAt?.name ?? '';
    const question = `Retirer la liste « ${nameAimedAt} » ?`;
    const cardsCarried = columnAimedAt?.cards ?? [];

    if (cardsCarried.length === 0) {
      return question;
    }
    return `${question} Ses cartes partiront avec elle.`;
  });

  /**
   * Whether the selected card may go to the list on the left. It is computed here and handed to
   * the lists, which ignore their own rank in the board (D-C25).
   */
  canMoveSelectedCardLeft = computed(() => this.canMoveSelectedCard('left'));

  /** Whether the selected card may go to the list on the right, decided here too (D-C25). */
  canMoveSelectedCardRight = computed(() => this.canMoveSelectedCard('right'));

  /**
   * Identifier of the board being edited, or `null` in create mode (D-E8). Read once from the route
   * snapshot (D8), and the single source of truth for the mode the screen is in — {@link editing}
   * and {@link writeKanban} both read it rather than keeping their own copy.
   */
  private readonly kanbanId = signal<string | null>(null);

  /**
   * Angular lifecycle hook; resolves edit vs create mode from the route, then reads the board to
   * edit. In create mode the name field stays empty and nothing is asked of the data source: a
   * brand new board has nothing to load (T2.2, T2.3).
   * @returns A promise that resolves once the initial read has completed, if there was one.
   */
  async ngOnInit(): Promise<void> {
    const idFromRoute = this.route.snapshot.paramMap.get('id');
    this.kanbanId.set(idFromRoute);

    if (idFromRoute !== null) {
      await this.loadKanban(idFromRoute);
    }
  }

  /**
   * Saves the typed name: a creation in create mode, a rename in edit mode — which also stamps the
   * board as modified, hence its rise to the top of the list (US2, US3).
   *
   * Each attempt starts by clearing the banner of the previous one: a message about a past attempt
   * would be read as being about this one (T7.4). On success the saved name becomes the name the
   * screen started from **before** the router is asked to leave, which is what makes "no pending
   * change any more" observable (D5). On failure the user stays here with their name, and the
   * change stays pending (D-E9).
   *
   * **The identifier of the saved board is retained whatever follows**, which is what switches a
   * brand new board to edit mode the moment it exists in the database (D-L13): without it, a
   * second press on « Enregistrer » would start another creation and leave a **second** board
   * behind. Observable consequence, not a bug: after such a half success the title of the
   * navigation bar reads « Modifier le tableau », because the board does exist now.
   *
   * A save whose **lists did not follow** the board is not an exception but a result (D-L24): the
   * user stays here with their composition and a visible banner — its own banner, which says the
   * board is stored and the lists are not, and not the one of a save that wrote nothing — the
   * starting points are left untouched so the change stays pending, and a retry replays the whole
   * composition, which is idempotent, hence converges (D-L10).
   *
   * The **displayed** name is set to the stored one as well, and that is not redundant: a user who
   * saved an empty field stored 'Sans titre' (D-E2), so leaving the field empty would leave it
   * differing from the name the screen started from — a phantom pending change, and the back button
   * would ask to confirm a loss that cannot happen. No test covers that path today (see C11 of
   * REVUE_KANBAN_EDITION.md), so this line must not be dropped as a mere normalisation.
   * @returns A promise that resolves once the save attempt has completed (success or failure).
   */
  async onSave(): Promise<void> {
    this.saveError.set('');
    const nameToSave = this.nameToSave();

    try {
      const saveResult = await this.writeKanban(nameToSave);
      const savedKanban = saveResult.kanban;
      this.kanbanId.set(savedKanban.id);

      if (!saveResult.columnsSaved) {
        this.saveError.set(COLUMNS_SAVE_FAILED_MESSAGE);
        return;
      }

      const savedColumns = savedKanban.columns ?? this.columns();
      this.name.set(savedKanban.name);
      this.initialName.set(savedKanban.name);
      this.columns.set(savedColumns);
      this.initialColumns.set(savedColumns);
      this.goToList();
    } catch (err) {
      console.error("Erreur lors de l'enregistrement du kanban", err);
      this.saveError.set(SAVE_FAILED_MESSAGE);
    }
  }

  /**
   * Opens the in-place field of a new list, empty, in place of the add gesture (D-L18).
   */
  onStartAddColumn(): void {
    this.newColumnName.set('');
    this.addingColumn.set(true);
  }

  /**
   * Adds the list being typed at the **last** position of the displayed composition, under a
   * brand new identifier the screen generates itself — it has to designate that list before it
   * exists in the database (D-L11).
   *
   * The name is the typed one cleaned up by {@link textToStore}: that rule is applied at the
   * **validation** of the field, never while typing (D-L17).
   *
   * The positions are renumbered like after a removal or a move (D-L12), rather than the new list
   * being given the number of lists as its rank: a composition read from a database left with a
   * hole in its positions by an interrupted save (D-L13) would otherwise get two lists at the
   * same rank, and nothing in the schema objects to it (D-L6).
   *
   * The list is added with an **explicit empty** list of cards, never `undefined` (D-C9): the
   * save reads that difference as « this list keeps no card » against « I know nothing of its
   * cards », and a list the screen has just created is in the first case — it is loaded, and it
   * holds none (E168).
   *
   * Nothing is written: the composition is from now on waiting to be saved (D-L1). The field is
   * emptied and left open, so several lists can be added in a row (US2).
   */
  onAddColumn(): void {
    const nameToStore = this.textToStore(this.newColumnName());
    const columnsShown = this.columns();
    const columnToAdd: KanbanColumn = {
      id: crypto.randomUUID(),
      name: nameToStore,
      position: columnsShown.length,
      cards: [],
    };
    const renumberedColumns = this.reindexColumns([...columnsShown, columnToAdd]);

    this.columns.set(renumberedColumns);
    this.newColumnName.set('');
  }

  /**
   * Renames one list of the displayed composition, and that one only: the panel emits the text
   * **as it was typed** (D-L23), the cleaning up and the fallback on 'Sans titre' being applied
   * here (D-L17). The list keeps its identifier and its place, and the other lists are untouched.
   *
   * The list is designated by its identifier rather than by its name: two lists of a same board
   * may be homonyms, and only their identifiers tell them apart (D-L6).
   *
   * Nothing is written: the composition is waiting to be saved (D-L1).
   * @param id Identifier of the list to rename.
   * @param typedName Name as the user typed it in the header of that list.
   */
  onRenameColumn(id: string, typedName: string): void {
    const nameToStore = this.textToStore(typedName);
    const columnsShown = this.columns();
    const renamedColumns = columnsShown.map((column) => {
      const isListToRename = column.id === id;
      return isListToRename ? { ...column, name: nameToStore } : column;
    });

    this.columns.set(renamedColumns);
  }

  /**
   * Opens the draft of a new card in the slot of the list that asked for it, empty (D-C29). The
   * draft is not part of the composition: nothing is added to the board until it is validated.
   * @param columnId Identifier of the list the card will join.
   */
  onStartAddCard(columnId: string): void {
    this.newCardText.set('');
    this.newCardNote.set(null);
    this.addingCardInColumnId.set(columnId);
  }

  /**
   * Opens the picker for the **draft** of a new card, which can be linked before it exists
   * (E156): creating a card and linking one later go through the same place (D-C36).
   */
  onNoteRequestedForDraft(): void {
    this.cardAwaitingNote.set(null);
    this.notePickerOpen.set(true);
  }

  /**
   * Opens the picker for one card of the composition, which is what its reference control asks
   * for: the card carries no popup of its own (D-C36).
   * @param cardId Identifier of the card to link or to unlink.
   */
  onCardNoteRequested(cardId: string): void {
    this.cardAwaitingNote.set(cardId);
    this.notePickerOpen.set(true);
  }

  /**
   * Handles the answer of the picker: the chosen note — or `null` for the explicit « Aucune
   * note » that unlinks (D-C33, D-C35) — is posed on the target the picker was opened for, the
   * draft of a new card being a target like any other, and the popup closes. Giving the picker up
   * emits nothing, so a reference stays as it was without anything to handle here (E155).
   *
   * Nothing is written: the composition is waiting to be saved (H-C2), and the note itself is
   * never touched.
   * @param chosenNote The note to reference, or `null` to carry none.
   */
  onNoteSelected(chosenNote: Note | null): void {
    const cardAimedAt = this.cardAwaitingNote();
    this.notePickerOpen.set(false);

    if (cardAimedAt === null) {
      this.newCardNote.set(chosenNote);
      return;
    }

    const relinkedComposition = setCardNote(this.columns(), cardAimedAt, chosenNote);
    this.columns.set(relinkedComposition);
  }

  /**
   * Adds the card being typed at the **last** position of the list it targets, under a brand new
   * identifier the screen generates itself — it has to designate that card before it exists in
   * the database (D-C20). The positions of that list are renumbered by the pure module, so they
   * stay contiguous and start back from 0 (D-C19).
   *
   * The text is the typed one cleaned up by {@link textToStore} — border spaces dropped, fallback
   * on 'Sans titre' — a rule applied at the **validation** of the field and never while typing
   * (D-C30). The position carried by the forged card is the one the pure module overwrites when
   * it renumbers the list, so it is given its rank at the only place that decides ranks.
   *
   * Nothing is written: the composition is from now on waiting to be saved (D-C29, H-C2). The
   * field is emptied and left open, so several cards can be added in a row (US2).
   */
  onConfirmAddCard(): void {
    const targetColumnId = this.addingCardInColumnId();
    if (targetColumnId === null) {
      return;
    }

    const textToStore = this.textToStore(this.newCardText());
    const cardToAdd: KanbanCard = {
      id: crypto.randomUUID(),
      text: textToStore,
      note: this.newCardNote(),
      position: 0,
    };
    const grownComposition = addCardTo(this.columns(), targetColumnId, cardToAdd);

    this.columns.set(grownComposition);
    this.newCardText.set('');
  }

  /**
   * Replaces the text of one card of the displayed composition, and that one only: the column
   * relays the text **as it was typed** along with the card that validated it (D-C22), the
   * cleaning up and the fallback on 'Sans titre' being applied here, in a single place (D-C30).
   *
   * The card keeps its position, its list and its reference (US3), and the pure module is what
   * guarantees it (E101). Nothing is written: the composition is waiting to be saved (H-C2).
   * @param change The card that validated its entry, and the text as the user typed it.
   */
  onCardTextChanged(change: CardTextChange): void {
    const textToStore = this.textToStore(change.text);
    const retypedComposition = replaceCardText(this.columns(), change.cardId, textToStore);

    this.columns.set(retypedComposition);
  }

  /**
   * Handles the opening of a note a card asked for by its title. **Without** a pending change the
   * note opens straight away; **with** one, the exit goes through the abandon popup already in
   * place, this being an exit of the screen like the back button (US5, US10, D-C38).
   *
   * The card only emits a request: deciding belongs here, which is the whole reason the title is
   * not an anchor (D-C37) — a `routerLink` would navigate without asking and the guard would be
   * lost.
   * @param noteId Identifier of the referenced note to open.
   */
  onNoteOpenRequested(noteId: string): void {
    if (this.hasPendingChanges()) {
      this.pendingNoteNavigationId.set(noteId);
      this.confirmOpen.set(true);
      return;
    }
    this.goToNote(noteId);
  }

  /**
   * Flips the move mode, whichever list asked for it: the mode belongs to the board (D-C23).
   * **Leaving** the mode drops the selection, which hands the touch of a card back its role of
   * opening the text entry (US7).
   *
   * The mode changes nothing by itself: entering it, selecting a card and leaving is not a
   * pending change (D-C39, E151).
   */
  onToggleMoveMode(): void {
    const wasInMoveMode = this.moveMode();
    if (wasInMoveMode) {
      this.selectedCardId.set(null);
    }
    this.moveMode.set(!wasInMoveMode);
  }

  /**
   * Grants the selection a card asked for by touching its body in move mode: the previous one
   * loses it, even in another list, there being one single selected card on the whole board
   * (D-C23, E148).
   * @param cardId Identifier of the card that was touched.
   */
  onCardSelected(cardId: string): void {
    this.selectedCardId.set(cardId);
  }

  /**
   * Moves the selected card one notch in the asked direction, by the matching gesture of the pure
   * module, and reposes the result in the composition (D-C18). The module leaves the composition
   * untouched at the ends of a list or of the board, which is the belt of the disabled arrows
   * (E106 to E110).
   *
   * The card **stays selected**, the selection being held by identifier: the notches can be
   * chained without selecting it again, even once it has changed list (E150). Nothing is written
   * (H-C2).
   * @param direction Where the selected card is asked to go.
   */
  onCardMoveRequested(direction: MoveDirection): void {
    const cardToMoveId = this.selectedCardId();
    if (cardToMoveId === null) {
      return;
    }

    const moveGesture = MOVE_CARD_GESTURE_BY_DIRECTION[direction];
    const movedComposition = moveGesture(this.columns(), cardToMoveId);
    this.columns.set(movedComposition);
  }

  /**
   * Handles the removal a card asked for through its own trash: the card is looked up in the
   * composition so the popup can name it, and the confirmation opens. The panels only emit a
   * request — the popup and the composition belong here (D-C28) — so nothing is removed yet, and
   * nothing written.
   * @param cardId Identifier of the card whose trash was touched.
   */
  onCardRemoveRequested(cardId: string): void {
    const location: CardLocation | null = locateCard(this.columns(), cardId);
    if (location === null) {
      return;
    }

    this.cardToRemove.set(location.card);
    this.removeCardConfirmOpen.set(true);
  }

  /**
   * Handles the answer of the card removal popup: confirming drops that card — and that one only,
   * designated by its identifier so two cards carrying the same text never get mixed up (US2) —
   * and the pure module renumbers its list so the positions stay contiguous (E104). Declining,
   * which the popup also reports for a click outside of it and for the Escape key, keeps the card
   * where it is.
   *
   * A card that was **selected** takes the selection down with it: an identifier designating a
   * card that is no longer in the composition would be a state saying something false, and the
   * arrows read it (D-C23).
   *
   * The referenced note is never touched: removing a card is not removing a note (E146). Nothing
   * is written either way: quitting the screen without saving leaves the card in the database
   * (H-C2).
   * @param confirmed True when the user confirmed the removal, false when they declined.
   */
  onRemoveCardConfirmed(confirmed: boolean): void {
    const cardAimedAt = this.cardToRemove();
    this.cardToRemove.set(null);

    if (!confirmed || cardAimedAt === null) {
      return;
    }

    const wasSelected = this.selectedCardId() === cardAimedAt.id;
    if (wasSelected) {
      this.selectedCardId.set(null);
    }

    const shrunkComposition = removeCard(this.columns(), cardAimedAt.id);
    this.columns.set(shrunkComposition);
  }

  /**
   * Gives the draft of a card up: the field closes and the composition is left untouched — the
   * draft never entered it (D-C29, E140). Nothing is written either.
   */
  onCancelAddCard(): void {
    this.newCardText.set('');
    this.newCardNote.set(null);
    this.addingCardInColumnId.set(null);
  }

  /** Gives the add up: the field closes and the composition is left untouched (US2). */
  onCancelAddColumn(): void {
    this.newColumnName.set('');
    this.addingColumn.set(false);
  }

  /**
   * Moves a list one step towards the left, swapping it with its immediate neighbour (US5).
   * @param index Rank of the list to move, counted from the left.
   */
  onMoveColumnLeft(index: number): void {
    const neighbourIndex = index - 1;
    this.swapColumns(index, neighbourIndex);
  }

  /**
   * Moves a list one step towards the right, swapping it with its immediate neighbour (US5).
   * @param index Rank of the list to move, counted from the left.
   */
  onMoveColumnRight(index: number): void {
    const neighbourIndex = index + 1;
    this.swapColumns(index, neighbourIndex);
  }

  /**
   * Handles the removal a list asked for through its own trash: the list is remembered and the
   * confirmation popup opens, naming it. The panel only emits a request — the confirmation and
   * the composition belong here (D-L4, D-L23) — so nothing is removed yet, and nothing written.
   * @param column The list whose removal is being asked for.
   */
  onRemoveColumn(column: KanbanColumn): void {
    this.columnToRemove.set(column);
    this.removeConfirmOpen.set(true);
  }

  /**
   * Handles the answer of the removal popup: confirming drops that list — and that one only, the
   * list being designated by its identifier so two homonyms never get mixed up (D-L6) — then
   * renumbers the positions so they stay contiguous and start back from 0 (D-L12). Declining,
   * which the popup also reports for a click outside of it and for the Escape key, keeps the list
   * where it is.
   *
   * Nothing is written either way: quitting the screen without saving leaves the list in the
   * database (D-L1).
   * @param confirmed True when the user confirmed the removal, false when they declined.
   */
  onRemoveConfirmed(confirmed: boolean): void {
    const columnAimedAt = this.columnToRemove();
    this.columnToRemove.set(null);

    if (!confirmed || columnAimedAt === null) {
      return;
    }

    const columnsShown = this.columns();
    const keptColumns = columnsShown.filter((column) => column.id !== columnAimedAt.id);
    const renumberedColumns = this.reindexColumns(keptColumns);
    this.columns.set(renumberedColumns);
  }

  /**
   * Handles the back button of the navigation bar: it goes straight back to the list when there is
   * nothing to lose, and asks for a confirmation when the typed name is not saved (US4).
   */
  onBack(): void {
    if (this.hasPendingChanges()) {
      this.confirmOpen.set(true);
      return;
    }
    this.goToList();
  }

  /**
   * Handles the answer of the confirmation popup: leaving is only honoured once the user has said
   * yes, and nothing is ever saved on the way out (US4). Declining — which the popup also reports
   * for a click outside of it and for the Escape key — leaves the user here, name untouched.
   * @param confirmed True when the user confirmed leaving, false when they declined.
   */
  onLeaveConfirmed(confirmed: boolean): void {
    const noteToOpenId = this.pendingNoteNavigationId();
    this.pendingNoteNavigationId.set(null);

    if (!confirmed) {
      return;
    }

    if (noteToOpenId !== null) {
      this.goToNote(noteToOpenId);
      return;
    }
    this.goToList();
  }

  /**
   * Reads the board again after a failed read, from the very same path as the initial one (D4). It
   * is the only action offered by the error state besides going back to the list.
   */
  onRetry(): void {
    const idToReload = this.kanbanId();
    if (idToReload !== null) {
      void this.loadKanban(idToReload);
    }
  }

  /** Goes back to the board list, the main exit of this screen (D-E1, D-E4, US4). */
  goToList(): void {
    this.router.navigate(['/kanban']);
  }

  /**
   * Opens one note in the notes editor, which is the second exit of this screen (US5). Nothing is
   * saved on the way out: the composition stays as it is in the database (US10).
   * @param noteId Identifier of the note to open.
   */
  private goToNote(noteId: string): void {
    this.router.navigate(['/notes/edit', noteId]);
  }

  /**
   * Reads the board to edit into the name field and remembers its name as the one the screen
   * started from (D-E3), raising the loading state for as long as the data source has not
   * answered.
   *
   * An identifier matching no board is not a read failure but an answer: the screen says the board
   * cannot be found and offers a way back to the list (D-E4, revised on 2026-10-11), on the model
   * of the note editor (D5). A read failure raises the error state instead, which offers a way to
   * try again as well, so the screen never stays stuck on its spinner.
   *
   * The positions that come back are renumbered from the display order (D-L12), which closes at
   * the source the one case where the database may hand over a hole in them: a save interrupted
   * halfway (D-L13). The order itself is the one the data source read, by ascending position; only
   * the numbers are made contiguous again, and the comparison that tells a pending change apart
   * ignores them (see {@link hasColumnChanges}), so nothing is reported as modified.
   * @param id The identifier of the board to read.
   * @returns A promise that resolves once the read attempt has completed (success or failure).
   */
  private async loadKanban(id: string): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(false);
    this.notFound.set(false);

    try {
      const kanban = await this.kanbanService.getKanbanById(id);
      if (kanban === null) {
        this.notFound.set(true);
        return;
      }
      this.name.set(kanban.name);
      this.initialName.set(kanban.name);
      const columnsRead = this.reindexColumns(kanban.columns ?? []);
      this.columns.set(columnsRead);
      this.initialColumns.set(columnsRead);
    } catch (err) {
      console.error('Erreur lors du chargement du kanban', err);
      this.loadError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Asks the data source to store the board name **and** the displayed composition in one single
   * grouped write (D-L9): the identifier the call carries tells the two modes apart — `null`
   * creates the board, an identifier renames it, which also stamps it as modified (D-E8, D-L24).
   * The screen never sequences writes of its own, and never calls the single-board writes.
   * @param nameToSave The name to store, already cleaned up.
   * @returns A promise resolving to the board as the data source stored it, and to whether its
   * columns followed.
   */
  private writeKanban(nameToSave: string): Promise<KanbanSaveResult> {
    const idToSave = this.kanbanId();
    const columnsToSave = this.columns();
    return this.kanbanService.saveKanbanWithColumns(idToSave, nameToSave, columnsToSave);
  }

  /**
   * Tells whether the selected card may go one notch in that direction, the pure module being
   * the one that answers so the availability of an arrow and the gesture behind it can never
   * drift apart (E113). Nothing selected means no move.
   * @param direction The direction asked about.
   * @returns True when the move would change the composition.
   */
  private canMoveSelectedCard(direction: MoveDirection): boolean {
    const selectedId = this.selectedCardId();
    if (selectedId === null) {
      return false;
    }
    return canMoveCard(this.columns(), selectedId, direction);
  }

  /**
   * Tells whether the displayed composition differs from the one the screen started from, which
   * is what each of the gestures on a list **and** on a card makes true (US7, US10). The two
   * compositions are compared through the **signature** the pure module builds (D-C39): the
   * identifier, the name and the position of each list, and the identifier, the text, the
   * **note identifier** and the position of each of its cards.
   *
   * Three things that signature leaves out, and each on purpose: the **content** of a referenced
   * note, which would make the comparison costly and would see a note renamed elsewhere read as
   * a change to the board; the **selection**; and the **move mode** — entering the mode,
   * selecting a card and leaving must count for nothing (E151).
   *
   * Names and texts enter it as they are **stored**, the cleaning up happening at the validation
   * of each field (D-C30), so revalidating the very same name or text is not a change.
   * @returns True when the composition is waiting to be saved.
   */
  private hasColumnChanges(): boolean {
    const signatureShown = compositionSignature(this.columns());
    const signatureStartedFrom = compositionSignature(this.initialColumns());
    return signatureShown !== signatureStartedFrom;
  }

  /**
   * Swaps two lists of the displayed composition, then renumbers the positions (D-L12). A
   * neighbour outside of the board leaves the composition untouched: no move out of the board,
   * and no error to handle — the buttons of the ends are disabled anyway, this is their belt.
   *
   * Neither the names nor the number of lists change, and nothing is written (D-L1).
   * @param index Rank of the list being moved.
   * @param neighbourIndex Rank it is swapped with.
   */
  private swapColumns(index: number, neighbourIndex: number): void {
    const columnsShown = this.columns();
    const isNeighbourInBoard = neighbourIndex >= 0 && neighbourIndex < columnsShown.length;
    if (!isNeighbourInBoard) {
      return;
    }

    const swappedColumns = [...columnsShown];
    swappedColumns[index] = columnsShown[neighbourIndex];
    swappedColumns[neighbourIndex] = columnsShown[index];
    const renumberedColumns = this.reindexColumns(swappedColumns);
    this.columns.set(renumberedColumns);
  }

  /**
   * Renumbers the positions of a composition from the rank of each list, base 0, so the model
   * never carries a stale position and the service has no order to derive again (D-L12).
   * @param columns The composition to renumber, in its display order.
   * @returns The same lists, in the same order, their positions matching their rank.
   */
  private reindexColumns(columns: KanbanColumn[]): KanbanColumn[] {
    return columns.map((column, index) => ({ ...column, position: index }));
  }

  /**
   * Cleans a typed text up for storage: leading and trailing spaces are dropped, inner spaces
   * being part of it, and a text empty once cleaned falls back to 'Sans titre'. One single rule
   * for the board name (D-E2), for a list name (D-L17) and for the text of a card (D-C30), which
   * is what keeps the three from drifting apart. An empty value therefore never reaches the data
   * source, whose own refusal stays a safety net (D-E10, D-C12).
   *
   * It is applied at the **validation** of a field, never while typing.
   * @param typedText The name or the text as the user typed it.
   * @returns The value to store.
   */
  private textToStore(typedText: string): string {
    const trimmedText = typedText.trim();
    return trimmedText.length === 0 ? DEFAULT_NAME : trimmedText;
  }

  /**
   * Gives the board name to store, cleaned up by {@link textToStore}.
   * @returns The board name to store.
   */
  private nameToSave(): string {
    return this.textToStore(this.name());
  }
}
