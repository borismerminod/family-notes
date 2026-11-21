import {
  Component,
  computed,
  input,
  linkedSignal,
  output,
  Signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { CalendarEvent } from '../../core/models/calendar-event.model';
import { EventEntry, EventIssue } from '../../core/models/calendar-event-composition.model';
import { Note } from '../../core/models/note.model';
import { entryOf } from '../../core/services/calendar/calendar-event-composition';

/**
 * The part of the entry form a problem is shown under: the text field, the date field, or the
 * pair of time fields, the three time problems all concerning the start and end together.
 */
type EntryField = 'title' | 'date' | 'times';

/** The readable message of each problem an entry may raise (plan D6, US7). */
const ISSUE_MESSAGES: Record<EventIssue, string> = {
  TEXT_REQUIRED: 'Le texte de l\'événement est obligatoire.',
  DATE_INVALID: 'La date n\'est pas valide.',
  TIME_FORMAT_INVALID: 'L\'heure doit être au format HH:mm.',
  END_WITHOUT_START: 'Une heure de fin demande une heure de début.',
  END_NOT_AFTER_START: 'L\'heure de fin doit être après l\'heure de début.',
};

/**
 * The field each problem is shown under. The fields come in the order `validateEntry` raises the
 * problems, so the messages read in that same order.
 */
const ISSUE_FIELDS: Record<EventIssue, EntryField> = {
  TEXT_REQUIRED: 'title',
  DATE_INVALID: 'date',
  TIME_FORMAT_INVALID: 'times',
  END_WITHOUT_START: 'times',
  END_NOT_AFTER_START: 'times',
};

/**
 * One event of the event popup (`CalendarEventPanels`), at rest or under entry.
 *
 * The class is named `CalendarEventItem` because `CalendarEvent` is the model it receives, and
 * `Item` rather than `Panel` keeps it apart from the popup (D-EV22).
 *
 * **Purely presentational** (D-EV23): it injects nothing, sorts nothing, validates nothing and
 * opens no popup. It shows the event, holds what the user types in its entry form, and emits
 * requests; the popup owns the composition, the validation, the note picker, the confirmations
 * and the router.
 *
 * At rest, it shows the time, the whole text (D-EV6), the date when the popup asks for it
 * (D-EV3), the trash, and the note controls. Under entry, the form replaces the body and the
 * trash, while the note controls stay, so a new event gets its note in the same gesture (US3).
 * The note controls follow D-EV24: a linked note shows its title, which opens it, and « Retirer
 * la note »; an event without a note offers « Lier une note », and nothing else ever chooses
 * another note.
 *
 * Built against `PLAN_TESTS_CALENDAR_EVENT.md`, groups 8 and 9 (cases T8.1 to T9.8).
 */
@Component({
  selector: 'app-calendar-event-item',
  standalone: true,
  templateUrl: './calendar-event-item.html',
  styleUrl: './calendar-event-item.css',
})
export class CalendarEventItem {
  /**
   * Event to display. Read on every access, never copied: the popup hands a new event whenever
   * the composition replaces it, for instance when a note is linked during an entry.
   */
  event = input.required<CalendarEvent>();

  /** Whether the entry form of this event is open. The popup holds the single open entry (D-EV19). */
  isEditing = input<boolean>(false);

  /**
   * Whether the date of the event is shown: the popup asks for it when the event was moved to
   * another date and not yet saved (D-EV3).
   */
  showDate = input<boolean>(false);

  /** The problems the popup found in the last validated entry, shown under their field (US7). */
  issues = input<readonly EventIssue[]>([]);

  /** Emitted when the body is touched: the popup decides whether the entry may open (D-EV19). */
  entryOpenRequested = output<void>();

  /**
   * Emitted by ✓ with the entry **as it was typed**, untrimmed: cleaning belongs to the
   * composition (`applyEntry`), in a single place.
   */
  entryValidated = output<EventEntry>();

  /** Emitted by ✗: the popup closes the entry, and removes the event if it was a draft (D-EV20). */
  entryCancelled = output<void>();

  /** Emitted by « Lier une note »: the popup owns the note picker. */
  noteRequested = output<void>();

  /** Emitted by « Retirer la note »: the popup unlinks the note without going through the picker. */
  noteRemoved = output<void>();

  /**
   * Emitted with the identifier of the linked note when its title is touched: a request, not a
   * navigation, since only the popup knows whether changes are pending (US6).
   */
  noteOpenRequested = output<string>();

  /** Emitted by the trash: a request, nothing else, the popup asking for confirmation (US8). */
  removeRequested = output<void>();

  /**
   * What the entry form holds. It is filled from the event received **when the entry opens**, and
   * from then on follows only what the user types: a new event received during the entry (a
   * note linked) or new problems (a refused entry) never erase the typed values (E83).
   */
  typedEntry: WritableSignal<EventEntry> = linkedSignal<boolean, EventEntry>({
    source: this.isEditing,
    computation: (): EventEntry => untracked((): EventEntry => entryOf(this.event())),
  });

  /**
   * The time of the event as shown at rest (plan D7): `HH:mm` for a start alone, `HH:mm – HH:mm`
   * for a range, and an empty string for an event with no time, which then shows no time at all.
   */
  timeLabel: Signal<string> = computed((): string => {
    const currentEvent: CalendarEvent = this.event();
    if (currentEvent.end_time === '') {
      return currentEvent.start_time;
    }
    return `${currentEvent.start_time} – ${currentEvent.end_time}`;
  });

  /**
   * The date of the event as `dd/MM/yyyy` (plan D7). It is recomposed from the three civil parts
   * of `YYYY-MM-DD`, with no `Date` involved, so no time zone can shift the day.
   */
  dateLabel: Signal<string> = computed((): string => {
    const civilDateParts: string[] = this.event().date.split('-');
    const year: string = civilDateParts[0];
    const month: string = civilDateParts[1];
    const day: string = civilDateParts[2];
    return `${day}/${month}/${year}`;
  });

  /** Touching the body asks the popup to open the entry of this event (US4). */
  onBodyTouched(): void {
    this.entryOpenRequested.emit();
  }

  /** Touching the trash asks the popup for the removal of this event, and removes nothing (E76). */
  onRemoveRequested(): void {
    this.removeRequested.emit();
  }

  /**
   * Touching the title of the linked note asks the popup to open that note (E77).
   * @param linkedNote The note the event references.
   */
  onNoteOpenRequested(linkedNote: Note): void {
    this.noteOpenRequested.emit(linkedNote.id);
  }

  /** Touching « Lier une note » asks the popup for the note picker (E78). */
  onNoteRequested(): void {
    this.noteRequested.emit();
  }

  /** Touching « Retirer la note » asks the popup to unlink the note (E78). */
  onNoteRemoved(): void {
    this.noteRemoved.emit();
  }

  /**
   * Keeps the text the user typed, as is.
   * @param title The value of the text field.
   */
  onTitleTyped(title: string): void {
    this.typedEntry.update((entry: EventEntry): EventEntry => ({ ...entry, title }));
  }

  /**
   * Keeps the date the user typed, as is.
   * @param date The value of the date field, `YYYY-MM-DD` or `''`.
   */
  onDateTyped(date: string): void {
    this.typedEntry.update((entry: EventEntry): EventEntry => ({ ...entry, date }));
  }

  /**
   * Keeps the start time the user typed, as is.
   * @param startTime The value of the start field, `HH:mm` or `''`.
   */
  onStartTimeTyped(startTime: string): void {
    this.typedEntry.update((entry: EventEntry): EventEntry => ({ ...entry, startTime }));
  }

  /**
   * Keeps the end time the user typed, as is.
   * @param endTime The value of the end field, `HH:mm` or `''`.
   */
  onEndTimeTyped(endTime: string): void {
    this.typedEntry.update((entry: EventEntry): EventEntry => ({ ...entry, endTime }));
  }

  /**
   * ✓ emits the entry as typed (E80). The entry stays open: the popup closes it once it has
   * accepted the entry, or hands back its problems.
   */
  onEntryValidated(): void {
    const typedEntry: EventEntry = this.typedEntry();
    this.entryValidated.emit(typedEntry);
  }

  /** ✗ emits the cancellation, and no validated entry (E81). */
  onEntryCancelled(): void {
    this.entryCancelled.emit();
  }

  /**
   * The readable messages of the problems shown under one part of the entry form, in the order
   * the popup handed them.
   * @param field The part of the form.
   * @returns The messages of the problems concerning that part, possibly none.
   */
  issueMessagesOf(field: EntryField): string[] {
    const fieldIssues: EventIssue[] = this.issues().filter(
      (issue: EventIssue): boolean => ISSUE_FIELDS[issue] === field,
    );
    return fieldIssues.map((issue: EventIssue): string => ISSUE_MESSAGES[issue]);
  }
}
