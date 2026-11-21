import { CalendarEvent } from '../models/calendar-event.model';
import {
  EventChangeSet,
  EventComposition,
  EventEntry,
  EventIssue,
} from '../models/calendar-event-composition.model';
import { Note } from '../models';

import * as calendarEventCompositionModule from './calendar-event-composition';

/**
 * Tests of `calendar-event-composition` — the PURE functions the event popup applies to the events
 * of one date it composes: no Angular, no DOM, no database, no double. TDD / black box.
 *
 * Source: `.agent/CALENDAR/EVENT/PLAN_TESTS_CALENDAR_EVENT.md` §7, groups 3 → 7 (cases `T3.1` →
 * `T7.13`, effects `E30` → `E60`, causes `C30` → `C63`). Development approach: the same folder's
 * `APPROCHE_CALENDAR_EVENT.md`, batch D (`D-EV17`, `D-EV18`, `D-EV15`). Precedent of form:
 * `kanban-composition.spec.ts`, the pure module of the kanban, driven with no test bed.
 *
 * Doubles: NONE (plan §8). The module has no dependency, so a case is a composition in, a
 * composition (or a reading of it) out.
 *
 * Frozen decisions the cases rely on:
 *   D5    — the reference data shared by every spec of the batch: popup date `2026-11-19`,
 *           `evt-matin` « Réunion parents-profs » 09:00–10:30, `evt-midi` « Déjeuner » 12:30,
 *           `evt-journee` « Congé » with no time, notes `note-questions` « Questions à poser » and
 *           `note-courses` « Courses ».
 *   D-EV17 — a gesture returns a NEW composition, or the RECEIVED composition itself when it does
 *           not apply (unknown identifier): hence `toBe(composition)` in T5.9, T5.10 and T5.11.
 *           Purity (`E50`) is checked by ONE case sweeping the four gestures (T5.12).
 *   D-EV15 — deletions are derived: the identifiers read at opening and missing from the
 *           composition, never « everything of the date ».
 *   The signature behind `hasPendingChanges` and `toChangeSet` carries the note IDENTIFIER, never
 *   its content, and does not depend on the order of the events (APPROCHE, batch D).
 *
 * T4.11 and T4.12 leave the end time empty: the plan only names the malformed start time, and an
 * end time would raise the question, not decided by the plan, of comparing it with a malformed
 * start. The cases therefore observe the format problem alone.
 */

/**
 * The whole call surface the cases drive: the API contract of the module, as the class diagram of
 * the APPROCHE writes it down (`CalendarEventComposition`). Binding the module to it is what
 * freezes the API: a case may only call what this contract names.
 */
interface CalendarEventCompositionContract {
  startComposition(date: string, events: readonly CalendarEvent[]): EventComposition;
  createBlankEvent(id: string, date: string): CalendarEvent;
  appendEvent(composition: EventComposition, event: CalendarEvent): EventComposition;
  applyEntry(composition: EventComposition, eventId: string, entry: EventEntry): EventComposition;
  setEventNote(composition: EventComposition, eventId: string, note: Note | null): EventComposition;
  removeEvent(composition: EventComposition, eventId: string): EventComposition;
  findEvent(composition: EventComposition, eventId: string): CalendarEvent | null;
  isNewEvent(composition: EventComposition, eventId: string): boolean;
  validateEntry(entry: EventEntry): readonly EventIssue[];
  entryOf(event: CalendarEvent): EventEntry;
  hasPendingChanges(composition: EventComposition): boolean;
  toChangeSet(composition: EventComposition): EventChangeSet;
}

/** The module under test, seen through the contract above. */
const calendarEventComposition: CalendarEventCompositionContract = calendarEventCompositionModule;

/** The date the popup is opened for in every case (D5). */
const POPUP_DATE: string = '2026-11-19';

/** The note `evt-matin` is linked to when a case needs a linked event (D5). */
const NOTE_QUESTIONS: Note = {
  id: 'note-questions',
  title: 'Questions à poser',
  category: null,
  blocks: [],
  updatedAt: '2026-11-15T08:00:00.000Z',
};

/** The note a case poses on an event, told apart from the other by its identifier (D5). */
const NOTE_COURSES: Note = {
  id: 'note-courses',
  title: 'Courses',
  category: null,
  blocks: [],
  updatedAt: '2026-11-16T09:30:00.000Z',
};

// --- Builders (no test bed, no double) ---------------------------------------

