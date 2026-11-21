import { Component, computed, effect, inject, model, output, signal } from '@angular/core';
import { Note } from '../../models';
import { NotesService } from '../../services/notes/notes-service';

/**
 * Banner shown when the popup could not read the notes. The failure is **contained** in the popup:
 * the board behind it stays usable, and the user may give the popup up with the reference of their
 * card untouched (E179). A message left in the console alone would never reach them.
 */
const LOAD_FAILED_MESSAGE = 'Impossible de charger les notes.';

/**
 * Popup that picks the note a card references, hosted by `KanbanEditor` and opened from the text
 * entry of a card as well as from the draft of a new one (D-C31, D-C36). It sits beside
 * `ConfirmDialog` and borrows its mechanics: `open` as a `model()` so the host may bind it one or
 * two ways, and a popup that closes itself.
 *
 * Unlike the components of the board, it **reads its own data** (D-C32): it injects `NotesService`
 * and asks for the notes **when it opens**, never when the board opens. Its loading state is
 * therefore its own, and stays out of the already heavy edit screen.
 *
 * It answers with the **whole** note, or with `null` for the explicit « Aucune note » choice that
 * unlinks a card (D-C33, D-C35); giving it up emits **nothing**, so the reference of the card
 * stays as it was without the host having to handle it (US4).
 *
 * **Batch G in progress.** The filter by title, the two empty states and the read failure belong
 * to the cases of the groups 36 and 37 of `PLAN_TESTS_KANBAN_CARTES.md`, and are not written yet.
 */
@Component({
  selector: 'app-note-picker',
  standalone: true,
  templateUrl: './note-picker.html',
  styleUrl: './note-picker.css',
})
export class NotePicker {
  /** Data source the popup reads its own notes from, lazily, on each opening (D-C32). */
  private readonly notesService = inject(NotesService);

  /**
   * Visibility of the popup. `model()` allows both a one-way `[open]` and a two-way `[(open)]`
   * binding, and lets the popup close itself — the very parti `ConfirmDialog` takes.
   */
  open = model<boolean>(false);

  /**
   * Emitted with the note the user chose, or `null` for « Aucune note ». Nothing is emitted when
   * the popup is given up: that silence is what leaves a reference unchanged (US4).
   */
  selected = output<Note | null>();

  /** The notes the application holds, as the last opening read them. */
  notes = signal<Note[]>([]);

  /** True while the popup is reading the notes, which is when it shows its own indicator. */
  isLoading = signal<boolean>(false);

  /**
   * True when the last read failed, which is when the popup shows {@link LOAD_FAILED_MESSAGE}
   * instead of a list or an empty state. Reset at the start of every read, so re-opening the popup
   * on a mended database shows the notes again.
   */
  loadError = signal<boolean>(false);

  /** The message the popup shows when it could not read the notes, read by the template. */
  readonly loadFailedMessage: string = LOAD_FAILED_MESSAGE;

  /** What the user typed in the search field, kept as it was typed. */
  search = signal<string>('');

  /**
   * The notes the popup proposes: those whose **title** contains the search, the case of neither
   * being looked at. The filter runs in memory, the notes being already read, and looks at the
   * title **alone** — never the category, never the content of the note (D-C34).
   */
  filteredNotes = computed<Note[]>((): Note[] => {
    const searchedText: string = this.search().toLowerCase();
    const readNotes: Note[] = this.notes();
    return readNotes.filter((note: Note): boolean => {
      const title: string = note.title.toLowerCase();
      return title.includes(searchedText);
    });
  });

  /**
   * True when the application does hold notes but the search reaches none of them. It is what
   * tells the second empty state from the first: « aucune note ne correspond » is not « aucune
   * note dans l'application », and the two never show together (D-NP1).
   */
  hasSearchWithoutMatch = computed<boolean>((): boolean => {
    const hasNotes: boolean = this.notes().length > 0;
    const hasMatch: boolean = this.filteredNotes().length > 0;
    return hasNotes && !hasMatch;
  });

  /**
   * Whether the popup was open the last time its visibility was looked at, so that the read
   * departs on the **transition** to open and not on every render of an open popup (E169).
   */
  private wasOpen: boolean = false;

  /**
   * Watches the visibility of the popup and reads the notes each time it opens. A closed popup
   * reads nothing at all: that is what keeps the notes out of the opening of a board (D-C32).
   */
  constructor() {
    effect((): void => {
      const isOpen: boolean = this.open();
      const hasJustOpened: boolean = isOpen && !this.wasOpen;
      this.wasOpen = isOpen;
      if (hasJustOpened) {
        void this.loadNotes();
      }
    });
  }

  /**
   * Asks the data source for every note of the application, the popup showing its own loading
   * indicator meanwhile. A failed read leaves the popup with no note and raises its own banner,
   * the board behind it staying usable (E179).
   * @returns A promise that resolves once the read attempt has completed (success or failure).
   */
  private async loadNotes(): Promise<void> {
    this.isLoading.set(true);
    this.loadError.set(false);

    try {
      const notesRead: Note[] = await this.notesService.getAllNotes();
      this.notes.set(notesRead);
    } catch (err) {
      console.error('Erreur lors du chargement des notes', err);
      this.notes.set([]);
      this.loadError.set(true);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Answers with the note the user touched and closes the popup. The **whole** note is emitted,
   * the popup having it in hand: an identifier and a title would force the host to read the note
   * again to fill a field already held (D-C33, D-C3).
   * @param chosenNote The note the touched entry stands for.
   */
  onNoteChosen(chosenNote: Note): void {
    this.selected.emit(chosenNote);
    this.open.set(false);
  }

  /**
   * Answers with an **absence** of note and closes the popup, which is how a card is unlinked
   * (D-C35). It is a choice, and that is what tells it from giving the popup up: here the host is
   * told to empty the reference, there it is told nothing at all (E177, E178).
   */
  onNoNoteChosen(): void {
    this.selected.emit(null);
    this.open.set(false);
  }

  /**
   * Closes the popup without answering, which is what a click outside of it means: the reference
   * of the card stays what it was (US4).
   */
  onGiveUp(): void {
    this.open.set(false);
  }

  /**
   * Closes the popup on a click on the backdrop itself, a click on the panel being ignored.
   * @param event The click, whose target tells the backdrop from the panel.
   */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onGiveUp();
    }
  }
}
