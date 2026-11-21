import { Component, DebugElement, LOCALE_ID, signal, WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { Mock, vi } from 'vitest';

import { CalendarEventPanels } from './calendar-event-panels';
import { CalendarEventItem } from '../calendar-event-item/calendar-event-item';
import { CalendarEvent } from '../../core/models/calendar-event.model';
import { EventChangeSet } from '../../core/models/calendar-event-composition.model';
import { Note } from '../../core/models/note.model';
import { CalendarService } from '../../core/services/calendar/calendar-service';
import { NotesService } from '../../core/services/notes/notes-service';

/**
 * @file calendar-event-panels.spec.ts
 * @description Black-box TDD tests for `CalendarEventPanels`, the popup that composes the events
 * of one date and saves them at once.
 *
 * Source: `.agent/CALENDAR/EVENT/PLAN_TESTS_CALENDAR_EVENT.md` §7, groups 10 to 14 (cases `T10.1`
 * → `T14.9`, effects `E90` → `E120`, causes `C90` → `C122`), and its DOM contract §9.2.
 * Development approach: the same folder's `APPROCHE_CALENDAR_EVENT.md`, batch F (`D-EV19` →
 * `D-EV26`).
 *
 * The popup is a stateful component (`D-EV23`): it reads the events of its date when it opens,
 * holds the composition, validates the entries, hosts `NotePicker` and two `ConfirmDialog`, and
 * writes nothing before « Enregistrer ». Following `D10` and `D11`, it is mounted inside a test
 * host that binds `[date]` and `[(open)]` and counts `(saved)`; the real `CalendarEventItem`,
 * `NotePicker` and `ConfirmDialog` are mounted and driven through the DOM.
 *
 * Doubles (`D10`, plan §8):
 *   - `CalendarService`: `getEventsFromDate` and `saveEventChanges`, whose promises a case resolves,
 *     rejects, or leaves pending through a {@link Deferred};
 *   - `Router`: `navigate`, spied (`E119`, `E120`);
 *   - `NotesService`: `getAllNotes`, read by the real `NotePicker`.
 *
 * Frozen decisions the cases rely on:
 *   D5 — the reference data: popup date `2026-11-19`; `evt-matin` « Réunion parents-profs »
 *        09:00–10:30, `evt-midi` « Déjeuner » 12:30, `evt-journee` « Congé » with no time; notes
 *        `note-questions` « Questions à poser » and `note-courses` « Courses ».
 *   D6 — the message of `TEXT_REQUIRED`, read by T11.7.
 *   D7 — a date shown by an item reads `21/11/2026` (T11.9).
 *   D8 — the header reads the date through `DatePipe`, `EEEE d MMMM y`, locale `fr-FR`.
 *   D9 — an open entry counts as a pending change (T14.3).
 *   D13 — the draft identifier comes from an untouched `crypto.randomUUID()`: the draft is found
 *         by its position (last item) and its state (under entry), and T13.3 matches its
 *         identifier with `expect.any(String)`.
 *
 * Choices made here, where the plan leaves the test free; they are the ones to raise into the plan:
 *   - **D-PAN1** — the popup is « closed » when the host's `open` signal is `false` **and** no
 *     `.event-panels` is rendered; « open » is the reverse. Both halves are asserted, since the
 *     two-way binding of `open` is the contract `Calendar` relies on (lot G).
 *   - **D-PAN2** — an item is designated by the text it shows at rest (`.event-title`); the item
 *     under entry, which shows no `.event-title`, is the single item holding an `.event-entry`.
 *   - **D-PAN3** — the two `ConfirmDialog` instances are told apart by the text of their
 *     `.confirm-message` (§9.2), and answered through the `.btn-confirm` / `.btn-cancel` of the
 *     dialog holding that text.
 *   - **D-PAN4** — T12.6 cannot be reached through the DOM: a draft is under entry from its
 *     creation, the trash of an item exists only at rest (§9.1), and an empty text can never be
 *     validated. The case therefore emits `removeRequested` from the draft's real item, which is
 *     the very request the trash would send. To raise into the plan: either the trash stays
 *     available under entry, or the « Nouvel événement » branch of E107 is unreachable.
 *   - **D-PAN5** — the changeSet of T13.3 is compared regardless of the order of
 *     `upsertedEvents`, which the plan does not freeze.
 *   - **D-PAN6** — moving `evt-matin` to 14:00 (T11.6) also moves its end to 15:00: keeping its
 *     10:30 end would make the entry invalid (`END_NOT_AFTER_START`).
 */

/** The date the popup is opened on in every case but T10.2 (D5). */
const POPUP_DATE: string = '2026-11-19';

/** The message of the abandon confirmation (§9.2). */
const LEAVE_MESSAGE: string = 'Des modifications ne sont pas enregistrées. Les abandonner ?';

/** The message of `TEXT_REQUIRED` (D6). */
const TEXT_REQUIRED_MESSAGE: string = 'Le texte de l\'événement est obligatoire.';

/** The note `evt-matin` is linked to when a case needs a linked event (D5). */
const NOTE_QUESTIONS: Note = {
  id: 'note-questions',
  title: 'Questions à poser',
  category: null,
  blocks: [],
  updatedAt: '2026-11-15T08:00:00.000Z',
};

/** The note chosen in the picker (D5). */
const NOTE_COURSES: Note = {
  id: 'note-courses',
  title: 'Courses',
  category: null,
  blocks: [],
  updatedAt: '2026-11-16T08:00:00.000Z',
};

/**
 * A promise a case settles by hand: resolved, rejected, or left pending, so that a loading or a
 * saving state can be observed while it lasts (D10).
 */
interface Deferred<T> {
  /** The promise handed to the popup. */
  readonly promise: Promise<T>;
  /** Resolves the promise with a value. */
  readonly resolve: (value: T) => void;
  /** Rejects the promise with a reason. */
  readonly reject: (reason: unknown) => void;
}

/**
 * Creates a promise to settle by hand.
 * @returns The promise and the two functions that settle it.
 */
function createDeferred<T>(): Deferred<T> {
  let resolvePromise: (value: T) => void = (): void => undefined;
  let rejectPromise: (reason: unknown) => void = (): void => undefined;
  const promise: Promise<T> = new Promise<T>((resolve: (value: T) => void, reject: (reason: unknown) => void): void => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

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
 * Builds an extra event of the popup date, for the five events of T10.4.
 * @param id The identifier of the event.
 * @param title Its text.
 * @param startTime Its start time, `HH:mm`.
 * @returns The event, with no end and no note.
 */
function buildExtraEvent(id: string, title: string, startTime: string): CalendarEvent {
  return {
    id,
    title,
    date: POPUP_DATE,
    start_time: startTime,
    end_time: '',
    note: null,
  };
}

/**
 * The read most cases start from: `evt-matin` and `evt-midi`, already in their sorted order.
 * @returns Fresh events.
 */
function buildMorningAndLunch(): CalendarEvent[] {
  const evtMatin: CalendarEvent = buildEvtMatin();
  const evtMidi: CalendarEvent = buildEvtMidi();
  return [evtMatin, evtMidi];
}

/**
 * The read of T12.2 and group 14's note cases: `evt-matin` linked to `note-questions`, and
 * `evt-midi`.
 * @returns Fresh events.
 */
function buildLinkedMorningAndLunch(): CalendarEvent[] {
  const linkedEvtMatin: CalendarEvent = buildLinkedEvtMatin();
  const evtMidi: CalendarEvent = buildEvtMidi();
  return [linkedEvtMatin, evtMidi];
}

/**
 * The read of T13.3: `evt-matin`, `evt-midi` and `evt-journee`.
 * @returns Fresh events.
 */
function buildWholeDay(): CalendarEvent[] {
  const evtMatin: CalendarEvent = buildEvtMatin();
  const evtMidi: CalendarEvent = buildEvtMidi();
  const evtJournee: CalendarEvent = buildEvtJournee();
  return [evtMatin, evtMidi, evtJournee];
}

/**
 * The test host of `D10`: it binds the date and the visibility of the popup to signals a case
 * drives, and counts the `saved` emissions.
 */
@Component({
  imports: [CalendarEventPanels],
  template: `
    <app-calendar-event-panels
      [date]="date()"
      [(open)]="open"
      (saved)="recordSave()"
    />
  `,
})
class CalendarEventPanelsHost {
  /** The date the popup is opened on. */
  readonly date: WritableSignal<string> = signal<string>(POPUP_DATE);
  /** The visibility of the popup, bound both ways. */
  readonly open: WritableSignal<boolean> = signal<boolean>(false);
  /** Number of `saved` emissions. */
  saveCount: number = 0;

  /** Records a `saved` emission. */
  recordSave(): void {
    this.saveCount = this.saveCount + 1;
  }
}

describe('CalendarEventPanels (la popup des événements d’une date)', () => {
  let fixture: ComponentFixture<CalendarEventPanelsHost>;
  let host: CalendarEventPanelsHost;
  let el: HTMLElement;
  let calendarServiceDouble: { getEventsFromDate: Mock; saveEventChanges: Mock };
  let notesServiceDouble: { getAllNotes: Mock };
  let routerDouble: { navigate: Mock };

  beforeEach(async () => {
    registerLocaleData(localeFr);

    calendarServiceDouble = {
      getEventsFromDate: vi.fn().mockResolvedValue([]),
      saveEventChanges: vi.fn().mockResolvedValue(undefined),
    };
    notesServiceDouble = { getAllNotes: vi.fn().mockResolvedValue([NOTE_QUESTIONS, NOTE_COURSES]) };
    routerDouble = { navigate: vi.fn().mockResolvedValue(true) };

    await TestBed.configureTestingModule({
      imports: [CalendarEventPanelsHost],
      providers: [
        { provide: CalendarService, useValue: calendarServiceDouble },
        { provide: NotesService, useValue: notesServiceDouble },
        { provide: Router, useValue: routerDouble },
        { provide: LOCALE_ID, useValue: 'fr-FR' },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarEventPanelsHost);
    host = fixture.componentInstance;
    el = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Waits for the next macrotask, by which time every promise already settled has run its
   * continuations.
   * @returns A promise resolved on the next macrotask.
   */
  function nextMacrotask(): Promise<void> {
    return new Promise<void>((resolve: () => void): void => {
      setTimeout(resolve, 0);
    });
  }

  /** Triggers a render, lets the popup settle, then refreshes the DOM (D11). */
  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    await nextMacrotask();
    fixture.detectChanges();
  }

  /**
   * Triggers a render while a promise of a double is left pending: the popup cannot become
   * stable, so only the work already possible is flushed before the DOM is refreshed.
   */
  async function renderWhilePending(): Promise<void> {
    fixture.detectChanges();
    await nextMacrotask();
    fixture.detectChanges();
  }

  /**
   * Seeds what every read of the events answers. A builder rather than a list: each read gets
   * fresh events, as a real read of the base would.
   * @param buildStoredEvents Builds the events the read answers with.
   */
  function givenStoredEvents(buildStoredEvents: () => CalendarEvent[]): void {
    calendarServiceDouble.getEventsFromDate.mockImplementation(
      async (): Promise<CalendarEvent[]> => buildStoredEvents(),
    );
  }

  /**
   * Opens the popup on a date, the way `Calendar` does, and lets the read answer (D11).
   * @param date The date the popup is opened on.
   */
  async function openPopup(date: string = POPUP_DATE): Promise<void> {
    host.date.set(date);
    host.open.set(true);
    await render();
  }

  /**
   * Opens the popup on the reference date over a read of stored events.
   * @param buildStoredEvents Builds the events the read answers with.
   */
  async function openPopupOn(buildStoredEvents: () => CalendarEvent[]): Promise<void> {
    givenStoredEvents(buildStoredEvents);
    await openPopup();
  }

  /**
   * Reads the text of an element, ignoring how the template lays it out: non-breaking spaces
   * become plain ones, and runs of whitespace collapse to a single space.
   * @param element The element read, or `null`.
   * @returns The normalized text, trimmed, or an empty string when the element is absent.
   */
  function normalizedTextOfElement(element: Element | null): string {
    const raw: string = element?.textContent ?? '';
    const withPlainSpaces: string = raw.replace(/[  ]/g, ' ');
    const collapsed: string = withPlainSpaces.replace(/\s+/g, ' ');
    return collapsed.trim();
  }

  /**
   * Reads the normalized text of the first element of the popup matching a selector.
   * @param selector The CSS selector.
   * @returns The normalized text, or an empty string when the element is absent.
   */
  function normalizedTextOf(selector: string): string {
    const found: Element | null = el.querySelector(selector);
    return normalizedTextOfElement(found);
  }

  /**
   * Says whether an element of the popup matches a selector.
   * @param selector The CSS selector.
   * @returns `true` when at least one element matches.
   */
  function isShown(selector: string): boolean {
    const found: Element | null = el.querySelector(selector);
    return found !== null;
  }

  /**
   * Says whether the popup is open, in the sense of D-PAN1.
   * @returns `true` when the host's `open` is `true` and the panel is rendered.
   */
  function isPopupOpen(): boolean {
    const boundOpen: boolean = host.open();
    const panelShown: boolean = isShown('.event-panels');
    return boundOpen && panelShown;
  }

  /**
   * Says whether the popup is closed, in the sense of D-PAN1.
   * @returns `true` when the host's `open` is `false` and no panel is rendered.
   */
  function isPopupClosed(): boolean {
    const boundOpen: boolean = host.open();
    const panelShown: boolean = isShown('.event-panels');
    return !boundOpen && !panelShown;
  }

  /**
   * Gives every event item of the popup, in display order.
   * @returns The host elements of the items.
   */
  function eventItems(): HTMLElement[] {
    const found: NodeListOf<HTMLElement> = el.querySelectorAll<HTMLElement>('app-calendar-event-item');
    return Array.from(found);
  }

  /**
   * Reads the text an item shows at rest.
   * @param item The host element of the item.
   * @returns Its normalized `.event-title`, or an empty string under entry.
   */
  function titleOfItem(item: HTMLElement): string {
    const titleElement: Element | null = item.querySelector('.event-title');
    return normalizedTextOfElement(titleElement);
  }

  /**
   * Reads the texts the items show at rest, in display order (D-PAN2).
   * @returns One text per item, empty for an item under entry.
   */
  function displayedTitles(): string[] {
    const items: HTMLElement[] = eventItems();
    return items.map((item: HTMLElement): string => titleOfItem(item));
  }

  /**
   * Finds the item showing a text at rest (D-PAN2).
   * @param title The text looked for.
   * @returns The host element of the item, or `null` when no item shows that text.
   */
  function findItemTitled(title: string): HTMLElement | null {
    const items: HTMLElement[] = eventItems();
    const found: HTMLElement | undefined = items.find(
      (item: HTMLElement): boolean => titleOfItem(item) === title,
    );
    return found ?? null;
  }

  /**
   * Gives the item showing a text at rest.
   * @param title The text looked for.
   * @returns The host element of the item.
   * @throws When no item shows that text.
   */
  function itemTitled(title: string): HTMLElement {
    const found: HTMLElement | null = findItemTitled(title);
    if (found === null) {
      throw new Error(`Aucun événement « ${title} » affiché.`);
    }
    return found;
  }

  /**
   * Gives the items holding an entry form.
   * @returns The host elements of the items under entry.
   */
  function itemsUnderEntry(): HTMLElement[] {
    const items: HTMLElement[] = eventItems();
    return items.filter((item: HTMLElement): boolean => item.querySelector('.event-entry') !== null);
  }

  /**
   * Gives the single item under entry (D-PAN2).
   * @returns The host element of the item.
   * @throws When no item is under entry, or more than one.
   */
  function itemUnderEntry(): HTMLElement {
    const editingItems: HTMLElement[] = itemsUnderEntry();
    if (editingItems.length !== 1) {
      throw new Error(`${editingItems.length} saisie(s) ouverte(s), une seule attendue.`);
    }
    return editingItems[0];
  }

  /**
   * Gives a field of the entry under way.
   * @param selector The CSS selector of the field, inside the item under entry.
   * @returns The field.
   * @throws When the field is missing.
   */
  function entryField(selector: string): HTMLInputElement {
    const editingItem: HTMLElement = itemUnderEntry();
    const field: HTMLInputElement | null = editingItem.querySelector<HTMLInputElement>(selector);
    if (field === null) {
      throw new Error(`Aucun champ « ${selector} » dans la saisie.`);
    }
    return field;
  }

  /**
   * Reads a field of the entry under way.
   * @param selector The CSS selector of the field.
   * @returns The value the field holds.
   */
  function entryValueOf(selector: string): string {
    const field: HTMLInputElement = entryField(selector);
    return field.value;
  }

  /**
   * Clicks an element and lets the popup settle.
   * @param target The element clicked.
   */
  async function clickElement(target: HTMLElement): Promise<void> {
    target.click();
    await render();
  }

  /**
   * Clicks an element found inside a container.
   * @param container The element searched.
   * @param selector The CSS selector of the element to click.
   * @throws When no element matches.
   */
  async function clickWithin(container: HTMLElement, selector: string): Promise<void> {
    const target: HTMLElement | null = container.querySelector<HTMLElement>(selector);
    if (target === null) {
      throw new Error(`Aucun élément « ${selector} » à cliquer.`);
    }
    await clickElement(target);
  }

  /**
   * Clicks an element of the popup.
   * @param selector The CSS selector of the element to click.
   */
  async function clickOn(selector: string): Promise<void> {
    await clickWithin(el, selector);
  }

  /**
   * Types a value into a field of the entry under way, the way the user would: `input` while
   * typing, `change` once the field is left.
   * @param selector The CSS selector of the field.
   * @param value The value typed.
   */
  async function typeInto(selector: string, value: string): Promise<void> {
    const field: HTMLInputElement = entryField(selector);
    field.value = value;
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new Event('change'));
    await render();
  }

  /**
   * Opens the entry of the item showing a text, by touching its body.
   * @param title The text of the item.
   */
  async function openEntryOf(title: string): Promise<void> {
    const item: HTMLElement = itemTitled(title);
    await clickWithin(item, '.event-body');
  }

  /** Touches ✓ on the entry under way. */
  async function confirmEntry(): Promise<void> {
    const editingItem: HTMLElement = itemUnderEntry();
    await clickWithin(editingItem, '.btn-entry-confirm');
  }

  /** Touches ✗ on the entry under way. */
  async function cancelEntry(): Promise<void> {
    const editingItem: HTMLElement = itemUnderEntry();
    await clickWithin(editingItem, '.btn-entry-cancel');
  }

  /** Touches « Ajouter un événement ». */
  async function addEvent(): Promise<void> {
    await clickOn('.btn-add-event');
  }

  /**
   * Adds an event and validates it with a text and a start time.
   * @param title The text typed.
   * @param startTime The start time typed.
   */
  async function addAndValidateEvent(title: string, startTime: string): Promise<void> {
    await addEvent();
    await typeInto('.event-entry-title', title);
    await typeInto('.event-entry-start', startTime);
    await confirmEntry();
  }

  /**
   * Retypes the text of an event and validates the entry.
   * @param currentTitle The text the event shows.
   * @param newTitle The text typed instead.
   */
  async function retitleEvent(currentTitle: string, newTitle: string): Promise<void> {
    await openEntryOf(currentTitle);
    await typeInto('.event-entry-title', newTitle);
    await confirmEntry();
  }

  /**
   * Reads the messages of the confirmations currently shown.
   * @returns One normalized message per open `ConfirmDialog`.
   */
  function confirmMessages(): string[] {
    const found: NodeListOf<Element> = el.querySelectorAll('.confirm-message');
    const messageElements: Element[] = Array.from(found);
    return messageElements.map((messageElement: Element): string => normalizedTextOfElement(messageElement));
  }

  /**
   * Answers the confirmation showing a message (D-PAN3).
   * @param message The message of the confirmation.
   * @param accepted `true` to answer « Oui », `false` to answer « Non ».
   * @throws When no confirmation shows that message.
   */
  async function answerConfirmation(message: string, accepted: boolean): Promise<void> {
    const found: NodeListOf<HTMLElement> = el.querySelectorAll<HTMLElement>('app-confirm-dialog');
    const dialogs: HTMLElement[] = Array.from(found);
    const matchingDialog: HTMLElement | undefined = dialogs.find((dialog: HTMLElement): boolean => {
      const messageElement: Element | null = dialog.querySelector('.confirm-message');
      return normalizedTextOfElement(messageElement) === message;
    });
    if (matchingDialog === undefined) {
      throw new Error(`Aucune confirmation « ${message} » affichée.`);
    }
    const answerSelector: string = accepted ? '.btn-confirm' : '.btn-cancel';
    await clickWithin(matchingDialog, answerSelector);
  }

  /**
   * Builds the message of the removal confirmation of an event (§9.2).
   * @param title The text the confirmation names.
   * @returns The message.
   */
  function removalMessageOf(title: string): string {
    return `Supprimer l'événement « ${title} » ?`;
  }

  /**
   * Touches the trash of an event and answers its confirmation.
   * @param title The text of the event.
   * @param accepted Whether the removal is confirmed.
   */
  async function removeEventTitled(title: string, accepted: boolean = true): Promise<void> {
    const item: HTMLElement = itemTitled(title);
    await clickWithin(item, '.btn-remove-event');
    const message: string = removalMessageOf(title);
    await answerConfirmation(message, accepted);
  }

  /**
   * Opens the note picker from an event, and lets the picker read its notes.
   * @param title The text of the event.
   */
  async function openPickerFrom(title: string): Promise<void> {
    const item: HTMLElement = itemTitled(title);
    await clickWithin(item, '.btn-link-note');
  }

  /**
   * Chooses a note in the open picker, by its title.
   * @param noteTitle The title of the note chosen.
   * @throws When the picker lists no note of that title.
   */
  async function chooseNoteInPicker(noteTitle: string): Promise<void> {
    const found: NodeListOf<HTMLElement> = el.querySelectorAll<HTMLElement>('.note-option');
    const options: HTMLElement[] = Array.from(found);
    const matchingOption: HTMLElement | undefined = options.find((option: HTMLElement): boolean => {
      const optionTitle: Element | null = option.querySelector('.note-option-title');
      return normalizedTextOfElement(optionTitle) === noteTitle;
    });
    if (matchingOption === undefined) {
      throw new Error(`Aucune note « ${noteTitle} » dans le picker.`);
    }
    await clickElement(matchingOption);
  }

  /**
   * Reads the title of the note an item shows.
   * @param item The host element of the item.
   * @returns The normalized `.event-note-title`, or an empty string when the item shows no note.
   */
  function noteTitleOfItem(item: HTMLElement): string {
    const noteTitleElement: Element | null = item.querySelector('.event-note-title');
    return normalizedTextOfElement(noteTitleElement);
  }

  /**
   * Says whether an item holds an element.
   * @param item The host element of the item.
   * @param selector The CSS selector looked up in the item.
   * @returns `true` when the item holds a matching element.
   */
  function itemShows(item: HTMLElement, selector: string): boolean {
    const found: Element | null = item.querySelector(selector);
    return found !== null;
  }

  /**
   * Gives the « Enregistrer » button.
   * @returns The button.
   * @throws When the popup offers no « Enregistrer ».
   */
  function saveButton(): HTMLButtonElement {
    const found: HTMLButtonElement | null = el.querySelector<HTMLButtonElement>('.btn-save-events');
    if (found === null) {
      throw new Error('Aucun bouton « Enregistrer » affiché.');
    }
    return found;
  }

  /**
   * Reads the changeSet handed to `saveEventChanges` by one of its calls.
   * @param callIndex The index of the call, from 0.
   * @returns The changeSet received.
   */
  function changeSetOfCall(callIndex: number): EventChangeSet {
    const calls: unknown[][] = calendarServiceDouble.saveEventChanges.mock.calls;
    return calls[callIndex][0] as EventChangeSet;
  }

  /**
   * Gives the real `CalendarEventItem` instances of the popup, in display order.
   * @returns The component instances.
   */
  function itemComponents(): CalendarEventItem[] {
    const itemDebugElements: DebugElement[] = fixture.debugElement.queryAll(By.directive(CalendarEventItem));
    return itemDebugElements.map(
      (itemDebugElement: DebugElement): CalendarEventItem => itemDebugElement.componentInstance as CalendarEventItem,
    );
  }

  // ---------------------------------------------------------------------------
  // Groupe 10 — CalendarEventPanels : ouverture et lecture
  // ---------------------------------------------------------------------------
  describe('ouverture et lecture', () => {
    it('T10.1 affiche « jeudi 19 novembre 2026 » dans .event-panels-title pour la date 2026-11-19', async () => {
      await openPopup('2026-11-19');

      const displayedHeader: string = normalizedTextOf('.event-panels-title');

      expect(displayedHeader).toBe('jeudi 19 novembre 2026');
    });

    it('T10.2 affiche « vendredi 1 janvier 2027 » dans .event-panels-title pour la date 2027-01-01', async () => {
      await openPopup('2027-01-01');

      const displayedHeader: string = normalizedTextOf('.event-panels-title');

      expect(displayedHeader).toBe('vendredi 1 janvier 2027');
    });

    it('T10.3 affiche .event-panels-loading et aucun item tant que la lecture n’a pas répondu', async () => {
      const pendingRead: Deferred<CalendarEvent[]> = createDeferred<CalendarEvent[]>();
      calendarServiceDouble.getEventsFromDate.mockReturnValue(pendingRead.promise);
      host.open.set(true);
      await renderWhilePending();

      const loadingShown: boolean = isShown('.event-panels-loading');
      const items: HTMLElement[] = eventItems();

      expect(loadingShown).toBe(true);
      expect(items).toHaveLength(0);

      pendingRead.resolve([]);
      await render();
    });

    it('T10.4 affiche les 5 événements lus dans le désordre, triés par heure croissante, ceux sans heure en bas', async () => {
      await openPopupOn((): CalendarEvent[] => {
        const evtJournee: CalendarEvent = buildEvtJournee();
        const evtPiscine: CalendarEvent = buildExtraEvent('evt-piscine', 'Piscine', '18:00');
        const evtMatin: CalendarEvent = buildEvtMatin();
        const evtPetitDejeuner: CalendarEvent = buildExtraEvent('evt-petit-dejeuner', 'Petit-déjeuner', '07:30');
        const evtMidi: CalendarEvent = buildEvtMidi();
        return [evtJournee, evtPiscine, evtMatin, evtPetitDejeuner, evtMidi];
      });

      const titles: string[] = displayedTitles();

      expect(titles).toEqual(['Petit-déjeuner', 'Réunion parents-profs', 'Déjeuner', 'Piscine', 'Congé']);
    });

    it('T10.5 affiche « Aucun événement ce jour. » et .btn-add-event quand la lecture rend une liste vide', async () => {
      await openPopupOn((): CalendarEvent[] => []);

      const emptyText: string = normalizedTextOf('.event-panels-empty');
      const addButtonShown: boolean = isShown('.btn-add-event');

      expect(emptyText).toBe('Aucun événement ce jour.');
      expect(addButtonShown).toBe(true);
    });

    it('T10.6 affiche .event-panels-load-error et seulement .btn-close-events quand la lecture échoue', async () => {
      const readFailure: Error = new Error('Erreur lors de la récupération des événements');
      calendarServiceDouble.getEventsFromDate.mockRejectedValue(readFailure);
      await openPopup();

      const loadErrorShown: boolean = isShown('.event-panels-load-error');
      const closeButtonShown: boolean = isShown('.btn-close-events');
      const addButtonShown: boolean = isShown('.btn-add-event');
      const saveButtonShown: boolean = isShown('.btn-save-events');

      expect(loadErrorShown).toBe(true);
      expect(closeButtonShown).toBe(true);
      expect(addButtonShown).toBe(false);
      expect(saveButtonShown).toBe(false);
    });

    it('T10.7 relit la base à la réouverture : evt-midi modifié puis abandonné affiche ses valeurs enregistrées', async () => {
      await openPopupOn(buildMorningAndLunch);
      await retitleEvent('Déjeuner', 'Déjeuner client');
      await clickOn('.btn-close-events');
      await answerConfirmation(LEAVE_MESSAGE, true);
      await openPopup();

      const titles: string[] = displayedTitles();
      const readCount: number = calendarServiceDouble.getEventsFromDate.mock.calls.length;

      expect(titles).toEqual(['Réunion parents-profs', 'Déjeuner']);
      expect(readCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 11 — CalendarEventPanels : ajout et saisie
  // ---------------------------------------------------------------------------
  describe('ajout et saisie', () => {
    it('T11.1 ajoute un troisième item en dernier, en saisie, daté du 2026-11-19', async () => {
      await openPopupOn(buildMorningAndLunch);
      await addEvent();

      const items: HTMLElement[] = eventItems();
      const lastItem: HTMLElement = items[items.length - 1];
      const lastItemUnderEntry: boolean = itemShows(lastItem, '.event-entry');
      const draftDate: string = entryValueOf('.event-entry-date');

      expect(items).toHaveLength(3);
      expect(lastItemUnderEntry).toBe(true);
      expect(draftDate).toBe('2026-11-19');
    });

    it('T11.2 ignore « Ajouter un événement » tant qu’une saisie est ouverte sur evt-midi', async () => {
      await openPopupOn(buildMorningAndLunch);
      await openEntryOf('Déjeuner');
      await addEvent();

      const items: HTMLElement[] = eventItems();

      expect(items).toHaveLength(2);
    });

    it('T11.3 fait disparaître le brouillon quand on touche ✗ sur lui', async () => {
      await openPopupOn(buildMorningAndLunch);
      await addEvent();
      await cancelEntry();

      const titles: string[] = displayedTitles();
      const editingItems: HTMLElement[] = itemsUnderEntry();

      expect(titles).toEqual(['Réunion parents-profs', 'Déjeuner']);
      expect(editingItems).toHaveLength(0);
    });

    it('T11.4 ouvre la saisie de evt-midi quand on touche son corps', async () => {
      await openPopupOn(buildMorningAndLunch);
      await openEntryOf('Déjeuner');

      const typedTitle: string = entryValueOf('.event-entry-title');

      expect(typedTitle).toBe('Déjeuner');
    });

    it('T11.5 n’ouvre pas la saisie de evt-matin tant que celle de evt-midi est ouverte', async () => {
      await openPopupOn(buildMorningAndLunch);
      await openEntryOf('Déjeuner');
      await openEntryOf('Réunion parents-profs');

      const typedTitle: string = entryValueOf('.event-entry-title');
      const evtMatinItem: HTMLElement | null = findItemTitled('Réunion parents-profs');

      expect(typedTitle).toBe('Déjeuner');
      expect(evtMatinItem).not.toBeNull();
    });

    it('T11.6 ferme la saisie valide qui passe evt-matin à 14:00 et l’affiche après evt-midi', async () => {
      await openPopupOn(buildMorningAndLunch);
      await openEntryOf('Réunion parents-profs');
      await typeInto('.event-entry-start', '14:00');
      await typeInto('.event-entry-end', '15:00');
      await confirmEntry();

      const editingItems: HTMLElement[] = itemsUnderEntry();
      const titles: string[] = displayedTitles();

      expect(editingItems).toHaveLength(0);
      expect(titles).toEqual(['Déjeuner', 'Réunion parents-profs']);
    });

    it('T11.7 garde ouverte une saisie au texte vide avec le message TEXT_REQUIRED, sans changer evt-midi', async () => {
      await openPopupOn(buildMorningAndLunch);
      await openEntryOf('Déjeuner');
      await typeInto('.event-entry-title', '');
      await confirmEntry();

      const editingItem: HTMLElement = itemUnderEntry();
      const issueElement: Element | null = editingItem.querySelector('.event-issue[role="alert"]');
      const issueText: string = normalizedTextOfElement(issueElement);

      expect(issueText).toBe(TEXT_REQUIRED_MESSAGE);

      await cancelEntry();

      const titles: string[] = displayedTitles();

      expect(titles).toEqual(['Réunion parents-profs', 'Déjeuner']);
    });

    it('T11.8 rend à evt-midi son texte « Déjeuner » quand on touche ✗ après avoir tapé « Autre chose »', async () => {
      await openPopupOn(buildMorningAndLunch);
      await openEntryOf('Déjeuner');
      await typeInto('.event-entry-title', 'Autre chose');
      await cancelEntry();

      const titles: string[] = displayedTitles();

      expect(titles).toEqual(['Réunion parents-profs', 'Déjeuner']);
    });

    it('T11.9 garde evt-midi affiché avec .event-date « 21/11/2026 » après une saisie datée du 2026-11-21', async () => {
      await openPopupOn(buildMorningAndLunch);
      await openEntryOf('Déjeuner');
      await typeInto('.event-entry-date', '2026-11-21');
      await confirmEntry();

      const evtMidiItem: HTMLElement = itemTitled('Déjeuner');
      const dateElement: Element | null = evtMidiItem.querySelector('.event-date');
      const displayedDate: string = normalizedTextOfElement(dateElement);

      expect(displayedDate).toBe('21/11/2026');
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 12 — CalendarEventPanels : notes et suppression
  // ---------------------------------------------------------------------------
  describe('notes et suppression', () => {
    it('T12.1 affiche « Courses » sur evt-midi, et aucune note sur evt-matin, après le choix dans le picker', async () => {
      await openPopupOn(buildMorningAndLunch);
      await openPickerFrom('Déjeuner');
      await chooseNoteInPicker('Courses');

      const evtMidiItem: HTMLElement = itemTitled('Déjeuner');
      const evtMatinItem: HTMLElement = itemTitled('Réunion parents-profs');
      const evtMidiNoteTitle: string = noteTitleOfItem(evtMidiItem);
      const evtMatinShowsNote: boolean = itemShows(evtMatinItem, '.event-note-title');

      expect(evtMidiNoteTitle).toBe('Courses');
      expect(evtMatinShowsNote).toBe(false);
    });

    it('T12.2 retire la note de evt-matin avec « Retirer la note » et propose « Lier une note »', async () => {
      await openPopupOn(buildLinkedMorningAndLunch);
      const evtMatinBefore: HTMLElement = itemTitled('Réunion parents-profs');
      await clickWithin(evtMatinBefore, '.btn-remove-note');

      const evtMatinAfter: HTMLElement = itemTitled('Réunion parents-profs');
      const showsNoteTitle: boolean = itemShows(evtMatinAfter, '.event-note-title');
      const offersLinkNote: boolean = itemShows(evtMatinAfter, '.btn-link-note');

      expect(showsNoteTitle).toBe(false);
      expect(offersLinkNote).toBe(true);
    });

    it('T12.3 laisse evt-midi sans note quand on choisit « Aucune note » dans le picker', async () => {
      await openPopupOn(buildMorningAndLunch);
      await openPickerFrom('Déjeuner');
      await clickOn('.note-option-none');

      const evtMidiItem: HTMLElement = itemTitled('Déjeuner');
      const showsNoteTitle: boolean = itemShows(evtMidiItem, '.event-note-title');

      expect(showsNoteTitle).toBe(false);
    });

    it('T12.4 laisse evt-midi sans note quand on ferme le picker sans choisir, et « Enregistrer » n’écrit rien', async () => {
      await openPopupOn(buildMorningAndLunch);
      await openPickerFrom('Déjeuner');
      await clickOn('.btn-note-picker-close');

      const evtMidiItem: HTMLElement = itemTitled('Déjeuner');
      const showsNoteTitle: boolean = itemShows(evtMidiItem, '.event-note-title');

      expect(showsNoteTitle).toBe(false);

      await clickOn('.btn-save-events');

      const popupClosed: boolean = isPopupClosed();

      expect(popupClosed).toBe(true);
      expect(calendarServiceDouble.saveEventChanges).not.toHaveBeenCalled();
    });

    it('T12.5 demande « Supprimer l’événement « Déjeuner » ? » quand on touche la corbeille de evt-midi', async () => {
      await openPopupOn(buildMorningAndLunch);
      const evtMidiItem: HTMLElement = itemTitled('Déjeuner');
      await clickWithin(evtMidiItem, '.btn-remove-event');

      const messages: string[] = confirmMessages();
      const expectedMessage: string = removalMessageOf('Déjeuner');

      expect(messages).toEqual([expectedMessage]);
    });

    it('T12.6 nomme « Nouvel événement » dans la confirmation de suppression d’un brouillon vide', async () => {
      await openPopupOn(buildMorningAndLunch);
      await addEvent();
      const items: CalendarEventItem[] = itemComponents();
      const draftItem: CalendarEventItem = items[items.length - 1];
      draftItem.removeRequested.emit();
      await render();

      const messages: string[] = confirmMessages();
      const expectedMessage: string = removalMessageOf('Nouvel événement');

      expect(messages).toEqual([expectedMessage]);
    });

    it('T12.7 fait disparaître evt-midi quand on confirme sa suppression', async () => {
      await openPopupOn(buildMorningAndLunch);
      await removeEventTitled('Déjeuner', true);

      const titles: string[] = displayedTitles();

      expect(titles).toEqual(['Réunion parents-profs']);
    });

    it('T12.8 garde evt-midi affiché quand on refuse sa suppression', async () => {
      await openPopupOn(buildMorningAndLunch);
      await removeEventTitled('Déjeuner', false);

      const titles: string[] = displayedTitles();

      expect(titles).toEqual(['Réunion parents-profs', 'Déjeuner']);
    });

    it('T12.9 n’appelle jamais saveEventChanges pour un ajout, un lien et une suppression sans « Enregistrer »', async () => {
      await openPopupOn(buildMorningAndLunch);
      await addAndValidateEvent('Piscine', '18:00');
      await openPickerFrom('Réunion parents-profs');
      await chooseNoteInPicker('Courses');
      await removeEventTitled('Déjeuner', true);

      const titles: string[] = displayedTitles();

      expect(titles).toEqual(['Réunion parents-profs', 'Piscine']);
      expect(calendarServiceDouble.saveEventChanges).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 13 — CalendarEventPanels : enregistrer
  // ---------------------------------------------------------------------------
  describe('enregistrer', () => {
    it('T13.1 désactive .btn-save-events et affiche « Validez ou abandonnez la saisie en cours » pendant une saisie', async () => {
      await openPopupOn(buildMorningAndLunch);
      await openEntryOf('Déjeuner');

      const shownSaveButton: HTMLButtonElement = saveButton();
      const saveDisabled: boolean = shownSaveButton.disabled;
      const hintText: string = normalizedTextOf('.event-panels-entry-hint');

      expect(saveDisabled).toBe(true);
      expect(hintText).toBe('Validez ou abandonnez la saisie en cours');
    });

    it('T13.2 ferme la popup sans appeler saveEventChanges ni émettre saved quand rien n’a changé', async () => {
      await openPopupOn(buildMorningAndLunch);
      await clickOn('.btn-save-events');

      const popupClosed: boolean = isPopupClosed();

      expect(popupClosed).toBe(true);
      expect(calendarServiceDouble.saveEventChanges).not.toHaveBeenCalled();
      expect(host.saveCount).toBe(0);
    });

    it('T13.3 envoie le bon changeSet, ferme la popup et émet saved une fois quand l’enregistrement réussit', async () => {
      await openPopupOn(buildWholeDay);
      await addAndValidateEvent('Piscine', '18:00');
      await retitleEvent('Déjeuner', 'Déjeuner client');
      await removeEventTitled('Congé', true);
      await clickOn('.btn-save-events');

      const changeSet: EventChangeSet = changeSetOfCall(0);
      const evtMidi: CalendarEvent = buildEvtMidi();
      const expectedPiscine: CalendarEvent = {
        id: expect.any(String) as unknown as string,
        title: 'Piscine',
        date: POPUP_DATE,
        start_time: '18:00',
        end_time: '',
        note: null,
      };
      const expectedEvtMidi: CalendarEvent = { ...evtMidi, title: 'Déjeuner client' };
      const popupClosed: boolean = isPopupClosed();

      expect(calendarServiceDouble.saveEventChanges).toHaveBeenCalledTimes(1);
      expect(changeSet.upsertedEvents).toHaveLength(2);
      expect(changeSet.upsertedEvents).toEqual(expect.arrayContaining([expectedPiscine, expectedEvtMidi]));
      expect(changeSet.removedEventIds).toEqual(['evt-journee']);
      expect(popupClosed).toBe(true);
      expect(host.saveCount).toBe(1);
    });

    it('T13.4 garde la popup ouverte avec ses changements et .event-panels-save-error, sans émettre saved, quand l’enregistrement échoue', async () => {
      const saveFailure: Error = new Error('Erreur lors de l\'enregistrement des événements');
      calendarServiceDouble.saveEventChanges.mockRejectedValue(saveFailure);
      await openPopupOn(buildMorningAndLunch);
      await removeEventTitled('Déjeuner', true);
      await clickOn('.btn-save-events');

      const popupOpen: boolean = isPopupOpen();
      const titles: string[] = displayedTitles();
      const saveErrorShown: boolean = isShown('.event-panels-save-error');

      expect(popupOpen).toBe(true);
      expect(titles).toEqual(['Réunion parents-profs']);
      expect(saveErrorShown).toBe(true);
      expect(host.saveCount).toBe(0);
    });

    it('T13.5 rejoue le même changeSet après un échec, puis ferme la popup et émet saved', async () => {
      const saveFailure: Error = new Error('Erreur lors de l\'enregistrement des événements');
      calendarServiceDouble.saveEventChanges.mockRejectedValueOnce(saveFailure);
      await openPopupOn(buildMorningAndLunch);
      await removeEventTitled('Déjeuner', true);
      await clickOn('.btn-save-events');
      await clickOn('.btn-save-events');

      const firstChangeSet: EventChangeSet = changeSetOfCall(0);
      const secondChangeSet: EventChangeSet = changeSetOfCall(1);
      const popupClosed: boolean = isPopupClosed();

      expect(calendarServiceDouble.saveEventChanges).toHaveBeenCalledTimes(2);
      expect(secondChangeSet).toEqual(firstChangeSet);
      expect(popupClosed).toBe(true);
      expect(host.saveCount).toBe(1);
    });

    it('T13.6 n’appelle saveEventChanges qu’une fois quand on touche « Enregistrer » deux fois pendant l’enregistrement', async () => {
      const pendingSave: Deferred<void> = createDeferred<void>();
      calendarServiceDouble.saveEventChanges.mockReturnValue(pendingSave.promise);
      await openPopupOn(buildMorningAndLunch);
      await removeEventTitled('Déjeuner', true);
      const shownSaveButton: HTMLButtonElement = saveButton();
      shownSaveButton.click();
      await renderWhilePending();
      shownSaveButton.click();
      await renderWhilePending();

      expect(calendarServiceDouble.saveEventChanges).toHaveBeenCalledTimes(1);

      pendingSave.resolve();
      await render();
    });
  });

  // ---------------------------------------------------------------------------
  // Groupe 14 — CalendarEventPanels : fermer et ouvrir une note
  // ---------------------------------------------------------------------------
  describe('fermer et ouvrir une note', () => {
    it('T14.1 ferme la popup sans confirmation quand rien n’a changé et qu’aucune saisie n’est ouverte', async () => {
      await openPopupOn(buildMorningAndLunch);
      await clickOn('.btn-close-events');

      const popupClosed: boolean = isPopupClosed();
      const messages: string[] = confirmMessages();

      expect(popupClosed).toBe(true);
      expect(messages).toEqual([]);
    });

    it('T14.2 affiche l’avertissement d’abandon, popup ouverte, quand on ferme après avoir supprimé evt-midi', async () => {
      await openPopupOn(buildMorningAndLunch);
      await removeEventTitled('Déjeuner', true);
      await clickOn('.btn-close-events');

      const messages: string[] = confirmMessages();
      const popupOpen: boolean = isPopupOpen();

      expect(messages).toEqual([LEAVE_MESSAGE]);
      expect(popupOpen).toBe(true);
    });

    it('T14.3 affiche l’avertissement d’abandon quand on ferme avec une saisie ouverte, rien de tapé (D9)', async () => {
      await openPopupOn(buildMorningAndLunch);
      await openEntryOf('Déjeuner');
      await clickOn('.btn-close-events');

      const messages: string[] = confirmMessages();

      expect(messages).toEqual([LEAVE_MESSAGE]);
    });

    it('T14.4 ferme la popup sans émettre saved quand on confirme l’abandon', async () => {
      await openPopupOn(buildMorningAndLunch);
      await removeEventTitled('Déjeuner', true);
      await clickOn('.btn-close-events');
      await answerConfirmation(LEAVE_MESSAGE, true);

      const popupClosed: boolean = isPopupClosed();

      expect(popupClosed).toBe(true);
      expect(host.saveCount).toBe(0);
    });

    it('T14.5 garde la popup ouverte, evt-midi toujours absent, quand on refuse l’abandon', async () => {
      await openPopupOn(buildMorningAndLunch);
      await removeEventTitled('Déjeuner', true);
      await clickOn('.btn-close-events');
      await answerConfirmation(LEAVE_MESSAGE, false);

      const popupOpen: boolean = isPopupOpen();
      const titles: string[] = displayedTitles();

      expect(popupOpen).toBe(true);
      expect(titles).toEqual(['Réunion parents-profs']);
    });

    it('T14.6 affiche l’avertissement d’abandon sur un clic sur .event-panels-backdrop après avoir supprimé evt-midi', async () => {
      await openPopupOn(buildMorningAndLunch);
      await removeEventTitled('Déjeuner', true);
      await clickOn('.event-panels-backdrop');

      const messages: string[] = confirmMessages();

      expect(messages).toEqual([LEAVE_MESSAGE]);
    });

    it('T14.7 navigue vers /notes/edit/note-questions quand on touche le titre de la note sans changement', async () => {
      await openPopupOn(buildLinkedMorningAndLunch);
      const evtMatinItem: HTMLElement = itemTitled('Réunion parents-profs');
      await clickWithin(evtMatinItem, '.event-note-title');

      expect(routerDouble.navigate).toHaveBeenCalledWith(['/notes/edit', 'note-questions']);
    });

    it('T14.8 avertit puis navigue vers la note quand on confirme l’abandon, evt-midi supprimé', async () => {
      await openPopupOn(buildLinkedMorningAndLunch);
      await removeEventTitled('Déjeuner', true);
      const evtMatinItem: HTMLElement = itemTitled('Réunion parents-profs');
      await clickWithin(evtMatinItem, '.event-note-title');

      const messages: string[] = confirmMessages();

      expect(messages).toEqual([LEAVE_MESSAGE]);
      expect(routerDouble.navigate).not.toHaveBeenCalled();

      await answerConfirmation(LEAVE_MESSAGE, true);

      expect(routerDouble.navigate).toHaveBeenCalledWith(['/notes/edit', 'note-questions']);
    });

    it('T14.9 ne navigue pas et garde la popup ouverte quand on refuse l’abandon, evt-midi supprimé', async () => {
      await openPopupOn(buildLinkedMorningAndLunch);
      await removeEventTitled('Déjeuner', true);
      const evtMatinItem: HTMLElement = itemTitled('Réunion parents-profs');
      await clickWithin(evtMatinItem, '.event-note-title');
      await answerConfirmation(LEAVE_MESSAGE, false);

      const popupOpen: boolean = isPopupOpen();

      expect(routerDouble.navigate).not.toHaveBeenCalled();
      expect(popupOpen).toBe(true);
    });
  });
});