/**
 * Builds `evt-matin` of D5: « Réunion parents-profs », 09:00–10:30, unlinked. Every call returns a
 * fresh object, so a case asserting purity is never fooled by another case's objects.
 * @param overrides The fields the case changes on the reference event.
 */
function matinEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const base: CalendarEvent = {
    id: 'evt-matin',
    title: 'Réunion parents-profs',
    date: POPUP_DATE,
    start_time: '09:00',
    end_time: '10:30',
    note: null,
  };
  return { ...base, ...overrides };
}

/**
 * Builds `evt-midi` of D5: « Déjeuner », starting 12:30 with no end, unlinked.
 * @param overrides The fields the case changes on the reference event.
 */
function midiEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const base: CalendarEvent = {
    id: 'evt-midi',
    title: 'Déjeuner',
    date: POPUP_DATE,
    start_time: '12:30',
    end_time: '',
    note: null,
  };
  return { ...base, ...overrides };
}

/**
 * Builds `evt-journee` of D5: « Congé », with no time at all, unlinked.
 * @param overrides The fields the case changes on the reference event.
 */
function journeeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const base: CalendarEvent = {
    id: 'evt-journee',
    title: 'Congé',
    date: POPUP_DATE,
    start_time: '',
    end_time: '',
    note: null,
  };
  return { ...base, ...overrides };
}

/**
 * Builds `evt-x`, the event a case adds to a composition after its opening: « Piscine » at 18:00.
 * @param overrides The fields the case changes on the added event.
 */
function addedEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const base: CalendarEvent = {
    id: 'evt-x',
    title: 'Piscine',
    date: POPUP_DATE,
    start_time: '18:00',
    end_time: '',
    note: null,
  };
  return { ...base, ...overrides };
}

/**
 * The composition the cases start from unless they say otherwise: the popup opened on
 * `evt-matin` and `evt-midi`, both unlinked.
 */
function standardComposition(): EventComposition {
  const readEvents: CalendarEvent[] = [matinEvent(), midiEvent()];
  return calendarEventComposition.startComposition(POPUP_DATE, readEvents);
}

/**
 * The popup opened on `evt-matin` linked to `note-questions`, and `evt-midi` unlinked — the
 * starting point of every case about an existing link.
 */
function compositionWithLinkedMatin(): EventComposition {
  const linkedMatin: CalendarEvent = matinEvent({ note: NOTE_QUESTIONS });
  const readEvents: CalendarEvent[] = [linkedMatin, midiEvent()];
  return calendarEventComposition.startComposition(POPUP_DATE, readEvents);
}

/**
 * Builds an entry as the user would type it in a form. The default is the valid entry of T4.1:
 * « Réunion », on the popup date, 09:00 → 10:30.
 * @param overrides The fields the case types differently.
 */
function buildEntry(overrides: Partial<EventEntry> = {}): EventEntry {
  const base: EventEntry = {
    title: 'Réunion',
    date: POPUP_DATE,
    startTime: '09:00',
    endTime: '10:30',
  };
  return { ...base, ...overrides };
}

/**
 * Builds the entry matching `evt-midi` as it was read — « Déjeuner », popup date, 12:30, no end —
 * with the fields the case retypes.
 * @param overrides The fields the case retypes on `evt-midi`.
 */
function midiEntry(overrides: Partial<EventEntry> = {}): EventEntry {
  const base: EventEntry = {
    title: 'Déjeuner',
    date: POPUP_DATE,
    startTime: '12:30',
    endTime: '',
  };
  return { ...base, ...overrides };
}

// --- Readers (what a case observes of a composition) -------------------------

/**
 * Identifiers of the composed events, in the order the composition holds them — the order the
 * popup renders.
 * @param composition The composition observed.
 */
function eventIdsOf(composition: EventComposition): string[] {
  return composition.events.map((event: CalendarEvent): string => event.id);
}

/**
 * The composed event carrying this identifier. A case asking for an event it never put in the
 * composition is a defect of the case, so the absence throws instead of reading as `undefined`.
 * @param composition The composition observed.
 * @param eventId Identifier of the event looked for.
 */
function eventById(composition: EventComposition, eventId: string): CalendarEvent {
  const foundEvent: CalendarEvent | undefined = composition.events.find(
    (event: CalendarEvent): boolean => event.id === eventId,
  );
  if (!foundEvent) {
    throw new Error(`Événement absent de la composition : ${eventId}`);
  }
  return foundEvent;
}

