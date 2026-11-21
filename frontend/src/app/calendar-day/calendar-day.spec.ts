import { DebugElement } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';

import { CalendarDayComponent } from './calendar-day';
import { CalendarDay } from '../core/models/calendar-day.model';
import { CalendarEvent } from '../core/models/calendar-event.model';

/**
 * @file calendar-day.spec.ts
 * @description Black-box TDD tests for `CalendarDayComponent` — part 6 (groups 6.1 to 6.3, cases
 * T060 to T073) of `.agent/CALENDAR/CALENDAR_FEATURE/PLAN_TESTS_CALENDRIER.md`, built on
 * `APPROCHE_CALENDRIER.md` (batches D and E) and `CALENDAR_FEATURE.md` (US1, US4, US5).
 *
 * The component is mounted alone and fed through its inputs: it renders one date of the grid,
 * its events in the order received, and the visual states its parent hands it.
 *
 * DOM contract — **proposed here**, the plan having no contract section. The template must honour
 * it:
 *
 * | Selector / input | Role | Cases |
 * |---|---|---|
 * | input `dayDate` | The `CalendarDay` rendered: a civil date and its events, already sorted | all |
 * | `.day-number` | The day number of the date | T060 |
 * | `.event` · `.event-title` | One visible event, and its title | T061 to T063, T069 to T072 |
 * | inputs `isToday` · `isSelected` · `isOtherMonth` | Visual states handed by the parent (`D-DAY1`) | T063 to T067 |
 * | host `.today` · `.selected` · `.other-month` | The states, rendered on the host (`D-CAL2` of `calendar.spec.ts`) | T063 to T067 |
 * | input `maxVisibleEvents` | Number of events shown at most (`D-DAY2`) | T070 to T072 |
 * | `.more-events` | Indicator of the hidden events, text `+N autres` | T060, T070 to T072 |
 *
 * Decisions taken on 2026-11-18 with the user, for lack of a plan contract — to raise into the
 * plan:
 * - **D-DAY1** — the component receives its states through three boolean inputs (`isToday`,
 *   `isSelected`, `isOtherMonth`, all `false` by default) and sets the matching classes on its own
 *   host; `Calendar` passes them instead of binding the classes itself, so `D-CAL2` still holds.
 * - **D-DAY2** — the display capacity is the input `maxVisibleEvents`, `3` by default: a layout
 *   measured from the real cell height cannot be tested under jsdom, which has no layout.
 * - **D-DAY3** — T068 (long title truncated) and T073 (busy day kept inside its cell) are visual
 *   checks without layout under jsdom: they are verified by hand on a device, not in this spec.
 */

/** The visual states a parent hands a day (`D-DAY1`); an omitted state keeps its default. */
interface DayStateInputs {
  readonly isToday?: boolean;
  readonly isSelected?: boolean;
  readonly isOtherMonth?: boolean;
}

/**
 * Builds a calendar event on a civil date.
 * @param id Identifier of the event.
 * @param date Civil date `YYYY-MM-DD` the event belongs to.
 * @param title Title displayed in the cell.
 * @returns The event.
 */
function makeEvent(id: string, date: string, title: string): CalendarEvent {
  return { id, title, date, start_time: '', end_time: '', note: null };
}

