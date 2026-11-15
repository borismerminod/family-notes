import { DebugElement, LOCALE_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Location, registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { Mock, MockInstance, vi } from 'vitest';

import { Calendar } from './calendar';
import { CalendarEvent } from '../core/models/calendar-event.model';
import { CalendarService } from '../core/services/calendar-service';

/**
 * @file calendar.spec.ts
 * @description Black-box TDD tests for the `Calendar` screen — part 5 (groups 5.1 to 5.6, cases
 * T027 to T059) and part 7 (routing and browser history, cases T074 to T085) of
 * `.agent/CALENDAR/CALENDAR_FEATURE/PLAN_TESTS_CALENDRIER.md`, built on `APPROCHE_CALENDRIER.md`
 * (batches A to F) and `CALENDAR_FEATURE.md` (US1 to US6, §4.5).
 *
 * The screen runs behind a **real router** (`RouterTestingHarness`): the URL is the source of
 * truth of the displayed month (§0.1 of the approach), so a case drives the screen through its
 * controls and reads back both the rendered grid and `Router.url`. Its single data source,
 * `CalendarService`, is a test double; « today » is pinned by faking `Date` only, so the zoneless
 * scheduler and the router keep their real timers.
 *
 * Browser history (part 7) is the in-memory one the Angular test platform provides; « back » and
 * « forward » go through `Location`. History entries cannot be counted from the outside, so an
 * extra or a missing entry shows up as a « back » or « forward » that lands on the wrong period.
 *
 * Reference environment (§2.3 of the plan): today is **15 November 2026**, the initial route is
 * `/calendar/2026-11`, the grid holds 6 × 7 = 42 real dates, Monday first. Grid bounds used by the
 * cases:
 *
 * | Month | First cell | Last cell |
 * |---|---|---|
 * | 2024-03 | 2024-02-26 | 2024-04-07 |
 * | 2025-12 | 2025-12-01 | 2026-01-11 |
 * | 2026-01 | 2025-12-29 | 2026-02-08 |
 * | 2026-10 | 2026-09-28 | 2026-11-08 |
 * | 2026-11 | 2026-10-26 | 2026-12-06 |
 * | 2026-12 | 2026-11-30 | 2027-01-10 |
 * | 2027-01 | 2026-12-28 | 2027-02-07 |
 *
 * DOM contract — **proposed here**, the plan having no contract section. The template must honour
 * it:
 *
 * | Selector | Role | Cases |
 * |---|---|---|
 * | `.month-title` | Header of the screen; its text names the displayed period in French (`novembre 2026`) | T027, T040 to T043 |
 * | `.weekday` | The seven column headers, in display order | T030 |
 * | `app-calendar-day` | One host per grid cell, in display order, its `dayDate` input carrying the `CalendarDay` | all |
 * | `app-calendar-day.other-month` · `.today` · `.selected` | States of a cell, set **on the host** | T031 to T039 |
 * | `.day-cell` | Touch target of a cell (inside the host); a click selects the date | T034 to T039, T052 |
 * | `.event-title` | Title of one event, rendered inside the cell of its date | T050 to T059 |
 * | `button[aria-label="Mois précédent"]` · `button[aria-label="Mois suivant"]` | The two arrows | T040 to T044, T051, T058, T059 |
 * | `input[type="month"]` | The period selector, value `YYYY-MM`, committed on `change`, with an `aria-label` | T045 to T048 |
 * | `button` whose text is `Aujourd'hui` | Back to the month holding today | T049 |
 * | `.events-loading` | Discreet loading state, present only while the events are being fetched | T056 |
 * | `.events-error` | Discreet error state, present only after a failed fetch | T053, T057, T058 |
 *
 * Decisions taken here for lack of a plan contract — to raise into the plan, or to reverse before
 * the screen is written:
 * - **D-CAL1** — the route parameter is **`:selectedMonth`** (`/calendar/:selectedMonth`, §0.1
 *   and §3 batch C of the approach), not the `:selectedMonthDate` of the current `app.routes.ts`:
 *   the feature (§4.5) asks for the two names not to coexist, and the approach settles on the
 *   former. These cases declare that route themselves.
 * - **D-CAL2** — `.today`, `.selected` and `.other-month` are set on the `app-calendar-day` host,
 *   where `.other-month` already lives, so the three states read the same way.
 * - **D-CAL3** — a cell is designated by the `date` of the `CalendarDay` it receives: that input is
 *   the contract between `Calendar` and `CalendarDayComponent` that T029 asserts, and it keeps
 *   these cases independent of how a day number is formatted (part 6 of the plan).
 * - **D-CAL4** — the displayed period is read from the grid itself: the cells **without**
 *   `.other-month` are exactly the days of the displayed month.
 * - **D-CAL5** — the events of a grid are fetched by **one** call to
 *   `getEventsFromRangedDate({ start, end })` whose bounds are the first and last cells (§0.2 and
 *   batch A of the approach, current signature of the service).
 * - **D-CAL6** — clicking a date of the displayed month only changes the selection: the URL stays
 *   put and nothing is fetched again (batch D of the approach). A date of an adjacent month
 *   navigates to its month and stays selected there.
 * - **D-CAL7** — T033 moves « today » to **2 December 2026**: with the reference today
 *   (15 November) no grid but November's holds it, so the case could not show a today outside the
 *   displayed month.
 */

/** Routes of the cases: the calendar alone, behind the parameter of `D-CAL1`. */
const CALENDAR_ROUTES: Routes = [{ path: 'calendar/:selectedMonth', component: Calendar }];

/** The reference « today » of §2.3 of the plan, as a local civil instant (never UTC). */
const REFERENCE_TODAY: Date = new Date(2026, 10, 15, 9, 0, 0);

/** Inclusive interval of civil dates the screen asks the service for. */
interface DateRange {
  readonly start: string;
  readonly end: string;
}

/** Shape of the `CalendarService` double: the single read the screen is allowed to make. */
interface CalendarServiceDouble {
  readonly getEventsFromRangedDate: Mock<(range: DateRange) => Promise<CalendarEvent[]>>;
}

/** A promise whose settlement the case controls, to hold a fetch in flight. */
interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

/**
 * Builds a calendar event on a civil date.
 * @param id Identifier of the event.
 * @param date Civil date `YYYY-MM-DD` the event belongs to.
 * @param title Title displayed in the cell.
 * @param startTime Optional `HH:mm` start time, empty when the event has none.
 * @returns The event.
 */
function makeEvent(id: string, date: string, title: string, startTime: string = ''): CalendarEvent {
  return { id, title, date, start_time: startTime, end_time: '', noteIds: [] };
}

/**
 * Builds a promise settled from the outside.
 * @returns The promise and its two settlement functions.
 */
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise: Promise<T> = new Promise<T>((onResolve: (value: T) => void, onReject: (reason: unknown) => void): void => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('Calendar', () => {
  let harness: RouterTestingHarness;
  let router: Router;
  let location: Location;
  let calendarService: CalendarServiceDouble;

  /**
   * Answers every fetch from a table keyed by the **first date of the requested grid**, so a case
   * states which events each month holds; a grid missing from the table holds none.
   * @param eventsByGridStart Events returned for each grid, keyed by its first cell.
   */
  function serveEventsByGridStart(eventsByGridStart: Record<string, CalendarEvent[]>): void {
    calendarService.getEventsFromRangedDate.mockImplementation((range: DateRange): Promise<CalendarEvent[]> => {
      const events: CalendarEvent[] = eventsByGridStart[range.start] ?? [];
      return Promise.resolve(events);
    });
  }

  /**
   * Lets pending promises, the router and the zoneless scheduler settle, then renders the view.
   */
  async function settle(): Promise<void> {
    await new Promise<void>((done: () => void): void => {
      setTimeout(done);
    });
    await harness.fixture.whenStable();
    harness.detectChanges();
  }

  /**
   * Opens the calendar on a URL and waits until the grid and its events are rendered. The router's
   * initial navigation is run first, as the application bootstrap does: it is what makes the router
   * listen to the browser history, so « back » and « forward » restore a period (part 7).
   * @param url The URL to open, e.g. `/calendar/2026-11`.
   */
  async function openCalendarAt(url: string): Promise<void> {
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    router.initialNavigation();
    await harness.navigateByUrl(url, Calendar);
    await settle();
  }

  /**
   * Goes one entry back in the browser history, as the user pressing « back », then waits until the
   * restored period is rendered.
   */
  async function goBack(): Promise<void> {
    location.back();
    await settle();
  }

  /**
   * Goes one entry forward in the browser history, as the user pressing « forward », then waits until
   * the restored period is rendered.
   */
  async function goForward(): Promise<void> {
    location.forward();
    await settle();
  }

  /**
   * @returns Every cell host of the grid, in display order.
   */
  function dayCells(): DebugElement[] {
    return harness.fixture.debugElement.queryAll(By.css('app-calendar-day'));
  }

  /**
   * Civil date a cell receives (`D-CAL3`).
   * @param cell A cell host.
   * @returns Its `YYYY-MM-DD` date.
   */
  function dateOf(cell: DebugElement): string {
    return cell.componentInstance.dayDate().date;
  }

  /**
   * @returns The dates of the 42 cells, in display order.
   */
  function gridDates(): string[] {
    const cells: DebugElement[] = dayCells();
    return cells.map((cell: DebugElement): string => dateOf(cell));
  }

  /**
   * Dates of the cells carrying a state class on their host (`D-CAL2`).
   * @param stateClass `other-month`, `today` or `selected`.
   * @returns The dates of those cells, in display order.
   */
  function datesWithState(stateClass: string): string[] {
    const cells: DebugElement[] = dayCells();
    const cellsInState: DebugElement[] = cells.filter((cell: DebugElement): boolean => cell.nativeElement.classList.contains(stateClass));
    return cellsInState.map((cell: DebugElement): string => dateOf(cell));
  }

  /**
   * Days of the displayed month: the cells without `.other-month` (`D-CAL4`).
   * @returns Their dates, in display order.
   */
  function displayedMonthDates(): string[] {
    const cells: DebugElement[] = dayCells();
    const cellsOfDisplayedMonth: DebugElement[] = cells.filter((cell: DebugElement): boolean => !cell.nativeElement.classList.contains('other-month'));
    return cellsOfDisplayedMonth.map((cell: DebugElement): string => dateOf(cell));
  }

  /**
   * Finds the cell of a civil date.
   * @param date `YYYY-MM-DD` date of the cell.
   * @returns Its host; the case fails if the grid does not hold that date.
   */
  function cellOf(date: string): DebugElement {
    const cells: DebugElement[] = dayCells();
    const cell: DebugElement | undefined = cells.find((candidate: DebugElement): boolean => dateOf(candidate) === date);
    if (cell === undefined) {
      throw new Error(`No cell for ${date} in the grid`);
    }
    return cell;
  }

  /**
   * Titles of the events rendered inside the cell of a date.
   * @param date `YYYY-MM-DD` date of the cell.
   * @returns The trimmed titles, in display order.
   */
  function eventTitlesOn(date: string): string[] {
    const cell: DebugElement = cellOf(date);
    const titles: DebugElement[] = cell.queryAll(By.css('.event-title'));
    return titles.map((title: DebugElement): string => title.nativeElement.textContent.trim());
  }

  /**
   * Dates of the cells rendering at least one event.
   * @returns Those dates, in display order.
   */
  function datesWithEvents(): string[] {
    const cells: DebugElement[] = dayCells();
    const cellsWithEvents: DebugElement[] = cells.filter((cell: DebugElement): boolean => cell.queryAll(By.css('.event-title')).length > 0);
    return cellsWithEvents.map((cell: DebugElement): string => dateOf(cell));
  }

  /**
   * @returns The trimmed text of the screen header.
   */
  function monthTitleText(): string {
    const title: DebugElement = harness.fixture.debugElement.query(By.css('.month-title'));
    return title.nativeElement.textContent.trim();
  }

  /**
   * URL naming the period the grid actually displays, read from its first day of month (`D-CAL4`).
   * @returns `/calendar/YYYY-MM` of the displayed month.
   */
  function displayedPeriodUrl(): string {
    const monthDates: string[] = displayedMonthDates();
    const firstDayOfMonth: string = monthDates[0];
    const displayedPeriod: string = firstDayOfMonth.slice(0, 7);
    return `/calendar/${displayedPeriod}`;
  }

  /**
   * Finds an element of the screen by CSS selector.
   * @param selector The CSS selector.
   * @returns The element, or `null` when the screen does not render it.
   */
  function find(selector: string): HTMLElement | null {
    const element: DebugElement | null = harness.fixture.debugElement.query(By.css(selector));
    return element === null ? null : element.nativeElement;
  }

  /**
   * Clicks a button found by its accessible label or, failing that, its text.
   * @param label `aria-label` or trimmed text of the button.
   */
  async function clickButton(label: string): Promise<void> {
    const buttons: DebugElement[] = harness.fixture.debugElement.queryAll(By.css('button'));
    const button: DebugElement | undefined = buttons.find((candidate: DebugElement): boolean => {
      const element: HTMLButtonElement = candidate.nativeElement;
      const text: string = element.textContent?.trim() ?? '';
      return element.getAttribute('aria-label') === label || text === label;
    });
    if (button === undefined) {
      throw new Error(`No button labelled "${label}"`);
    }
    button.nativeElement.click();
    await settle();
  }

  /**
   * Clicks the touch target of the cell of a date.
   * @param date `YYYY-MM-DD` date of the cell.
   */
  async function clickDay(date: string): Promise<void> {
    const cell: DebugElement = cellOf(date);
    const touchTarget: DebugElement = cell.query(By.css('.day-cell'));
    touchTarget.nativeElement.click();
    await settle();
  }

  /**
   * @returns The period selector of the header.
   */
  function monthInput(): HTMLInputElement {
    return find('input[type="month"]') as HTMLInputElement;
  }

  /**
   * Picks a period in the selector, as a user committing a choice.
   * @param period `YYYY-MM` value to choose.
   */
  async function chooseMonth(period: string): Promise<void> {
    const input: HTMLInputElement = monthInput();
    input.value = period;
    input.dispatchEvent(new Event('change'));
    await settle();
  }

  beforeEach(async () => {
    registerLocaleData(localeFr);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(REFERENCE_TODAY);

    calendarService = { getEventsFromRangedDate: vi.fn().mockResolvedValue([]) };

    await TestBed.configureTestingModule({
      providers: [
        provideRouter(CALENDAR_ROUTES),
        { provide: CalendarService, useValue: calendarService },
        { provide: LOCALE_ID, useValue: 'fr-FR' },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('5.1 Initialisation et affichage', () => {
    it("T027 - ouvre le calendrier sur /calendar/2026-11 : affiche novembre 2026 et construit la grille correspondante", async () => {
      await openCalendarAt('/calendar/2026-11');

      const title: string = monthTitleText();
      const cellCount: number = dayCells().length;
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];
      const lastDayOfMonth: string = monthDates[monthDates.length - 1];

      expect(title).toContain('novembre 2026');
      expect(cellCount).toBe(42);
      expect(monthDates.length).toBe(30);
      expect(firstDayOfMonth).toBe('2026-11-01');
      expect(lastDayOfMonth).toBe('2026-11-30');
    });

    it("T028 - ouvre le calendrier sans période valide dans l'URL : affiche le mois courant sans erreur bloquante", async () => {
      await openCalendarAt('/calendar/pas-une-periode');

      const cellCount: number = dayCells().length;
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];
      const lastDayOfMonth: string = monthDates[monthDates.length - 1];

      expect(cellCount).toBe(42);
      expect(firstDayOfMonth).toBe('2026-11-01');
      expect(lastDayOfMonth).toBe('2026-11-30');
    });

    it('T029 - initialise une grille de 42 jours : les 42 dates sont transmises aux composants de journée', async () => {
      await openCalendarAt('/calendar/2026-11');

      const transmittedDates: string[] = gridDates();

      expect(transmittedDates).toEqual([
        '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
        '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
        '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
        '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22',
        '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29',
        '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06',
      ]);
    });

    it("T030 - affiche les en-têtes de semaine dans l'ordre lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche", async () => {
      await openCalendarAt('/calendar/2026-11');

      const headers: DebugElement[] = harness.fixture.debugElement.queryAll(By.css('.weekday'));
      const headerTexts: string[] = headers.map((header: DebugElement): string => header.nativeElement.textContent.trim());

      expect(headerTexts).toEqual(['L', 'M', 'M', 'J', 'V', 'S', 'D']);
    });

    it('T031 - affiche les dates des mois adjacents dans la grille, visuellement différenciées du mois affiché', async () => {
      await openCalendarAt('/calendar/2026-11');

      const adjacentDates: string[] = datesWithState('other-month');

      expect(adjacentDates).toEqual([
        '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31',
        '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06',
      ]);
    });
  });

  describe('5.2 Date du jour et date sélectionnée', () => {
    it("T032 - identifie la date du jour quand le mois affiché la contient : elle reçoit l'état .today", async () => {
      await openCalendarAt('/calendar/2026-11');

      const todayDates: string[] = datesWithState('today');

      expect(todayDates).toEqual(['2026-11-15']);
    });

    it("T033 - identifie la date du jour quand le mois affiché est différent du mois courant, si elle est dans la grille", async () => {
      const todayInDecember: Date = new Date(2026, 11, 2, 9, 0, 0);
      vi.setSystemTime(todayInDecember);
      await openCalendarAt('/calendar/2026-11');

      const todayDates: string[] = datesWithState('today');
      const adjacentDates: string[] = datesWithState('other-month');

      expect(todayDates).toEqual(['2026-12-02']);
      expect(adjacentDates).toContain('2026-12-02');
    });

    it("T034 - sélectionne une date du mois affiché : elle reçoit l'état .selected", async () => {
      await openCalendarAt('/calendar/2026-11');

      await clickDay('2026-11-20');
      const selectedDates: string[] = datesWithState('selected');

      expect(selectedDates).toEqual(['2026-11-20']);
    });

    it('T035 - sélectionne successivement deux dates : seule la dernière conserve .selected', async () => {
      await openCalendarAt('/calendar/2026-11');

      await clickDay('2026-11-10');
      await clickDay('2026-11-20');
      const selectedDates: string[] = datesWithState('selected');

      expect(selectedDates).toEqual(['2026-11-20']);
    });

    it('T036 - sélectionne la date du jour : .today et .selected sont présents simultanément', async () => {
      await openCalendarAt('/calendar/2026-11');

      await clickDay('2026-11-15');
      const todayCell: HTMLElement = cellOf('2026-11-15').nativeElement;
      const isToday: boolean = todayCell.classList.contains('today');
      const isSelected: boolean = todayCell.classList.contains('selected');
      const selectedDates: string[] = datesWithState('selected');

      expect(isToday).toBe(true);
      expect(isSelected).toBe(true);
      expect(selectedDates).toEqual(['2026-11-15']);
    });

    it("T037 - sélectionne une date du mois suivant : elle est sélectionnée et le calendrier affiche son mois", async () => {
      await openCalendarAt('/calendar/2026-11');

      await clickDay('2026-12-02');
      const url: string = router.url;
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];
      const selectedDates: string[] = datesWithState('selected');

      expect(url).toBe('/calendar/2026-12');
      expect(firstDayOfMonth).toBe('2026-12-01');
      expect(selectedDates).toEqual(['2026-12-02']);
    });

    it("T038 - sélectionne une date sans déclencher aucune opération d'écriture", async () => {
      await openCalendarAt('/calendar/2026-11');
      const callsBeforeSelection: number = calendarService.getEventsFromRangedDate.mock.calls.length;

      await clickDay('2026-11-20');
      const callsAfterSelection: number = calendarService.getEventsFromRangedDate.mock.calls.length;
      const url: string = router.url;

      expect(callsAfterSelection).toBe(callsBeforeSelection);
      expect(url).toBe('/calendar/2026-11');
    });

    it('T039 - sélectionne une date qui ne possède aucun événement : elle est sélectionnée normalement', async () => {
      const meeting: CalendarEvent = makeEvent('e1', '2026-11-10', 'Réunion');
      serveEventsByGridStart({ '2026-10-26': [meeting] });
      await openCalendarAt('/calendar/2026-11');

      await clickDay('2026-11-12');
      const selectedDates: string[] = datesWithState('selected');
      const titlesOnSelectedDate: string[] = eventTitlesOn('2026-11-12');

      expect(selectedDates).toEqual(['2026-11-12']);
      expect(titlesOnSelectedDate).toEqual([]);
    });
  });

  describe('5.3 Navigation mensuelle', () => {
    it("T040 - passe au mois suivant depuis novembre 2026 : affiche décembre 2026 et l'URL devient /calendar/2026-12", async () => {
      await openCalendarAt('/calendar/2026-11');

      await clickButton('Mois suivant');
      const url: string = router.url;
      const title: string = monthTitleText();
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];
      const lastDayOfMonth: string = monthDates[monthDates.length - 1];

      expect(url).toBe('/calendar/2026-12');
      expect(title).toContain('décembre 2026');
      expect(firstDayOfMonth).toBe('2026-12-01');
      expect(lastDayOfMonth).toBe('2026-12-31');
    });

    it("T041 - passe au mois précédent depuis novembre 2026 : affiche octobre 2026 et l'URL devient /calendar/2026-10", async () => {
      await openCalendarAt('/calendar/2026-11');

      await clickButton('Mois précédent');
      const url: string = router.url;
      const title: string = monthTitleText();
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];
      const lastDayOfMonth: string = monthDates[monthDates.length - 1];

      expect(url).toBe('/calendar/2026-10');
      expect(title).toContain('octobre 2026');
      expect(firstDayOfMonth).toBe('2026-10-01');
      expect(lastDayOfMonth).toBe('2026-10-31');
    });

    it("T042 - passe au mois suivant depuis décembre : affiche janvier de l'année suivante, année mise à jour dans l'URL", async () => {
      await openCalendarAt('/calendar/2026-12');

      await clickButton('Mois suivant');
      const url: string = router.url;
      const title: string = monthTitleText();
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];

      expect(url).toBe('/calendar/2027-01');
      expect(title).toContain('janvier 2027');
      expect(firstDayOfMonth).toBe('2027-01-01');
    });

    it("T043 - passe au mois précédent depuis janvier : affiche décembre de l'année précédente, année mise à jour dans l'URL", async () => {
      await openCalendarAt('/calendar/2026-01');

      await clickButton('Mois précédent');
      const url: string = router.url;
      const title: string = monthTitleText();
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];

      expect(url).toBe('/calendar/2025-12');
      expect(title).toContain('décembre 2025');
      expect(firstDayOfMonth).toBe('2025-12-01');
    });

    it("T044 - enchaîne plusieurs navigations suivantes et précédentes : la période et l'URL suivent chaque changement", async () => {
      await openCalendarAt('/calendar/2026-11');
      const visitedUrls: string[] = [];

      await clickButton('Mois suivant');
      visitedUrls.push(router.url);
      await clickButton('Mois suivant');
      visitedUrls.push(router.url);
      await clickButton('Mois précédent');
      visitedUrls.push(router.url);
      await clickButton('Mois précédent');
      visitedUrls.push(router.url);
      await clickButton('Mois précédent');
      visitedUrls.push(router.url);
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];

      expect(visitedUrls).toEqual([
        '/calendar/2026-12',
        '/calendar/2027-01',
        '/calendar/2026-12',
        '/calendar/2026-11',
        '/calendar/2026-10',
      ]);
      expect(firstDayOfMonth).toBe('2026-10-01');
    });
  });

  describe("5.4 Sélecteur de période et retour à aujourd'hui", () => {
    it("T045 - affiche le sélecteur de mois et d'année, qui présente la période affichée", async () => {
      await openCalendarAt('/calendar/2026-11');

      const input: HTMLInputElement | null = find('input[type="month"]') as HTMLInputElement | null;
      const value: string | undefined = input?.value;
      const accessibleLabel: string = input?.getAttribute('aria-label') ?? '';

      expect(input).not.toBeNull();
      expect(value).toBe('2026-11');
      expect(accessibleLabel).not.toBe('');
    });

    it("T046 - sélectionne un mois différent dans la même année : le calendrier l'affiche et l'URL est mise à jour", async () => {
      await openCalendarAt('/calendar/2026-11');

      await chooseMonth('2026-03');
      const url: string = router.url;
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];
      const lastDayOfMonth: string = monthDates[monthDates.length - 1];

      expect(url).toBe('/calendar/2026-03');
      expect(firstDayOfMonth).toBe('2026-03-01');
      expect(lastDayOfMonth).toBe('2026-03-31');
    });

    it("T047 - sélectionne un mois d'une autre année : la période choisie est affichée et l'URL respecte /calendar/YYYY-MM", async () => {
      await openCalendarAt('/calendar/2026-11');

      await chooseMonth('2028-02');
      const url: string = router.url;
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];
      const lastDayOfMonth: string = monthDates[monthDates.length - 1];

      expect(url).toBe('/calendar/2028-02');
      expect(firstDayOfMonth).toBe('2028-02-01');
      expect(lastDayOfMonth).toBe('2028-02-29');
    });

    it("T048 - sélectionne la période déjà affichée : aucun changement de période ni d'historique", async () => {
      await openCalendarAt('/calendar/2026-11');
      const navigateSpy: MockInstance = vi.spyOn(router, 'navigate');
      const navigateByUrlSpy: MockInstance = vi.spyOn(router, 'navigateByUrl');
      const callsBeforeChoice: number = calendarService.getEventsFromRangedDate.mock.calls.length;

      await chooseMonth('2026-11');
      const callsAfterChoice: number = calendarService.getEventsFromRangedDate.mock.calls.length;
      const url: string = router.url;

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(navigateByUrlSpy).not.toHaveBeenCalled();
      expect(callsAfterChoice).toBe(callsBeforeChoice);
      expect(url).toBe('/calendar/2026-11');
    });

    it("T049 - utilise le bouton « Aujourd'hui » depuis une période éloignée : revient au mois du jour et met l'URL à jour", async () => {
      await openCalendarAt('/calendar/2024-03');

      await clickButton("Aujourd'hui");
      const url: string = router.url;
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];
      const todayDates: string[] = datesWithState('today');

      expect(url).toBe('/calendar/2026-11');
      expect(firstDayOfMonth).toBe('2026-11-01');
      expect(todayDates).toEqual(['2026-11-15']);
    });
  });

  describe('5.5 Chargement des événements', () => {
    it("T050 - charge les événements à l'ouverture d'un mois : la plage des 42 dates est récupérée et regroupée par journée", async () => {
      const octoberEvent: CalendarEvent = makeEvent('e1', '2026-10-26', 'Brocante');
      const novemberEvent: CalendarEvent = makeEvent('e2', '2026-11-15', 'Anniversaire');
      const decemberEvent: CalendarEvent = makeEvent('e3', '2026-12-06', 'Saint-Nicolas');
      serveEventsByGridStart({ '2026-10-26': [octoberEvent, novemberEvent, decemberEvent] });

      await openCalendarAt('/calendar/2026-11');
      const requestedRange: DateRange = { start: '2026-10-26', end: '2026-12-06' };
      const titlesOnFirstCell: string[] = eventTitlesOn('2026-10-26');
      const titlesOnNovemberDate: string[] = eventTitlesOn('2026-11-15');
      const titlesOnLastCell: string[] = eventTitlesOn('2026-12-06');

      expect(calendarService.getEventsFromRangedDate).toHaveBeenCalledTimes(1);
      expect(calendarService.getEventsFromRangedDate).toHaveBeenCalledWith(requestedRange);
      expect(titlesOnFirstCell).toEqual(['Brocante']);
      expect(titlesOnNovemberDate).toEqual(['Anniversaire']);
      expect(titlesOnLastCell).toEqual(['Saint-Nicolas']);
    });

    it('T051 - charge les événements après une navigation : ceux de la nouvelle grille remplacent ceux de la période précédente', async () => {
      const novemberGridEvent: CalendarEvent = makeEvent('e1', '2026-11-30', 'Ancienne période');
      const decemberGridEvent: CalendarEvent = makeEvent('e2', '2026-12-15', 'Nouvelle période');
      serveEventsByGridStart({
        '2026-10-26': [novemberGridEvent],
        '2026-11-30': [decemberGridEvent],
      });
      await openCalendarAt('/calendar/2026-11');

      await clickButton('Mois suivant');
      const requestedRange: DateRange = { start: '2026-11-30', end: '2027-01-10' };
      const titlesOnSharedDate: string[] = eventTitlesOn('2026-11-30');
      const titlesOnNewDate: string[] = eventTitlesOn('2026-12-15');

      expect(calendarService.getEventsFromRangedDate).toHaveBeenLastCalledWith(requestedRange);
      expect(titlesOnSharedDate).toEqual([]);
      expect(titlesOnNewDate).toEqual(['Nouvelle période']);
    });

    it("T052 - charge les événements après la sélection d'une date d'un mois adjacent : la nouvelle période affichée est chargée", async () => {
      const decemberGridEvent: CalendarEvent = makeEvent('e1', '2026-12-20', 'Vacances');
      serveEventsByGridStart({ '2026-11-30': [decemberGridEvent] });
      await openCalendarAt('/calendar/2026-11');

      await clickDay('2026-12-02');
      const requestedRange: DateRange = { start: '2026-11-30', end: '2027-01-10' };
      const titlesOnNewDate: string[] = eventTitlesOn('2026-12-20');

      expect(calendarService.getEventsFromRangedDate).toHaveBeenLastCalledWith(requestedRange);
      expect(titlesOnNewDate).toEqual(['Vacances']);
    });

    it("T053 - affiche un mois sans événement : la grille reste normale et aucune erreur n'est signalée", async () => {
      await openCalendarAt('/calendar/2026-11');

      const cellCount: number = dayCells().length;
      const datesHoldingEvents: string[] = datesWithEvents();
      const errorState: HTMLElement | null = find('.events-error');

      expect(cellCount).toBe(42);
      expect(datesHoldingEvents).toEqual([]);
      expect(errorState).toBeNull();
    });

    it("T054 - n'affiche aucun événement dans une mauvaise journée : chacun n'apparaît que dans la case de sa date civile", async () => {
      const novemberEvent: CalendarEvent = makeEvent('e1', '2026-11-15', 'Dentiste');
      const decemberEvent: CalendarEvent = makeEvent('e2', '2026-12-03', 'Concert');
      serveEventsByGridStart({ '2026-10-26': [novemberEvent, decemberEvent] });

      await openCalendarAt('/calendar/2026-11');
      const datesHoldingEvents: string[] = datesWithEvents();
      const titlesOnNovemberDate: string[] = eventTitlesOn('2026-11-15');
      const titlesOnDecemberDate: string[] = eventTitlesOn('2026-12-03');

      expect(datesHoldingEvents).toEqual(['2026-11-15', '2026-12-03']);
      expect(titlesOnNovemberDate).toEqual(['Dentiste']);
      expect(titlesOnDecemberDate).toEqual(['Concert']);
    });
  });

  describe('5.6 Chargement et erreurs', () => {
    it('T055 - affiche le calendrier pendant la récupération des événements : la grille est consultable', async () => {
      const pendingFetch: Deferred<CalendarEvent[]> = deferred<CalendarEvent[]>();
      calendarService.getEventsFromRangedDate.mockReturnValue(pendingFetch.promise);

      await openCalendarAt('/calendar/2026-11');
      const cellCount: number = dayCells().length;
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];

      expect(cellCount).toBe(42);
      expect(firstDayOfMonth).toBe('2026-11-01');
    });

    it("T056 - affiche les événements après une récupération réussie : ils sont dans leurs journées et l'état de chargement disparaît", async () => {
      const pendingFetch: Deferred<CalendarEvent[]> = deferred<CalendarEvent[]>();
      calendarService.getEventsFromRangedDate.mockReturnValue(pendingFetch.promise);
      await openCalendarAt('/calendar/2026-11');
      const loadingStateWhilePending: HTMLElement | null = find('.events-loading');

      const meeting: CalendarEvent = makeEvent('e1', '2026-11-18', 'Réunion parents');
      pendingFetch.resolve([meeting]);
      await settle();
      const loadingStateAfterFetch: HTMLElement | null = find('.events-loading');
      const titlesOnMeetingDate: string[] = eventTitlesOn('2026-11-18');

      expect(loadingStateWhilePending).not.toBeNull();
      expect(loadingStateAfterFetch).toBeNull();
      expect(titlesOnMeetingDate).toEqual(['Réunion parents']);
    });

    it("T057 - échoue à récupérer les événements : la grille reste consultable et un état d'erreur discret est présenté", async () => {
      const databaseFailure: Error = new Error('Erreur lors de la récupération des événements');
      calendarService.getEventsFromRangedDate.mockRejectedValue(databaseFailure);

      await openCalendarAt('/calendar/2026-11');
      const cellCount: number = dayCells().length;
      const errorState: HTMLElement | null = find('.events-error');

      expect(cellCount).toBe(42);
      expect(errorState).not.toBeNull();
    });

    it("T058 - distingue une récupération réussie sans résultat d'une récupération en erreur", async () => {
      const databaseFailure: Error = new Error('Erreur lors de la récupération des événements');
      calendarService.getEventsFromRangedDate.mockImplementation((range: DateRange): Promise<CalendarEvent[]> => {
        const isNovemberGrid: boolean = range.start === '2026-10-26';
        return isNovemberGrid ? Promise.resolve([]) : Promise.reject(databaseFailure);
      });
      await openCalendarAt('/calendar/2026-11');
      const errorStateOnEmptyMonth: HTMLElement | null = find('.events-error');

      await clickButton('Mois suivant');
      const errorStateOnFailedMonth: HTMLElement | null = find('.events-error');

      expect(errorStateOnEmptyMonth).toBeNull();
      expect(errorStateOnFailedMonth).not.toBeNull();
    });

    it("T059 - navigue vers un autre mois pendant une récupération : les résultats de l'ancienne période ne remplacent pas ceux de la période affichée", async () => {
      const novemberFetch: Deferred<CalendarEvent[]> = deferred<CalendarEvent[]>();
      const decemberEvent: CalendarEvent = makeEvent('e2', '2026-12-15', 'Marché de Noël');
      calendarService.getEventsFromRangedDate.mockImplementation((range: DateRange): Promise<CalendarEvent[]> => {
        const isNovemberGrid: boolean = range.start === '2026-10-26';
        return isNovemberGrid ? novemberFetch.promise : Promise.resolve([decemberEvent]);
      });
      await openCalendarAt('/calendar/2026-11');
      await clickButton('Mois suivant');

      const staleEvent: CalendarEvent = makeEvent('e1', '2026-11-30', 'Période périmée');
      novemberFetch.resolve([staleEvent]);
      await settle();
      const url: string = router.url;
      const titlesOnSharedDate: string[] = eventTitlesOn('2026-11-30');
      const titlesOnDecemberDate: string[] = eventTitlesOn('2026-12-15');

      expect(url).toBe('/calendar/2026-12');
      expect(titlesOnSharedDate).toEqual([]);
      expect(titlesOnDecemberDate).toEqual(['Marché de Noël']);
    });
  });

  describe("7. Routage et historique navigateur", () => {
    it("T074 - ouvre directement l'URL valide /calendar/2026-11 : le calendrier affiche novembre 2026", async () => {
      await openCalendarAt('/calendar/2026-11');

      const url: string = router.url;
      const title: string = monthTitleText();
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];
      const lastDayOfMonth: string = monthDates[monthDates.length - 1];

      expect(url).toBe('/calendar/2026-11');
      expect(title).toContain('novembre 2026');
      expect(firstDayOfMonth).toBe('2026-11-01');
      expect(lastDayOfMonth).toBe('2026-11-30');
    });

    it("T075 - ouvre une URL dont le mois est inférieur à 01 : le calendrier revient au mois courant sans erreur bloquante", async () => {
      await openCalendarAt('/calendar/2026-00');

      const url: string = router.url;
      const cellCount: number = dayCells().length;
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];
      const lastDayOfMonth: string = monthDates[monthDates.length - 1];

      expect(url).toBe('/calendar/2026-11');
      expect(cellCount).toBe(42);
      expect(firstDayOfMonth).toBe('2026-11-01');
      expect(lastDayOfMonth).toBe('2026-11-30');
    });

    it("T076 - ouvre une URL dont le mois est supérieur à 12 : le calendrier revient au mois courant sans erreur bloquante", async () => {
      await openCalendarAt('/calendar/2026-13');

      const url: string = router.url;
      const cellCount: number = dayCells().length;
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];
      const lastDayOfMonth: string = monthDates[monthDates.length - 1];

      expect(url).toBe('/calendar/2026-11');
      expect(cellCount).toBe(42);
      expect(firstDayOfMonth).toBe('2026-11-01');
      expect(lastDayOfMonth).toBe('2026-11-30');
    });

    it("T077 - ouvre une URL dont le format de période est invalide : le calendrier revient au mois courant sans erreur bloquante", async () => {
      await openCalendarAt('/calendar/2026-1');

      const url: string = router.url;
      const cellCount: number = dayCells().length;
      const monthDates: string[] = displayedMonthDates();
      const firstDayOfMonth: string = monthDates[0];
      const lastDayOfMonth: string = monthDates[monthDates.length - 1];

      expect(url).toBe('/calendar/2026-11');
      expect(cellCount).toBe(42);
      expect(firstDayOfMonth).toBe('2026-11-01');
      expect(lastDayOfMonth).toBe('2026-11-30');
    });

    it("T078 - navigue de mois en mois avec les flèches : l'URL reflète toujours la période affichée", async () => {
      await openCalendarAt('/calendar/2026-11');
      const visitedUrls: string[] = [];
      const displayedPeriodUrls: string[] = [];

      await clickButton('Mois précédent');
      visitedUrls.push(router.url);
      displayedPeriodUrls.push(displayedPeriodUrl());
      await clickButton('Mois suivant');
      visitedUrls.push(router.url);
      displayedPeriodUrls.push(displayedPeriodUrl());
      await clickButton('Mois suivant');
      visitedUrls.push(router.url);
      displayedPeriodUrls.push(displayedPeriodUrl());

      expect(visitedUrls).toEqual(['/calendar/2026-10', '/calendar/2026-11', '/calendar/2026-12']);
      expect(displayedPeriodUrls).toEqual(visitedUrls);
    });

    it("T079 - sélectionne une nouvelle période dans le sélecteur : l'URL correspond à la période sélectionnée", async () => {
      await openCalendarAt('/calendar/2026-11');

      await chooseMonth('2027-06');
      const url: string = router.url;
      const periodUrl: string = displayedPeriodUrl();

      expect(url).toBe('/calendar/2027-06');
      expect(periodUrl).toBe(url);
    });

    it("T080 - revient à aujourd'hui depuis une autre période : l'URL correspond au mois courant", async () => {
      await openCalendarAt('/calendar/2025-03');

      await clickButton("Aujourd'hui");
      const url: string = router.url;
      const periodUrl: string = displayedPeriodUrl();

      expect(url).toBe('/calendar/2026-11');
      expect(periodUrl).toBe(url);
    });

    it("T081 - change explicitement de période de chaque façon : chaque changement crée une entrée d'historique", async () => {
      await openCalendarAt('/calendar/2026-11');
      await clickButton('Mois suivant');
      await chooseMonth('2028-02');
      await clickButton("Aujourd'hui");
      await clickButton('Mois précédent');
      await clickDay('2026-11-02');
      const restoredUrls: string[] = [];

      await goBack();
      restoredUrls.push(router.url);
      await goBack();
      restoredUrls.push(router.url);
      await goBack();
      restoredUrls.push(router.url);
      await goBack();
      restoredUrls.push(router.url);
      await goBack();
      restoredUrls.push(router.url);

      expect(restoredUrls).toEqual([
        '/calendar/2026-10',
        '/calendar/2026-11',
        '/calendar/2028-02',
        '/calendar/2026-12',
        '/calendar/2026-11',
      ]);
    });

    it("T082 - ouvre le calendrier : l'ouverture initiale ne crée pas d'entrée d'historique supplémentaire", async () => {
      await openCalendarAt('/calendar/2026-11');

      await goBack();
      const urlBeforeCalendar: string = router.url;
      const calendarCells: number = dayCells().length;

      expect(urlBeforeCalendar).toBe('/');
      expect(calendarCells).toBe(0);
    });

    it("T083 - revient en arrière dans le navigateur après plusieurs changements de mois : la période précédemment affichée est restaurée", async () => {
      const decemberEvent: CalendarEvent = makeEvent('e1', '2026-12-15', 'Marché de Noël');
      serveEventsByGridStart({ '2026-11-30': [decemberEvent] });
      await openCalendarAt('/calendar/2026-11');
      await clickButton('Mois suivant');
      await clickButton('Mois suivant');

      await goBack();
      const url: string = router.url;
      const title: string = monthTitleText();
      const periodUrl: string = displayedPeriodUrl();
      const titlesOnDecemberDate: string[] = eventTitlesOn('2026-12-15');

      expect(url).toBe('/calendar/2026-12');
      expect(title).toContain('décembre 2026');
      expect(periodUrl).toBe(url);
      expect(titlesOnDecemberDate).toEqual(['Marché de Noël']);
    });

    it("T084 - avance dans le navigateur après un retour vers une période précédente : la période suivante consultée est restaurée", async () => {
      const decemberEvent: CalendarEvent = makeEvent('e1', '2026-12-15', 'Marché de Noël');
      serveEventsByGridStart({ '2026-11-30': [decemberEvent] });
      await openCalendarAt('/calendar/2026-11');
      await clickButton('Mois suivant');
      await clickButton('Mois suivant');
      await goBack();
      await goBack();

      await goForward();
      const url: string = router.url;
      const title: string = monthTitleText();
      const periodUrl: string = displayedPeriodUrl();
      const titlesOnDecemberDate: string[] = eventTitlesOn('2026-12-15');

      expect(url).toBe('/calendar/2026-12');
      expect(title).toContain('décembre 2026');
      expect(periodUrl).toBe(url);
      expect(titlesOnDecemberDate).toEqual(['Marché de Noël']);
    });

    it("T085 - restaure des périodes par retour et avance du navigateur : aucune nouvelle entrée d'historique n'est créée", async () => {
      await openCalendarAt('/calendar/2026-11');
      await clickButton('Mois suivant');
      await clickButton('Mois suivant');
      await goBack();
      await goBack();
      const restoredUrls: string[] = [];

      await goForward();
      restoredUrls.push(router.url);
      await goForward();
      restoredUrls.push(router.url);
      await goForward();
      restoredUrls.push(router.url);
      await goBack();
      restoredUrls.push(router.url);
      await goBack();
      restoredUrls.push(router.url);
      await goBack();
      restoredUrls.push(router.url);

      expect(restoredUrls).toEqual([
        '/calendar/2026-12',
        '/calendar/2027-01',
        '/calendar/2027-01',
        '/calendar/2026-12',
        '/calendar/2026-11',
        '/',
      ]);
    });
  });
});
