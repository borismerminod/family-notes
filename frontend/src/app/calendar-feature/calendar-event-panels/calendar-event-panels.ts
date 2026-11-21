import {
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  Signal,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { CalendarEventItem } from '../calendar-event-item/calendar-event-item';
import { ConfirmDialog } from '../../core/components/confirm-dialog/confirm-dialog';
import { NotePicker } from '../../core/components/note-picker/note-picker';
import { CalendarEvent } from '../../core/models/calendar-event.model';
import { Note } from '../../core/models/note.model';
import { EventChangeSet, EventComposition, EventEntry, EventIssue } from '../../core/models/calendar-event-composition.model';
import { CalendarService } from '../../core/services/calendar/calendar-service';
import {
  appendEvent,
  applyEntry,
  createBlankEvent,
  findEvent,
  hasPendingChanges as compositionHasPendingChanges,
  removeEvent,
  setEventNote,
  startComposition,
  toChangeSet,
  validateEntry,
} from '../../core/services/calendar/calendar-event-composition';

/** Message shown when the events of the date could not be read (D-EV21). */
const LOAD_FAILED_MESSAGE: string = 'Impossible de charger les événements de cette date.';

/** Message shown when a save failed, which says that nothing was lost (US9). */
const SAVE_FAILED_MESSAGE: string =
  'L\'enregistrement a échoué. Vos modifications sont conservées, vous pouvez réessayer.';

/** Message of the confirmation shown before pending changes are given up (US9). */
const LEAVE_MESSAGE: string = 'Des modifications ne sont pas enregistrées. Les abandonner ?';

/** How the removal confirmation names an event whose text is still empty, a fresh draft (US8). */
const UNTITLED_EVENT_NAME: string = 'Nouvel événement';

/**
 * The popup of the events of one date, opened by `Calendar` when a cell is touched (US1). The
 * class is named `CalendarEventPanels` as the user proposed it (D-EV22).
 *
 * **Stateful** (D-EV23), where `CalendarEventItem` is purely presentational: it reads the events
 * of its date **each time it opens** (D-EV21), holds the pending composition, validates the
 * entries, and hosts the `NotePicker` and the two `ConfirmDialog` (removal, abandon). Every
 * gesture is one call to the pure `calendar-event-composition` module; **nothing is written**
 * before « Enregistrer », which hands the whole changeSet to `CalendarService.saveEventChanges`
 * at once and emits `saved` on success (D-EV13, D-EV25).
 *
 * A single entry is open at a time (D-EV19): while it is, « Ajouter un événement » and the other
 * bodies do nothing, « Enregistrer » is disabled, and leaving counts as losing changes. A new
 * event starts as a draft under entry, which giving up removes (D-EV20). Leaving the popup — by
 * « Fermer », by its backdrop, or by opening a note — goes through the abandon confirmation
 * whenever something is pending (US6, US9).
 *
 * Built against `PLAN_TESTS_CALENDAR_EVENT.md`, groups 10 to 14 (cases T10.1 to T14.9).
 */
@Component({
  selector: 'app-calendar-event-panels',
  standalone: true,
  imports: [DatePipe, CalendarEventItem, ConfirmDialog, NotePicker],
  templateUrl: './calendar-event-panels.html',
  styleUrl: './calendar-event-panels.css',
})
export class CalendarEventPanels {
  /** Data source of the events, read on every opening and written by « Enregistrer ». */
  private readonly calendarService: CalendarService = inject(CalendarService);

  /** Router used to open the note an event references (US6). */
  private readonly router: Router = inject(Router);

  /** The civil date the popup shows, as `YYYY-MM-DD`. */
  date = input.required<string>();

  /** Visibility of the popup, bound both ways by `Calendar`. */
  open = model<boolean>(false);

  /** Emitted after a successful save. */
  saved = output<void>();

  /** The pending state of the popup, or `null` until the events of the date have been read. */
  composition: WritableSignal<EventComposition | null> = signal<EventComposition | null>(null);

  /** Identifier of the event whose entry form is open, or `null`: one entry at a time (D-EV19). */
  editingEventId: WritableSignal<string | null> = signal<string | null>(null);

  /**
   * Identifier of the event added by « Ajouter un événement » and never validated yet, or `null`.
   * Giving its entry up removes it: renouncing creates nothing (D-EV20, US3).
   */
  draftEventId: WritableSignal<string | null> = signal<string | null>(null);

  /** Identifier of the event the note picker was opened for, or `null`. */
  noteTargetEventId: WritableSignal<string | null> = signal<string | null>(null);

  /** Visibility of the note picker, which reads its own notes when it opens. */
  notePickerOpen: WritableSignal<boolean> = signal<boolean>(false);

  /** The problems of the last refused entry, shown by the item under entry (US7). */
  entryIssues: WritableSignal<readonly EventIssue[]> = signal<readonly EventIssue[]>([]);

  /** True while the events of the date are being read. */
  isLoading: WritableSignal<boolean> = signal<boolean>(false);

  /**
   * True when the last read failed: the popup then shows {@link LOAD_FAILED_MESSAGE} and offers
   * nothing but closing, since nothing may be composed over an unknown state (D-EV21).
   */
  loadFailed: WritableSignal<boolean> = signal<boolean>(false);

  /** Identifier of the event whose removal waits for confirmation, or `null`. */
  removeTargetEventId: WritableSignal<string | null> = signal<string | null>(null);

  /** Visibility of the removal confirmation. */
  removeConfirmOpen: WritableSignal<boolean> = signal<boolean>(false);

  /** True while a save is under way: a second touch of « Enregistrer » is then ignored (E114). */
  isSaving: WritableSignal<boolean> = signal<boolean>(false);

  /**
   * True after a failed save: the popup stays open with its composition intact and shows
   * {@link SAVE_FAILED_MESSAGE}, the user being free to try again (US9).
   */
  saveFailed: WritableSignal<boolean> = signal<boolean>(false);

  /**
   * The way out the abandon confirmation stands for: the identifier of the note to open once the
   * changes are given up, or `null` when the confirmation answers « Fermer » (US6, US9).
   */
  pendingNoteId: WritableSignal<string | null> = signal<string | null>(null);

  /** Visibility of the confirmation that gives the pending changes up. */
  leaveConfirmOpen: WritableSignal<boolean> = signal<boolean>(false);

  /** The message shown when the events could not be read, read by the template. */
  readonly loadFailedMessage: string = LOAD_FAILED_MESSAGE;

  /** The message shown after a failed save, read by the template. */
  readonly saveFailedMessage: string = SAVE_FAILED_MESSAGE;

  /** The message of the abandon confirmation, read by the template. */
  readonly leaveMessage: string = LEAVE_MESSAGE;

  /**
   * True when leaving the popup would lose something: the composition differs from what was read,
   * or an entry is open, whose typed values the popup cannot see (D-EV19, plan D9).
   */
  hasPendingChanges: Signal<boolean> = computed((): boolean => {
    const entryIsOpen: boolean = this.editingEventId() !== null;
    const currentComposition: EventComposition | null = this.composition();
    const compositionChanged: boolean =
      currentComposition !== null && compositionHasPendingChanges(currentComposition);
    return entryIsOpen || compositionChanged;
  });

  /**
   * The message of the removal confirmation, which names the event by its text (US8). A draft
   * whose text is still empty is named {@link UNTITLED_EVENT_NAME}.
   */
  removeMessage: Signal<string> = computed((): string => {
    const targetEventId: string | null = this.removeTargetEventId();
    const targetEvent: CalendarEvent | null = this.findComposedEvent(targetEventId);
    const typedTitle: string = targetEvent?.title.trim() ?? '';
    const eventName: string = typedTitle === '' ? UNTITLED_EVENT_NAME : typedTitle;
    return `Supprimer l'événement « ${eventName} » ?`;
  });

  /** Whether the popup was open the last time its visibility was looked at. */
  private wasOpen: boolean = false;

  /**
   * Number of the latest read of the events. A read answering after a newer one has started —
   * the popup closed and opened again meanwhile — is ignored, so it never overwrites a fresher
   * composition.
   */
  private latestLoad: number = 0;

  /**
   * Watches the visibility of the popup and starts a fresh read each time it opens, so that a
   * re-opening always shows the saved state (E95).
   */
  constructor() {
    effect((): void => {
      const isOpen: boolean = this.open();
      const hasJustOpened: boolean = isOpen && !this.wasOpen;
      this.wasOpen = isOpen;
      if (hasJustOpened) {
        untracked((): void => {
          void this.loadEvents();
        });
      }
    });
  }

  /**
   * Adds a blank event at the bottom of the list, unsorted (D-EV4), and opens its entry. Nothing
   * happens while another entry is open (D-EV19).
   */
  onAddEvent(): void {
    const currentComposition: EventComposition | null = this.composition();
    if (currentComposition === null || this.editingEventId() !== null) {
      return;
    }
    const draftId: string = crypto.randomUUID();
    const blankEvent: CalendarEvent = createBlankEvent(draftId, currentComposition.date);
    this.applyGesture((composition: EventComposition): EventComposition =>
      appendEvent(composition, blankEvent),
    );
    this.editingEventId.set(draftId);
    this.draftEventId.set(draftId);
  }

  /**
   * Opens the entry of an event, unless another entry is already open (D-EV19).
   * @param eventId Identifier of the event whose body was touched.
   */
  onEntryOpenRequested(eventId: string): void {
    if (this.editingEventId() !== null) {
      return;
    }
    this.editingEventId.set(eventId);
  }

  /**
   * Validates a typed entry. A refused entry stays open with its problems and leaves the
   * composition as it was (US7); an accepted one is applied, which sorts the event to its place,
   * and closes the entry.
   * @param eventId Identifier of the event under entry.
   * @param entry The entry as typed.
   */
  onEntryValidated(eventId: string, entry: EventEntry): void {
    const issues: readonly EventIssue[] = validateEntry(entry);
    if (issues.length > 0) {
      this.entryIssues.set(issues);
      return;
    }
    this.applyGesture((currentComposition: EventComposition): EventComposition =>
      applyEntry(currentComposition, eventId, entry),
    );
    this.closeEntry();
  }

  /**
   * Gives an entry up. A draft never validated is removed, so renouncing creates nothing (US3);
   * any other event keeps the values it had before the entry opened.
   * @param eventId Identifier of the event under entry.
   */
  onEntryCancelled(eventId: string): void {
    if (eventId === this.draftEventId()) {
      this.removeFromComposition(eventId);
    }
    this.closeEntry();
  }

  /**
   * Opens the note picker for one event, remembering which one it serves.
   * @param eventId Identifier of the event that asked for a note.
   */
  onNoteRequested(eventId: string): void {
    this.noteTargetEventId.set(eventId);
    this.notePickerOpen.set(true);
  }

  /**
   * Links the note chosen in the picker to the event it was opened for, or leaves that event
   * without a note for « Aucune note ». Giving the picker up emits nothing, which leaves the
   * reference unchanged (US5).
   * @param note The chosen note, or `null` for « Aucune note ».
   */
  onNoteSelected(note: Note | null): void {
    const targetEventId: string | null = this.noteTargetEventId();
    this.noteTargetEventId.set(null);
    if (targetEventId === null) {
      return;
    }
    this.setNoteOf(targetEventId, note);
  }

  /**
   * Unlinks the note of an event, without going through the picker (D-EV24).
   * @param eventId Identifier of the event whose note is removed.
   */
  onNoteRemoved(eventId: string): void {
    this.setNoteOf(eventId, null);
  }

  /**
   * Opens the note an event references in the note editor (US6). With changes pending, the
   * abandon confirmation comes first, remembering the note to open.
   * @param noteId Identifier of the note whose title was touched.
   */
  onNoteOpenRequested(noteId: string): void {
    if (!this.hasPendingChanges()) {
      this.openNote(noteId);
      return;
    }
    this.pendingNoteId.set(noteId);
    this.leaveConfirmOpen.set(true);
  }

  /**
   * Asks for the confirmation of a removal; nothing is removed before « Oui ».
   * @param eventId Identifier of the event whose trash was touched.
   */
  onRemoveRequested(eventId: string): void {
    this.removeTargetEventId.set(eventId);
    this.removeConfirmOpen.set(true);
  }

  /**
   * Answers the removal confirmation. « Oui » removes the event, a pending change like any other
   * (D-EV2), and closes its entry if it was the one under way; « Non » changes nothing.
   * @param accepted Whether the user confirmed the removal.
   */
  onRemoveConfirmed(accepted: boolean): void {
    const targetEventId: string | null = this.removeTargetEventId();
    this.removeTargetEventId.set(null);
    if (!accepted || targetEventId === null) {
      return;
    }
    this.removeFromComposition(targetEventId);
    if (targetEventId === this.editingEventId()) {
      this.closeEntry();
    }
  }

  /**
   * Saves the whole composition at once (US9). With nothing pending, it only closes the popup:
   * nothing is written. Otherwise the changeSet is handed to the service; a success closes the
   * popup and emits {@link saved} (D-EV25); a failure is logged and shown, and leaves the popup
   * open with its composition untouched.
   * @returns A promise resolved once the save attempt is over.
   */
  async onSave(): Promise<void> {
    const currentComposition: EventComposition | null = this.composition();
    if (currentComposition === null || this.isSaving()) {
      return;
    }
    if (!this.hasPendingChanges()) {
      this.open.set(false);
      return;
    }
    const changeSet: EventChangeSet = toChangeSet(currentComposition);
    this.saveFailed.set(false);
    this.isSaving.set(true);
    try {
      await this.calendarService.saveEventChanges(changeSet);
      this.open.set(false);
      this.saved.emit();
    } catch (err) {
      console.error('Erreur lors de l\'enregistrement des événements de la date', err);
      this.saveFailed.set(true);
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Closes the popup at once when nothing would be lost, and otherwise asks first (US1, US9).
   */
  onClose(): void {
    if (!this.hasPendingChanges()) {
      this.open.set(false);
      return;
    }
    this.pendingNoteId.set(null);
    this.leaveConfirmOpen.set(true);
  }

  /**
   * A click on the backdrop itself behaves as « Fermer », warning included (D-EV26); a click on
   * the panel, which bubbles up to the backdrop, is ignored.
   * @param event The click, whose target tells the backdrop from the panel.
   */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.onClose();
    }
  }

  /**
   * Answers the abandon confirmation. « Oui » takes the way out that was asked for: the note to
   * open, or the closing of the popup, which drops the composition — the next opening reads the
   * base again. « Non » keeps the popup, its composition and its entry as they were.
   * @param accepted Whether the user agreed to give the changes up.
   */
  onLeaveConfirmed(accepted: boolean): void {
    const noteToOpen: string | null = this.pendingNoteId();
    this.pendingNoteId.set(null);
    if (!accepted) {
      return;
    }
    if (noteToOpen !== null) {
      this.openNote(noteToOpen);
      return;
    }
    this.open.set(false);
  }

  /**
   * Navigates to the note editor. A refused navigation is logged, never left unhandled.
   * @param noteId Identifier of the note opened.
   */
  private openNote(noteId: string): void {
    const navigation: Promise<boolean> = this.router.navigate(['/notes/edit', noteId]);
    navigation.catch((err: unknown): void => {
      console.error('Erreur lors de l\'ouverture de la note', err);
    });
  }

  /**
   * Finds an event of the composition.
   * @param eventId Identifier of the event looked for, or `null`.
   * @returns The composed event, or `null` when there is none.
   */
  private findComposedEvent(eventId: string | null): CalendarEvent | null {
    const currentComposition: EventComposition | null = this.composition();
    if (currentComposition === null || eventId === null) {
      return null;
    }
    return findEvent(currentComposition, eventId);
  }

  /**
   * Links a note to one event of the composition, or unlinks it with `null`.
   * @param eventId Identifier of the event.
   * @param note The note linked, or `null`.
   */
  private setNoteOf(eventId: string, note: Note | null): void {
    this.applyGesture((currentComposition: EventComposition): EventComposition =>
      setEventNote(currentComposition, eventId, note),
    );
  }

  /**
   * Removes one event from the composition.
   * @param eventId Identifier of the event removed.
   */
  private removeFromComposition(eventId: string): void {
    this.applyGesture((currentComposition: EventComposition): EventComposition =>
      removeEvent(currentComposition, eventId),
    );
  }

  /**
   * Replaces the composition by the one a gesture of the pure module returns. Before the events
   * are read there is no composition, and the gesture is ignored.
   * @param gesture One call to `calendar-event-composition`, from a composition to the next.
   */
  private applyGesture(gesture: (currentComposition: EventComposition) => EventComposition): void {
    const currentComposition: EventComposition | null = this.composition();
    if (currentComposition === null) {
      return;
    }
    const nextComposition: EventComposition = gesture(currentComposition);
    this.composition.set(nextComposition);
  }

  /** Closes the entry under way, forgets its problems, and stops treating any event as a draft. */
  private closeEntry(): void {
    this.editingEventId.set(null);
    this.draftEventId.set(null);
    this.entryIssues.set([]);
  }

  /**
   * Forgets everything a previous opening left: the composition, the entry and its draft, the
   * targets of the picker and of the confirmations, and the failures.
   */
  private resetOpeningState(): void {
    this.composition.set(null);
    this.closeEntry();
    this.noteTargetEventId.set(null);
    this.removeTargetEventId.set(null);
    this.pendingNoteId.set(null);
    this.loadFailed.set(false);
    this.saveFailed.set(false);
    this.isSaving.set(false);
  }

  /**
   * Resets the state of a previous opening, reads the events of the date and opens a composition
   * on them, sorted (D-EV21). A failed read is logged and turned into {@link loadFailed}, never
   * left as an unhandled rejection; a read overtaken by a newer one is dropped.
   * @returns A promise resolved once the read attempt is over, success or failure.
   */
  private async loadEvents(): Promise<void> {
    const popupDate: string = this.date();
    const thisLoad: number = this.latestLoad + 1;
    this.latestLoad = thisLoad;
    this.resetOpeningState();
    this.isLoading.set(true);
    try {
      const readEvents: CalendarEvent[] = await this.calendarService.getEventsFromDate(popupDate);
      if (thisLoad !== this.latestLoad) {
        return;
      }
      const openedComposition: EventComposition = startComposition(popupDate, readEvents);
      this.composition.set(openedComposition);
    } catch (err) {
      console.error('Erreur lors du chargement des événements de la date', err);
      if (thisLoad === this.latestLoad) {
        this.loadFailed.set(true);
      }
    } finally {
      if (thisLoad === this.latestLoad) {
        this.isLoading.set(false);
      }
    }
  }
}