describe('CalendarDay', () => {
  let fixture: ComponentFixture<CalendarDayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarDayComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CalendarDayComponent);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Hands the component the day to render and the visual states its parent decides, then renders
   * it.
   * @param day The `CalendarDay` given to the `dayDate` input.
   * @param states The state inputs of `D-DAY1` to set; the ones left out keep their default.
   */
  async function renderDay(day: CalendarDay, states: DayStateInputs = {}): Promise<void> {
    fixture.componentRef.setInput('dayDate', day);
    const stateEntries: [string, boolean][] = Object.entries(states);
    for (const [inputName, value] of stateEntries) {
      fixture.componentRef.setInput(inputName, value);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /**
   * @param selector A CSS selector of the DOM contract.
   * @returns Every element of the rendered day matching it, in display order.
   */
  function queryAll(selector: string): DebugElement[] {
    return fixture.debugElement.queryAll(By.css(selector));
  }

  /**
   * @param selector A CSS selector of the DOM contract.
   * @returns The trimmed text of the first matching element, or `null` when there is none.
   */
  function textOf(selector: string): string | null {
    const element: DebugElement | null = fixture.debugElement.query(By.css(selector));
    if (element === null) {
      return null;
    }
    const rawText: string = element.nativeElement.textContent;
    return rawText.trim();
  }

  /**
   * @returns The classes of the component host, where the visual states live.
   */
  function hostClassList(): DOMTokenList {
    const host: HTMLElement = fixture.nativeElement;
    return host.classList;
  }

  /**
   * @returns The trimmed titles of the visible events, in display order.
   */
  function displayedTitles(): string[] {
    const titles: DebugElement[] = queryAll('.event-title');
    return titles.map((title: DebugElement): string => {
      const rawText: string = title.nativeElement.textContent;
      return rawText.trim();
    });
  }

  describe("6.1 Affichage d'une journée", () => {
    it("T060 - affiche une journée sans événement : le numéro du jour est affiché et aucun indicateur d'événement n'apparaît", async () => {
      const emptyDay: CalendarDay = { date: '2026-11-15', events: [] };

      await renderDay(emptyDay);

      const dayNumber: string | null = textOf('.day-number');
      const events: DebugElement[] = queryAll('.event');
      const moreEvents: DebugElement[] = queryAll('.more-events');
      expect(dayNumber).toContain('15');
      expect(events).toHaveLength(0);
      expect(moreEvents).toHaveLength(0);
    });

    it("T061 - affiche une journée contenant un seul événement : son titre est affiché dans la case", async () => {
      const dentist: CalendarEvent = makeEvent('e1', '2026-11-15', 'Dentiste');
      const dayWithOneEvent: CalendarDay = { date: '2026-11-15', events: [dentist] };

      await renderDay(dayWithOneEvent);

      const titles: DebugElement[] = queryAll('.event-title');
      const firstTitle: string | null = textOf('.event-title');
      expect(titles).toHaveLength(1);
      expect(firstTitle).toBe('Dentiste');
    });

    it("T062 - affiche une journée contenant plusieurs événements : ils apparaissent dans l'ordre reçu par le composant", async () => {
      const swimming: CalendarEvent = makeEvent('e3', '2026-11-15', 'Piscine');
      const dentist: CalendarEvent = makeEvent('e1', '2026-11-15', 'Dentiste');
      const shopping: CalendarEvent = makeEvent('e2', '2026-11-15', 'Courses');
      const dayWithThreeEvents: CalendarDay = { date: '2026-11-15', events: [swimming, dentist, shopping] };

      await renderDay(dayWithThreeEvents);

      const titles: string[] = displayedTitles();
      expect(titles).toEqual(['Piscine', 'Dentiste', 'Courses']);
    });

    it("T063 - affiche une date d'un mois adjacent : .other-month est appliquée et ses événements restent visibles", async () => {
      const birthday: CalendarEvent = makeEvent('e1', '2026-12-02', 'Anniversaire');
      const adjacentDay: CalendarDay = { date: '2026-12-02', events: [birthday] };

      await renderDay(adjacentDay, { isOtherMonth: true });

      const hostClasses: DOMTokenList = hostClassList();
      const titles: string[] = displayedTitles();
      expect(hostClasses.contains('other-month')).toBe(true);
      expect(titles).toEqual(['Anniversaire']);
    });
  });

  describe('6.2 États visuels', () => {
    it("T064 - affiche une journée correspondant à la date du jour : .today est appliquée", async () => {
      const today: CalendarDay = { date: '2026-11-15', events: [] };

      await renderDay(today, { isToday: true });

      const hostClasses: DOMTokenList = hostClassList();
      expect(hostClasses.contains('today')).toBe(true);
    });

    it("T065 - affiche une journée correspondant à la date sélectionnée : .selected est appliquée", async () => {
      const selectedDay: CalendarDay = { date: '2026-11-20', events: [] };

      await renderDay(selectedDay, { isSelected: true });

      const hostClasses: DOMTokenList = hostClassList();
      expect(hostClasses.contains('selected')).toBe(true);
    });

    it("T066 - affiche une journée à la fois date du jour et date sélectionnée : .today et .selected coexistent", async () => {
      const todaySelected: CalendarDay = { date: '2026-11-15', events: [] };

      await renderDay(todaySelected, { isToday: true, isSelected: true });

      const hostClasses: DOMTokenList = hostClassList();
      expect(hostClasses.contains('today')).toBe(true);
      expect(hostClasses.contains('selected')).toBe(true);
    });

    it("T067 - affiche une journée d'un mois adjacent qui est la date du jour : .other-month et .today sont combinées", async () => {
      const adjacentToday: CalendarDay = { date: '2026-12-01', events: [] };

      await renderDay(adjacentToday, { isOtherMonth: true, isToday: true });

      const hostClasses: DOMTokenList = hostClassList();
      expect(hostClasses.contains('other-month')).toBe(true);
      expect(hostClasses.contains('today')).toBe(true);
    });
  });

  describe("6.3 Troncature et nombre d'événements", () => {
    it("T069 - la troncature d'un titre ne modifie pas la donnée d'origine : le titre complet reste dans le CalendarEvent", async () => {
      const longTitle: string = 'Réunion parents-professeurs au collège Jean Moulin, salle polyvalente du bâtiment B';
      const longEvent: CalendarEvent = makeEvent('e1', '2026-11-15', longTitle);
      const dayWithLongEvent: CalendarDay = { date: '2026-11-15', events: [longEvent] };

      await renderDay(dayWithLongEvent);

      const titles: string[] = displayedTitles();
      expect(longEvent.title).toBe(longTitle);
      expect(titles).toEqual([longTitle]);
    });

    it("T070 - affiche une journée avec plus d'événements que la capacité : les 3 premiers sont affichés et le reste est résumé par +N autres", async () => {
      const busyDay: CalendarDay = {
        date: '2026-11-15',
        events: [
          makeEvent('e1', '2026-11-15', 'Piscine'),
          makeEvent('e2', '2026-11-15', 'Dentiste'),
          makeEvent('e3', '2026-11-15', 'Courses'),
          makeEvent('e4', '2026-11-15', 'Judo'),
          makeEvent('e5', '2026-11-15', 'Anniversaire'),
        ],
      };

      await renderDay(busyDay);

      const titles: string[] = displayedTitles();
      const moreEvents: DebugElement[] = queryAll('.more-events');
      expect(titles).toEqual(['Piscine', 'Dentiste', 'Courses']);
      expect(moreEvents).toHaveLength(1);
    });

    it("T071 - le nombre indiqué dans +N autres correspond exactement aux événements non affichés", async () => {
      const busyDay: CalendarDay = {
        date: '2026-11-15',
        events: [
          makeEvent('e1', '2026-11-15', 'Piscine'),
          makeEvent('e2', '2026-11-15', 'Dentiste'),
          makeEvent('e3', '2026-11-15', 'Courses'),
          makeEvent('e4', '2026-11-15', 'Judo'),
          makeEvent('e5', '2026-11-15', 'Anniversaire'),
        ],
      };
      fixture.componentRef.setInput('maxVisibleEvents', 2);

      await renderDay(busyDay);

      const titles: string[] = displayedTitles();
      const moreEventsText: string | null = textOf('.more-events');
      expect(titles).toEqual(['Piscine', 'Dentiste']);
      expect(moreEventsText).toBe('+3 autres');
    });

    it("T072 - affiche une journée contenant exactement le nombre maximal d'événements visibles : aucun indicateur +N autres", async () => {
      const fullDay: CalendarDay = {
        date: '2026-11-15',
        events: [
          makeEvent('e1', '2026-11-15', 'Piscine'),
          makeEvent('e2', '2026-11-15', 'Dentiste'),
          makeEvent('e3', '2026-11-15', 'Courses'),
        ],
      };

      await renderDay(fullDay);

      const titles: string[] = displayedTitles();
      const moreEvents: DebugElement[] = queryAll('.more-events');
      expect(titles).toEqual(['Piscine', 'Dentiste', 'Courses']);
      expect(moreEvents).toHaveLength(0);
    });
  });
});
