import { Component, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { CalendarEventItem } from './calendar-event-item';
import { CalendarEvent } from '../../core/models/calendar-event.model';
import { EventEntry, EventIssue } from '../../core/models/calendar-event-composition.model';
import { Note } from '../../core/models/note.model';

/**
 * @file calendar-event-item.spec.ts
 * @description Black-box TDD tests for `CalendarEventItem`, the component that shows one event of
 * the event popup, at rest or under entry.
 *
 * Source: `.agent/CALENDAR/EVENT/PLAN_TESTS_CALENDAR_EVENT.md` §7, groups 8 and 9 (cases `T8.1` →
 * `T9.8`, effects `E70` → `E85`, causes `C70` → `C88`), and its DOM contract §9.1. Development
 * approach: the same folder's `APPROCHE_CALENDAR_EVENT.md`, batch E (`D-EV23`, `D-EV24`).
 *
 * The component is presentational (`D-EV23`): it injects nothing, sorts nothing, validates nothing
 * and opens no popup. It shows an event and emits requests. Following `D12`, it is mounted inside a
 * test host that binds `event`, `isEditing`, `showDate` and `issues`, and records every emission.
 * No double, and no `Router` is provided: a navigation attempt would make the case fail, so `E77`
 * is proved by the emission alone.
 *
 * Frozen decisions the cases rely on:
 *   D5 — the reference data: `evt-matin` « Réunion parents-profs » 09:00–10:30, `evt-midi`
 *        « Déjeuner » 12:30, `evt-journee` « Congé » with no time, all on `2026-11-19`; note
 *        `note-questions` « Questions à poser ».
 *   D6 — the exact message of each problem, compared by T9.5.
 *   D7 — the time reads `09:00` for a start alone and `09:00 – 10:30` (en dash surrounded by
 *        spaces) for a range; the date reads `20/11/2026` when `showDate` is true.
 */

/** The date every reference event belongs to (D5). */
const POPUP_DATE: string = '2026-11-19';

/** The note `evt-matin` is linked to when a case needs a linked event (D5). */
const NOTE_QUESTIONS: Note = {
  id: 'note-questions',
  title: 'Questions à poser',
  category: null,
  blocks: [],
  updatedAt: '2026-11-15T08:00:00.000Z',
};

/** An event text of exactly 120 characters, which the item must show whole (`E70`, `D-EV6`). */
const LONG_TITLE: string =
  'Réunion de rentrée avec l’équipe pédagogique, les parents délégués et la direction, en salle polyvalente du bâtiment B12';

/** The readable message of each problem an entry may raise (D6). */
const ISSUE_MESSAGES: Record<EventIssue, string> = {
  TEXT_REQUIRED: 'Le texte de l\'événement est obligatoire.',
  DATE_INVALID: 'La date n\'est pas valide.',
  TIME_FORMAT_INVALID: 'L\'heure doit être au format HH:mm.',
  END_WITHOUT_START: 'Une heure de fin demande une heure de début.',
  END_NOT_AFTER_START: 'L\'heure de fin doit être après l\'heure de début.',
};

/**
 * Builds `evt-matin` of D5: « Réunion parents-profs », 09:00–10:30, unlinked. Every call returns a
 * fresh object.
 * @returns The event.
 */
function buildEvtMatin(): CalendarEvent {
  return {
    id: 'evt-matin',
    title: 'Réunion parents-profs',
    date: POPUP_DATE,
    start_time: '09:00',
    end_time: '10:30',
    note: null,
  };
}

/**
 * Builds `evt-matin` of D5 linked to `note-questions`.
 * @returns The linked event.
 */
function buildLinkedEvtMatin(): CalendarEvent {
  const evtMatin: CalendarEvent = buildEvtMatin();
  return { ...evtMatin, note: NOTE_QUESTIONS };
}

/**
 * Builds `evt-midi` of D5: « Déjeuner », a start at 12:30 and no end, unlinked.
 * @returns The event.
 */
function buildEvtMidi(): CalendarEvent {
  return {
    id: 'evt-midi',
    title: 'Déjeuner',
    date: POPUP_DATE,
    start_time: '12:30',
    end_time: '',
    note: null,
  };
}

/**
 * Builds `evt-journee` of D5: « Congé », with no time at all, unlinked.
 * @returns The event.
 */
function buildEvtJournee(): CalendarEvent {
  return {
    id: 'evt-journee',
    title: 'Congé',
    date: POPUP_DATE,
    start_time: '',
    end_time: '',
    note: null,
  };
}

/**
 * The test host of `D12`: it binds the four inputs of the item to signals a case drives, and
 * records each emission of the seven outputs, in the order they arrive.
 */
@Component({
  imports: [CalendarEventItem],
  template: `
    <app-calendar-event-item
      [event]="event()"
      [isEditing]="isEditing()"
      [showDate]="showDate()"
      [issues]="issues()"
      (entryOpenRequested)="recordEntryOpenRequest()"
      (entryValidated)="recordValidatedEntry($event)"
      (entryCancelled)="recordEntryCancellation()"
      (noteRequested)="recordNoteRequest()"
      (noteRemoved)="recordNoteRemoval()"
      (noteOpenRequested)="recordNoteOpenRequest($event)"
      (removeRequested)="recordRemoveRequest()"
    />
  `,
})
class CalendarEventItemHost {
  /** The event handed to the item. */
  readonly event: WritableSignal<CalendarEvent> = signal<CalendarEvent>(buildEvtMidi());
  /** Whether the item is under entry. */
  readonly isEditing: WritableSignal<boolean> = signal<boolean>(false);
  /** Whether the item shows the date of its event. */
  readonly showDate: WritableSignal<boolean> = signal<boolean>(false);
  /** The problems the popup hands the item under entry. */
  readonly issues: WritableSignal<EventIssue[]> = signal<EventIssue[]>([]);

  /** Number of `entryOpenRequested` emissions. */
  entryOpenRequestCount: number = 0;
  /** Every entry emitted by `entryValidated`. */
  readonly validatedEntries: EventEntry[] = [];
  /** Number of `entryCancelled` emissions. */
  entryCancellationCount: number = 0;
  /** Number of `noteRequested` emissions. */
  noteRequestCount: number = 0;
  /** Number of `noteRemoved` emissions. */
  noteRemovalCount: number = 0;
  /** Every note identifier emitted by `noteOpenRequested`. */
  readonly noteOpenRequests: string[] = [];
  /** Number of `removeRequested` emissions. */
  removeRequestCount: number = 0;

  /** Records an `entryOpenRequested` emission. */
  recordEntryOpenRequest(): void {
    this.entryOpenRequestCount = this.entryOpenRequestCount + 1;
  }

  /**
   * Records an `entryValidated` emission.
   * @param entry The entry emitted.
   */
  recordValidatedEntry(entry: EventEntry): void {
    this.validatedEntries.push(entry);
  }

  /** Records an `entryCancelled` emission. */
  recordEntryCancellation(): void {
    this.entryCancellationCount = this.entryCancellationCount + 1;
  }

  /** Records a `noteRequested` emission. */
  recordNoteRequest(): void {
    this.noteRequestCount = this.noteRequestCount + 1;
  }

  /** Records a `noteRemoved` emission. */
  recordNoteRemoval(): void {
    this.noteRemovalCount = this.noteRemovalCount + 1;
  }

  /**
   * Records a `noteOpenRequested` emission.
   * @param noteId The note identifier emitted.
   */
  recordNoteOpenRequest(noteId: string): void {
    this.noteOpenRequests.push(noteId);
  }

  /** Records a `removeRequested` emission. */
  recordRemoveRequest(): void {
    this.removeRequestCount = this.removeRequestCount + 1;
  }
}

/** The state an item is mounted in; an omitted flag is `false`. */
interface ItemMountOptions {
  readonly isEditing?: boolean;
  readonly showDate?: boolean;
}

describe('CalendarEventItem (un événement de la popup)', () => {
  let fixture: ComponentFixture<CalendarEventItemHost>;
  let host: CalendarEventItemHost;
  let el: HTMLElement;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Triggers a render, lets the component settle, then refreshes the DOM. */
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Mounts the host on an event, in the requested state, with no problem, and renders it.
   * @param event The event handed to the item.
   * @param options Whether the item is under entry, and whether it shows its date.
   */
  async function mountItem(event: CalendarEvent, options: ItemMountOptions = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [CalendarEventItemHost],
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarEventItemHost);
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;

    const isEditing: boolean = options.isEditing ?? false;
    const showDate: boolean = options.showDate ?? false;
    host.event.set(event);
    host.isEditing.set(isEditing);
    host.showDate.set(showDate);
    await render();
  }

  /**
   * Hands the item a new list of problems, the way the popup does after refusing an entry, then
   * refreshes the DOM.
   * @param issues The problems handed to the item.
   */
  async function receiveIssues(issues: EventIssue[]): Promise<void> {
    host.issues.set(issues);
    await render();
  }

  /**
   * Reads the text of an element, ignoring how the template lays it out: non-breaking spaces
   * become plain ones, and runs of whitespace collapse to a single space.
   * @param element The element read, or `null`.
   * @returns The normalized text, trimmed, or an empty string when the element is absent.
   */
  function normalizedTextOfElement(element: Element | null): string {
    const raw: string = element?.textContent ?? '';
    const withPlainSpaces: string = raw.replace(/ /g, ' ');
    const collapsed: string = withPlainSpaces.replace(/\s+/g, ' ');
    return collapsed.trim();
  }

  /**
   * Reads the normalized text of the first element matching a selector.
   * @param selector The CSS selector looked up in the item.
   * @returns The normalized text, or an empty string when the element is absent.
   */
  function normalizedTextOf(selector: string): string {
    const found: Element | null = el.querySelector(selector);
    return normalizedTextOfElement(found);
  }

  /**
   * Says whether an element of the item matches a selector.
   * @param selector The CSS selector looked up in the item.
   * @returns `true` when at least one element matches.
   */
  function isShown(selector: string): boolean {
    const found: Element | null = el.querySelector(selector);
    return found !== null;
  }

  /**
   * Reads the accessible label of an element.
   * @param selector The CSS selector of the element.
   * @returns Its `aria-label`, or an empty string when the element or the label is absent.
   */
  function ariaLabelOf(selector: string): string {
    const found: Element | null = el.querySelector(selector);
    const label: string | null | undefined = found?.getAttribute('aria-label');
    return label ?? '';
  }

  /**
   * Gives a field of the entry form.
   * @param selector The CSS selector of the field.
   * @returns The field.
   * @throws When no field matches, which would signal that the entry is not open.
   */
  function entryField(selector: string): HTMLInputElement {
    const field: HTMLInputElement | null = el.querySelector<HTMLInputElement>(selector);
    if (field === null) {
      throw new Error(`Aucun champ « ${selector} » dans la saisie.`);
    }
    return field;
  }

  /**
   * Reads the current value of a field of the entry form.
   * @param selector The CSS selector of the field.
   * @returns The value the field holds.
   */
  function entryValueOf(selector: string): string {
    const field: HTMLInputElement = entryField(selector);
    return field.value;
  }

  /**
   * Types a value into a field of the entry form, the way the user would: the value changes, then
   * `input` fires while typing and `change` once the field is left. Both are fired, so the
   * template is free to bind either.
   * @param selector The CSS selector of the field.
   * @param value The value typed, kept as is — surrounding spaces included.
   */
  async function typeInto(selector: string, value: string): Promise<void> {
    const field: HTMLInputElement = entryField(selector);
    field.value = value;
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * Clicks an element of the item, then waits for it to finish updating.
   * @param selector The CSS selector of the element to click.
   * @throws When no element matches, which would signal an unexpected template.
   */
  async function clickOn(selector: string): Promise<void> {
    const target: HTMLElement | null = el.querySelector<HTMLElement>(selector);
    if (target === null) {
      throw new Error(`Aucun élément « ${selector} » à cliquer.`);
    }
    target.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  // ---------------------------------------------------------------------------
  // Groupe 8 — CalendarEventItem : au repos
  // ---------------------------------------------------------------------------
  describe('au repos', () => {
    it('T8.1 affiche en entier un texte de 120 caractères dans .event-title', async () => {
      const evtMidi: CalendarEvent = buildEvtMidi();
      const longEvent: CalendarEvent = { ...evtMidi, title: LONG_TITLE };
      await mountItem(longEvent);

      const displayedTitle: string = normalizedTextOf('.event-title');

      expect(displayedTitle).toBe(LONG_TITLE);
    });

    it('T8.2 affiche « 12:30 » dans .event-time pour evt-midi, qui n’a qu’un début', async () => {
      const evtMidi: CalendarEvent = buildEvtMidi();
      await mountItem(evtMidi);

      const displayedTime: string = normalizedTextOf('.event-time');

      expect(displayedTime).toBe('12:30');
    });

    it('T8.3 affiche « 09:00 – 10:30 » dans .event-time pour evt-matin, qui a un début et une fin', async () => {
      const evtMatin: CalendarEvent = buildEvtMatin();
      await mountItem(evtMatin);

      const displayedTime: string = normalizedTextOf('.event-time');

      expect(displayedTime).toBe('09:00 – 10:30');
    });

    it('T8.4 n’affiche aucun .event-time pour evt-journee, qui n’a aucune heure', async () => {
      const evtJournee: CalendarEvent = buildEvtJournee();
      await mountItem(evtJournee);

      const timeShown: boolean = isShown('.event-time');

      expect(timeShown).toBe(false);
    });

    it('T8.5 affiche « 20/11/2026 » dans .event-date pour evt-matin daté du 2026-11-20, showDate vrai', async () => {
      const evtMatin: CalendarEvent = buildEvtMatin();
      const movedEvent: CalendarEvent = { ...evtMatin, date: '2026-11-20' };
      await mountItem(movedEvent, { showDate: true });

      const displayedDate: string = normalizedTextOf('.event-date');

      expect(displayedDate).toBe('20/11/2026');
    });

    it('T8.6 n’affiche aucun .event-date pour evt-matin, showDate faux', async () => {
      const evtMatin: CalendarEvent = buildEvtMatin();
      await mountItem(evtMatin, { showDate: false });

      const dateShown: boolean = isShown('.event-date');

      expect(dateShown).toBe(false);
    });

    it('T8.7 affiche le titre de la note liée et « Retirer la note », sans « Lier une note »', async () => {
      const linkedEvtMatin: CalendarEvent = buildLinkedEvtMatin();
      await mountItem(linkedEvtMatin);

      const displayedNoteTitle: string = normalizedTextOf('.event-note-title');
      const removeNoteShown: boolean = isShown('.btn-remove-note');
      const linkNoteShown: boolean = isShown('.btn-link-note');

      expect(displayedNoteTitle).toBe('Questions à poser');
      expect(removeNoteShown).toBe(true);
      expect(linkNoteShown).toBe(false);
    });

    it('T8.8 affiche « Lier une note » sans titre de note ni « Retirer la note » pour evt-midi sans note', async () => {
      const evtMidi: CalendarEvent = buildEvtMidi();
      await mountItem(evtMidi);

      const linkNoteShown: boolean = isShown('.btn-link-note');
      const noteTitleShown: boolean = isShown('.event-note-title');
      const removeNoteShown: boolean = isShown('.btn-remove-note');

      expect(linkNoteShown).toBe(true);
      expect(noteTitleShown).toBe(false);
      expect(removeNoteShown).toBe(false);
    });

    it('T8.9 émet entryOpenRequested une fois quand on touche .event-body', async () => {
      const evtMidi: CalendarEvent = buildEvtMidi();
      await mountItem(evtMidi);

      await clickOn('.event-body');

      expect(host.entryOpenRequestCount).toBe(1);
    });

    it('T8.10 émet removeRequested une fois à la corbeille, et l’item est toujours affiché', async () => {
      const evtMidi: CalendarEvent = buildEvtMidi();
      await mountItem(evtMidi);

      await clickOn('.btn-remove-event');

      const itemShown: boolean = isShown('.event-item');
      const displayedTitle: string = normalizedTextOf('.event-title');

      expect(host.removeRequestCount).toBe(1);
      expect(itemShown).toBe(true);
      expect(displayedTitle).toBe('Déjeuner');
    });

    it('T8.11 émet noteOpenRequested avec « note-questions » quand on touche .event-note-title', async () => {
      const linkedEvtMatin: CalendarEvent = buildLinkedEvtMatin();
      await mountItem(linkedEvtMatin);

      await clickOn('.event-note-title');

      expect(host.noteOpenRequests).toEqual(['note-questions']);
    });

    it('T8.12 émet noteRequested une fois quand on touche .btn-link-note sur evt-midi sans note', async () => {
      const evtMidi: CalendarEvent = buildEvtMidi();
      await mountItem(evtMidi);

      await clickOn('.btn-link-note');

      expect(host.noteRequestCount).toBe(1);
    });

    it('T8.13 émet noteRemoved une fois quand on touche .btn-remove-note sur evt-matin lié à note-questions', async () => {
      const linkedEvtMatin: CalendarEvent = buildLinkedEvtMatin();
      await mountItem(linkedEvtMatin);

      await clickOn('.btn-remove-note');

      expect(host.noteRemovalCount).toBe(1);
    });

    it('T8.14 donne à .btn-remove-event, .btn-remove-note et .event-body un aria-label qui nomme « Réunion parents-profs »', async () => {
      const linkedEvtMatin: CalendarEvent = buildLinkedEvtMatin();
      await mountItem(linkedEvtMatin);

      const removeEventLabel: string = ariaLabelOf('.btn-remove-event');
      const removeNoteLabel: string = ariaLabelOf('.btn-remove-note');
      const bodyLabel: string = ariaLabelOf('.event-body');

      expect(removeEventLabel).toContain('Réunion parents-profs');
      expect(removeNoteLabel).toContain('Réunion parents-profs');
      expect(bodyLabel).toContain('Réunion parents-profs');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 9 — CalendarEventItem : en saisie
  // ---------------------------------------------------------------------------
  describe('en saisie', () => {
    it('T9.1 pré-remplit les champs avec le texte, la date et les heures de evt-matin', async () => {
      const evtMatin: CalendarEvent = buildEvtMatin();
      await mountItem(evtMatin, { isEditing: true });

      const typedTitle: string = entryValueOf('.event-entry-title');
      const typedDate: string = entryValueOf('.event-entry-date');
      const typedStart: string = entryValueOf('.event-entry-start');
      const typedEnd: string = entryValueOf('.event-entry-end');

      expect(typedTitle).toBe('Réunion parents-profs');
      expect(typedDate).toBe('2026-11-19');
      expect(typedStart).toBe('09:00');
      expect(typedEnd).toBe('10:30');
    });

    it('T9.2 laisse vides les champs de début et de fin pour evt-journee, qui n’a aucune heure', async () => {
      const evtJournee: CalendarEvent = buildEvtJournee();
      await mountItem(evtJournee, { isEditing: true });

      const typedStart: string = entryValueOf('.event-entry-start');
      const typedEnd: string = entryValueOf('.event-entry-end');

      expect(typedStart).toBe('');
      expect(typedEnd).toBe('');
    });

    it('T9.3 émet à ✓ la saisie telle que tapée, espaces compris, sans la nettoyer', async () => {
      const evtMatin: CalendarEvent = buildEvtMatin();
      await mountItem(evtMatin, { isEditing: true });

      await typeInto('.event-entry-title', '  Réunion  ');
      await typeInto('.event-entry-start', '11:00');
      await clickOn('.btn-entry-confirm');

      const expectedEntry: EventEntry = {
        title: '  Réunion  ',
        date: '2026-11-19',
        startTime: '11:00',
        endTime: '10:30',
      };

      expect(host.validatedEntries).toEqual([expectedEntry]);
    });

    it('T9.4 émet entryCancelled à ✗ après un texte tapé, et n’émet pas entryValidated', async () => {
      const evtMatin: CalendarEvent = buildEvtMatin();
      await mountItem(evtMatin, { isEditing: true });

      await typeInto('.event-entry-title', 'Réunion annulée');
      await clickOn('.btn-entry-cancel');

      expect(host.entryCancellationCount).toBe(1);
      expect(host.validatedEntries).toEqual([]);
    });

    it('T9.5 affiche un .event-issue[role="alert"] par problème reçu, avec le message lisible de D6', async () => {
      const evtMatin: CalendarEvent = buildEvtMatin();
      await mountItem(evtMatin, { isEditing: true });

      await receiveIssues(['TEXT_REQUIRED', 'END_WITHOUT_START']);

      const alertElements: Element[] = Array.from(el.querySelectorAll('.event-issue[role="alert"]'));
      const displayedMessages: string[] = alertElements.map((alertElement: Element): string =>
        normalizedTextOfElement(alertElement),
      );
      const expectedMessages: string[] = [
        ISSUE_MESSAGES.TEXT_REQUIRED,
        ISSUE_MESSAGES.END_WITHOUT_START,
      ];

      expect(displayedMessages).toEqual(expectedMessages);
    });

    it('T9.6 garde « Piscine » et 18:00 tapés quand l’item reçoit ensuite END_NOT_AFTER_START', async () => {
      const evtMatin: CalendarEvent = buildEvtMatin();
      await mountItem(evtMatin, { isEditing: true });

      await typeInto('.event-entry-title', 'Piscine');
      await typeInto('.event-entry-start', '18:00');
      await receiveIssues(['END_NOT_AFTER_START']);

      const typedTitle: string = entryValueOf('.event-entry-title');
      const typedStart: string = entryValueOf('.event-entry-start');

      expect(typedTitle).toBe('Piscine');
      expect(typedStart).toBe('18:00');
    });

    it('T9.7 garde « Lier une note » disponible en saisie sur evt-midi sans note', async () => {
      const evtMidi: CalendarEvent = buildEvtMidi();
      await mountItem(evtMidi, { isEditing: true });

      const linkNoteShown: boolean = isShown('.btn-link-note');

      expect(linkNoteShown).toBe(true);
    });

    it('T9.8 garde « Retirer la note » en saisie sur evt-matin lié à une note, sans « Lier une note »', async () => {
      const linkedEvtMatin: CalendarEvent = buildLinkedEvtMatin();
      await mountItem(linkedEvtMatin, { isEditing: true });

      const removeNoteShown: boolean = isShown('.btn-remove-note');
      const linkNoteShown: boolean = isShown('.btn-link-note');

      expect(removeNoteShown).toBe(true);
      expect(linkNoteShown).toBe(false);
    });
  });
});