/**
 * Identifiers of the events a change set writes, sorted: the plan states which events are written,
 * never in which order.
 * @param changeSet The change set observed.
 */
function sortedUpsertedIdsOf(changeSet: EventChangeSet): string[] {
  const upsertedIds: string[] = changeSet.upsertedEvents.map(
    (event: CalendarEvent): string => event.id,
  );
  return upsertedIds.sort();
}

/**
 * The event of a change set carrying this identifier. Its absence is a failure of the case, made
 * explicit rather than read as `undefined`.
 * @param changeSet The change set observed.
 * @param eventId Identifier of the written event looked for.
 */
function upsertedEventById(changeSet: EventChangeSet, eventId: string): CalendarEvent {
  const foundEvent: CalendarEvent | undefined = changeSet.upsertedEvents.find(
    (event: CalendarEvent): boolean => event.id === eventId,
  );
  if (!foundEvent) {
    throw new Error(`Événement absent du changeSet : ${eventId}`);
  }
  return foundEvent;
}

describe('calendar-event-composition', () => {
  // Groupe 3 — Composition : ouverture, événement vierge, ajout
  describe('Groupe 3 — ouverture, événement vierge, ajout', () => {
    it('T3.1 les événements lus en désordre sont présentés triés : heure croissante, puis identifiant, sans heure en bas', () => {
      const untimedEvent: CalendarEvent = journeeEvent();
      const lunchEvent: CalendarEvent = midiEvent();
      const morningEventB: CalendarEvent = matinEvent({ id: 'evt-b' });
      const morningEventA: CalendarEvent = matinEvent({ id: 'evt-a' });
      const readEvents: CalendarEvent[] = [untimedEvent, lunchEvent, morningEventB, morningEventA];

      const composition: EventComposition = calendarEventComposition.startComposition(
        POPUP_DATE,
        readEvents,
      );

      const presentedIds: string[] = eventIdsOf(composition);
      expect(presentedIds).toEqual(['evt-a', 'evt-b', 'evt-midi', 'evt-journee']);
    });

    it('T3.2 une composition qui vient d\'être ouverte n\'a aucun changement en attente', () => {
      const composition: EventComposition = standardComposition();

      const pending: boolean = calendarEventComposition.hasPendingChanges(composition);

      expect(pending).toBe(false);
    });

    it('T3.3 l\'événement vierge porte l\'identifiant et la date reçus, un texte vide, sans heure ni note', () => {
      const blankEvent: CalendarEvent = calendarEventComposition.createBlankEvent('evt-x', POPUP_DATE);

      expect(blankEvent).toEqual({
        id: 'evt-x',
        title: '',
        date: POPUP_DATE,
        start_time: '',
        end_time: '',
        note: null,
      });
    });

    it('T3.4 l\'événement ajouté est le dernier, même avec une heure plus tôt que les autres', () => {
      const composition: EventComposition = standardComposition();
      const earlyEvent: CalendarEvent = addedEvent({ id: 'evt-tot', start_time: '07:00' });

      const withEarlyEvent: EventComposition = calendarEventComposition.appendEvent(
        composition,
        earlyEvent,
      );

      const presentedIds: string[] = eventIdsOf(withEarlyEvent);
      expect(presentedIds).toEqual(['evt-matin', 'evt-midi', 'evt-tot']);
    });
  });

  // Groupe 4 — Composition : validateEntry
  describe('Groupe 4 — validateEntry', () => {
    it('T4.1 une saisie complète et cohérente ne présente aucun problème', () => {
      const entry: EventEntry = buildEntry();

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual([]);
    });

    it('T4.2 une saisie sans aucune heure est valide', () => {
      const entry: EventEntry = buildEntry({ title: 'Congé', startTime: '', endTime: '' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual([]);
    });

    it('T4.3 une saisie avec une heure de début seule est valide', () => {
      const entry: EventEntry = buildEntry({ title: 'Déjeuner', startTime: '12:30', endTime: '' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual([]);
    });

    it('T4.4 un texte vide donne TEXT_REQUIRED', () => {
      const entry: EventEntry = buildEntry({ title: '' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['TEXT_REQUIRED']);
    });

    it('T4.5 un texte fait seulement d\'espaces donne TEXT_REQUIRED', () => {
      const entry: EventEntry = buildEntry({ title: '   ' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['TEXT_REQUIRED']);
    });

    it('T4.6 une date absente donne DATE_INVALID', () => {
      const entry: EventEntry = buildEntry({ date: '' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['DATE_INVALID']);
    });

    it('T4.7 une date mal formée (19/11/2026) donne DATE_INVALID', () => {
      const entry: EventEntry = buildEntry({ date: '19/11/2026' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['DATE_INVALID']);
    });

    it('T4.8 une date inexistante (2026-02-30) donne DATE_INVALID', () => {
      const entry: EventEntry = buildEntry({ date: '2026-02-30' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['DATE_INVALID']);
    });

    it('T4.9 le 29 février d\'une année non bissextile (2027-02-29) donne DATE_INVALID', () => {
      const entry: EventEntry = buildEntry({ date: '2027-02-29' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['DATE_INVALID']);
    });

    it('T4.10 le 29 février d\'une année bissextile (2028-02-29) est valide', () => {
      const entry: EventEntry = buildEntry({ date: '2028-02-29' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual([]);
    });

    it('T4.11 une heure de début hors plage (25:00) donne TIME_FORMAT_INVALID', () => {
      const entry: EventEntry = buildEntry({ startTime: '25:00', endTime: '' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['TIME_FORMAT_INVALID']);
    });

    it('T4.12 une heure de début sans zéro initial (9:00) donne TIME_FORMAT_INVALID', () => {
      const entry: EventEntry = buildEntry({ startTime: '9:00', endTime: '' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['TIME_FORMAT_INVALID']);
    });

    it('T4.13 une heure de fin aux minutes hors plage (12:60) donne TIME_FORMAT_INVALID', () => {
      const entry: EventEntry = buildEntry({ startTime: '09:00', endTime: '12:60' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['TIME_FORMAT_INVALID']);
    });

    it('T4.14 une heure de fin sans heure de début donne END_WITHOUT_START', () => {
      const entry: EventEntry = buildEntry({ startTime: '', endTime: '10:00' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['END_WITHOUT_START']);
    });

    it('T4.15 une fin égale au début donne END_NOT_AFTER_START', () => {
      const entry: EventEntry = buildEntry({ startTime: '10:00', endTime: '10:00' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['END_NOT_AFTER_START']);
    });

    it('T4.16 une fin avant le début donne END_NOT_AFTER_START', () => {
      const entry: EventEntry = buildEntry({ startTime: '10:00', endTime: '09:30' });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['END_NOT_AFTER_START']);
    });

    it('T4.17 plusieurs problèmes sortent ensemble, dans l\'ordre fixé', () => {
      const entry: EventEntry = buildEntry({
        title: ' ',
        date: '2026-02-30',
        startTime: '',
        endTime: '10:00',
      });

      const issues: readonly EventIssue[] = calendarEventComposition.validateEntry(entry);

      expect(issues).toEqual(['TEXT_REQUIRED', 'DATE_INVALID', 'END_WITHOUT_START']);
    });
  });

  // Groupe 5 — Composition : gestes
  describe('Groupe 5 — gestes', () => {
    it('T5.1 applyEntry remplace les champs de cet événement seulement', () => {
      const composition: EventComposition = standardComposition();
      const entry: EventEntry = midiEntry({ title: 'Déjeuner client', endTime: '13:30' });

      const edited: EventComposition = calendarEventComposition.applyEntry(composition, 'evt-midi', entry);

      const editedMidi: CalendarEvent = eventById(edited, 'evt-midi');
      const untouchedMatin: CalendarEvent = eventById(edited, 'evt-matin');
      const expectedMidi: CalendarEvent = midiEvent({ title: 'Déjeuner client', end_time: '13:30' });
      const expectedMatin: CalendarEvent = matinEvent();
      expect(editedMidi).toEqual(expectedMidi);
      expect(untouchedMatin).toEqual(expectedMatin);
    });

    it('T5.2 applyEntry retient le texte sans espaces de début et de fin, en gardant les espaces intérieurs', () => {
      const composition: EventComposition = standardComposition();
      const entry: EventEntry = midiEntry({ title: '  Déjeuner   client  ' });

      const edited: EventComposition = calendarEventComposition.applyEntry(composition, 'evt-midi', entry);

      const editedMidi: CalendarEvent = eventById(edited, 'evt-midi');
      expect(editedMidi.title).toBe('Déjeuner   client');
    });

    it('T5.3 applyEntry ne touche pas à la note de l\'événement', () => {
      const composition: EventComposition = compositionWithLinkedMatin();
      const entry: EventEntry = buildEntry({ title: 'Réunion décalée', startTime: '14:00', endTime: '15:00' });

      const edited: EventComposition = calendarEventComposition.applyEntry(composition, 'evt-matin', entry);

      const editedMatin: CalendarEvent = eventById(edited, 'evt-matin');
      expect(editedMatin.note).toEqual(NOTE_QUESTIONS);
    });

    it('T5.4 l\'événement modifié prend sa place triée', () => {
      const composition: EventComposition = standardComposition();
      const entry: EventEntry = buildEntry({
        title: 'Réunion parents-profs',
        startTime: '14:00',
        endTime: '15:30',
      });

      const edited: EventComposition = calendarEventComposition.applyEntry(composition, 'evt-matin', entry);

      const presentedIds: string[] = eventIdsOf(edited);
      expect(presentedIds).toEqual(['evt-midi', 'evt-matin']);
    });

    it('T5.5 un événement dont la date change reste dans la composition, avec sa nouvelle date', () => {
      const composition: EventComposition = standardComposition();
      const entry: EventEntry = buildEntry({ title: 'Réunion parents-profs', date: '2026-11-21' });

      const moved: EventComposition = calendarEventComposition.applyEntry(composition, 'evt-matin', entry);

      const movedMatin: CalendarEvent = eventById(moved, 'evt-matin');
      expect(movedMatin.date).toBe('2026-11-21');
    });

    it('T5.6 setEventNote pose la note sur cet événement seulement', () => {
      const composition: EventComposition = standardComposition();

      const linked: EventComposition = calendarEventComposition.setEventNote(
        composition,
        'evt-midi',
        NOTE_COURSES,
      );

      const linkedMidi: CalendarEvent = eventById(linked, 'evt-midi');
      const untouchedMatin: CalendarEvent = eventById(linked, 'evt-matin');
      expect(linkedMidi.note).toEqual(NOTE_COURSES);
      expect(untouchedMatin.note).toBeNull();
    });

    it('T5.7 setEventNote avec null retire la note, sans changer les autres valeurs', () => {
      const composition: EventComposition = compositionWithLinkedMatin();

      const unlinked: EventComposition = calendarEventComposition.setEventNote(composition, 'evt-matin', null);

      const unlinkedMatin: CalendarEvent = eventById(unlinked, 'evt-matin');
      const expectedMatin: CalendarEvent = matinEvent({ note: null });
      expect(unlinkedMatin).toEqual(expectedMatin);
    });

    it('T5.8 removeEvent fait disparaître l\'événement, les autres restent dans le même ordre', () => {
      const readEvents: CalendarEvent[] = [matinEvent(), midiEvent(), journeeEvent()];
      const composition: EventComposition = calendarEventComposition.startComposition(POPUP_DATE, readEvents);

      const removed: EventComposition = calendarEventComposition.removeEvent(composition, 'evt-midi');

      const presentedIds: string[] = eventIdsOf(removed);
      expect(presentedIds).toEqual(['evt-matin', 'evt-journee']);
    });

    it('T5.9 applyEntry sur un identifiant inconnu rend la composition reçue elle-même', () => {
      const composition: EventComposition = standardComposition();
      const entry: EventEntry = buildEntry();

      const result: EventComposition = calendarEventComposition.applyEntry(composition, 'evt-inconnu', entry);

      expect(result).toBe(composition);
    });

    it('T5.10 setEventNote sur un identifiant inconnu rend la composition reçue elle-même', () => {
      const composition: EventComposition = standardComposition();

      const result: EventComposition = calendarEventComposition.setEventNote(
        composition,
        'evt-inconnu',
        NOTE_COURSES,
      );

      expect(result).toBe(composition);
    });

    it('T5.11 removeEvent sur un identifiant inconnu rend la composition reçue elle-même', () => {
      const composition: EventComposition = standardComposition();

      const result: EventComposition = calendarEventComposition.removeEvent(composition, 'evt-inconnu');

      expect(result).toBe(composition);
    });

    it('T5.12 les quatre gestes, appliqués à une même composition, la laissent égale à sa copie', () => {
      const composition: EventComposition = compositionWithLinkedMatin();
      const compositionBefore: EventComposition = structuredClone(composition);
      const appended: CalendarEvent = addedEvent();
      const entry: EventEntry = midiEntry({ title: 'Déjeuner client', startTime: '13:00' });

      calendarEventComposition.appendEvent(composition, appended);
      calendarEventComposition.applyEntry(composition, 'evt-midi', entry);
      calendarEventComposition.setEventNote(composition, 'evt-midi', NOTE_COURSES);
      calendarEventComposition.setEventNote(composition, 'evt-matin', null);
      calendarEventComposition.removeEvent(composition, 'evt-matin');

      expect(composition).toEqual(compositionBefore);
    });
  });

  // Groupe 6 — Composition : utilitaires
  describe('Groupe 6 — utilitaires', () => {
    it('T6.1 isNewEvent est vrai pour un événement ajouté après l\'ouverture', () => {
      const composition: EventComposition = standardComposition();
      const blankEvent: CalendarEvent = calendarEventComposition.createBlankEvent('evt-x', POPUP_DATE);
      const withBlank: EventComposition = calendarEventComposition.appendEvent(composition, blankEvent);

      const isNew: boolean = calendarEventComposition.isNewEvent(withBlank, 'evt-x');

      expect(isNew).toBe(true);
    });

    it('T6.2 isNewEvent est faux pour un événement lu à l\'ouverture', () => {
      const composition: EventComposition = standardComposition();

      const isNew: boolean = calendarEventComposition.isNewEvent(composition, 'evt-matin');

      expect(isNew).toBe(false);
    });

    it('T6.3 entryOf restitue la saisie d\'un événement, heures vides comprises', () => {
      const untimedEvent: CalendarEvent = journeeEvent();

      const entry: EventEntry = calendarEventComposition.entryOf(untimedEvent);

      expect(entry).toEqual({ title: 'Congé', date: POPUP_DATE, startTime: '', endTime: '' });
    });

    it('T6.4 findEvent rend l\'événement cherché', () => {
      const composition: EventComposition = standardComposition();

      const found: CalendarEvent | null = calendarEventComposition.findEvent(composition, 'evt-midi');

      const expectedMidi: CalendarEvent = midiEvent();
      expect(found).toEqual(expectedMidi);
    });

    it('T6.5 findEvent rend null pour un identifiant inconnu', () => {
      const composition: EventComposition = standardComposition();

      const found: CalendarEvent | null = calendarEventComposition.findEvent(composition, 'evt-inconnu');

      expect(found).toBeNull();
    });
  });

  // Groupe 7 — Composition : changements en attente et changeSet
  describe('Groupe 7 — changements en attente et changeSet', () => {
    it('T7.1 ajouter un événement est un changement en attente', () => {
      const composition: EventComposition = standardComposition();
      const appended: CalendarEvent = addedEvent();
      const withAdded: EventComposition = calendarEventComposition.appendEvent(composition, appended);

      const pending: boolean = calendarEventComposition.hasPendingChanges(withAdded);

      expect(pending).toBe(true);
    });

    it('T7.2 changer le texte d\'un événement est un changement en attente', () => {
      const composition: EventComposition = standardComposition();
      const entry: EventEntry = midiEntry({ title: 'Déjeuner client' });
      const retyped: EventComposition = calendarEventComposition.applyEntry(composition, 'evt-midi', entry);

      const pending: boolean = calendarEventComposition.hasPendingChanges(retyped);

      expect(pending).toBe(true);
    });

    it('T7.3 changer la date d\'un événement est un changement en attente', () => {
      const composition: EventComposition = standardComposition();
      const entry: EventEntry = midiEntry({ date: '2026-11-21' });
      const moved: EventComposition = calendarEventComposition.applyEntry(composition, 'evt-midi', entry);

      const pending: boolean = calendarEventComposition.hasPendingChanges(moved);

      expect(pending).toBe(true);
    });

    it('T7.4 lier une note à un événement est un changement en attente', () => {
      const composition: EventComposition = standardComposition();
      const linked: EventComposition = calendarEventComposition.setEventNote(
        composition,
        'evt-midi',
        NOTE_COURSES,
      );

      const pending: boolean = calendarEventComposition.hasPendingChanges(linked);

      expect(pending).toBe(true);
    });

    it('T7.5 retirer la note d\'un événement lu avec une note est un changement en attente', () => {
      const composition: EventComposition = compositionWithLinkedMatin();
      const unlinked: EventComposition = calendarEventComposition.setEventNote(composition, 'evt-matin', null);

      const pending: boolean = calendarEventComposition.hasPendingChanges(unlinked);

      expect(pending).toBe(true);
    });

    it('T7.6 retirer un événement est un changement en attente', () => {
      const composition: EventComposition = standardComposition();
      const removed: EventComposition = calendarEventComposition.removeEvent(composition, 'evt-midi');

      const pending: boolean = calendarEventComposition.hasPendingChanges(removed);

      expect(pending).toBe(true);
    });

    it('T7.7 revenir au texte d\'origine n\'est plus un changement en attente', () => {
      const composition: EventComposition = standardComposition();
      const retypedEntry: EventEntry = midiEntry({ title: 'Déjeuner client' });
      const originalEntry: EventEntry = midiEntry();
      const retyped: EventComposition = calendarEventComposition.applyEntry(
        composition,
        'evt-midi',
        retypedEntry,
      );
      const restored: EventComposition = calendarEventComposition.applyEntry(
        retyped,
        'evt-midi',
        originalEntry,
      );

      const pending: boolean = calendarEventComposition.hasPendingChanges(restored);

      expect(pending).toBe(false);
    });

    it('T7.8 les mêmes événements dans un autre ordre ne sont pas un changement en attente', () => {
      const reordered: EventComposition = {
        date: POPUP_DATE,
        initialEvents: [matinEvent(), midiEvent()],
        events: [midiEvent(), matinEvent()],
      };

      const pending: boolean = calendarEventComposition.hasPendingChanges(reordered);

      expect(pending).toBe(false);
    });

    it('T7.9 une note de même identifiant mais de contenu différent n\'est pas un changement en attente', () => {
      const composition: EventComposition = compositionWithLinkedMatin();
      const retitledNote: Note = { ...NOTE_QUESTIONS, title: 'Questions revues' };
      const relinked: EventComposition = calendarEventComposition.setEventNote(
        composition,
        'evt-matin',
        retitledNote,
      );

      const pending: boolean = calendarEventComposition.hasPendingChanges(relinked);

      expect(pending).toBe(false);
    });

    it('T7.10 le changeSet écrit les événements nouveaux et modifiés, sans les inchangés', () => {
      const composition: EventComposition = standardComposition();
      const appended: CalendarEvent = addedEvent();
      const entry: EventEntry = midiEntry({ title: 'Déjeuner client' });
      const withAdded: EventComposition = calendarEventComposition.appendEvent(composition, appended);
      const edited: EventComposition = calendarEventComposition.applyEntry(withAdded, 'evt-midi', entry);

      const changeSet: EventChangeSet = calendarEventComposition.toChangeSet(edited);

      const upsertedIds: string[] = sortedUpsertedIdsOf(changeSet);
      const upsertedMidi: CalendarEvent = upsertedEventById(changeSet, 'evt-midi');
      expect(upsertedIds).toEqual(['evt-midi', 'evt-x']);
      expect(upsertedMidi.title).toBe('Déjeuner client');
      expect(changeSet.removedEventIds).toEqual([]);
    });

    it('T7.11 le changeSet supprime un événement lu puis retiré', () => {
      const composition: EventComposition = standardComposition();
      const removed: EventComposition = calendarEventComposition.removeEvent(composition, 'evt-midi');

      const changeSet: EventChangeSet = calendarEventComposition.toChangeSet(removed);

      expect(changeSet.removedEventIds).toEqual(['evt-midi']);
      expect(changeSet.upsertedEvents).toEqual([]);
    });

    it('T7.12 un événement ajouté puis retiré ne figure pas dans le changeSet', () => {
      const composition: EventComposition = standardComposition();
      const appended: CalendarEvent = addedEvent();
      const withAdded: EventComposition = calendarEventComposition.appendEvent(composition, appended);
      const withdrawn: EventComposition = calendarEventComposition.removeEvent(withAdded, 'evt-x');

      const changeSet: EventChangeSet = calendarEventComposition.toChangeSet(withdrawn);

      expect(changeSet.upsertedEvents).toEqual([]);
      expect(changeSet.removedEventIds).toEqual([]);
    });

    it('T7.13 une composition sans geste donne un changeSet vide', () => {
      const composition: EventComposition = standardComposition();

      const changeSet: EventChangeSet = calendarEventComposition.toChangeSet(composition);

      expect(changeSet.upsertedEvents).toEqual([]);
      expect(changeSet.removedEventIds).toEqual([]);
    });
  });
});
