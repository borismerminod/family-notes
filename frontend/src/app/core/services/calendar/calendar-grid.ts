/**
 * @file calendar-grid.ts
 * @description **Pure helpers for the monthly grid** (CALENDAR, see
 * .agent/CALENDAR/CALENDAR_FEATURE/APPROCHE_CALENDRIER.md §0.4). No Angular / no SQLite dependency:
 * they only compute dates and strings so a component can build one ranged query instead of one per cell.
 *
 * The grid is a **flat array of 42 real civil dates** (`'YYYY-MM-DD'`), Monday-first, week width 7:
 * columns `0..6` = Mon..Sun. Cells not belonging to the displayed month hold the last days of the
 * previous month (leading tail) and the first days of the next month (trailing head). Layout:
 *   [prev-month tail][current month 1..N][next-month head] filling exactly 42 cells.
 */

/**
 * Returns `true` for a Gregorian leap year (`divisible by 4, except centuries unless divisible by 400`).
 * @param year A calendar year as an integer.
 * @returns Whether the year has February with 29 days.
 */
export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/**
 * Number of days in a month, accounting for February / leap years. `month` is 1-based (Jan=1..Dec=12).
 * @param year The calendar year.
 * @param month The 1-based month number.
 * @returns The number of days in that month (`28`, `29`, `30` or `31`).
 */
export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  const daysByMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysByMonth[month - 1];
}

/**
 * Column index (Mon=0..Sun=6) of the first day of a month within a Monday-started 42-cell grid.
 * Derived from `Date#getDay()` as `(getDay() + 6) % 7`, so it matches real Gregorian weekdays and needs
 * no hardcoding: `isLeapYear`/`daysInMonth` are only used to validate the result stays in range.
 * @param year The calendar year.
 * @param month The 1-based month number.
 * @returns The leading column offset (`0..6`) of `'YYYY-MM-01'`.
 */
export function firstOfMonthGridColumnIndex(year: number, month: number): number {
  const date = new Date(Date.UTC(year, month - 1, 1));
  // Weekday offset (Mon=0..Sun=6) is timezone-independent for a real civil date, so getDay() and getUTDay() agree;
  // use getDay(), which stays declared by the ES2025 lib while the newer ES2026 proposal renames it to getUTCDay().
  return (date.getDay() + 6) % 7; // getDay(): Sun=0..Sat=6 -> Mon=0..Sun=6
}

/**
 * Build the `'YYYY-MM'` key of the month that comes before `year-month`. December → previous year / January.
 * @param year The calendar year of the displayed month.
 * @param month The 1-based month number of the displayed month.
 * @returns The civil `'YYYY-MM'` key (e.g. `'2025-12'`).
 */
export function previousMonthKey(year: number, month: number): string {
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

/**
 * Build the `'YYYY-MM'` key of the month that comes after `year-month`. January → next year / December.
 * @param year The calendar year of the displayed month.
 * @param month The 1-based month number of the displayed month.
 * @returns The civil `'YYYY-MM'` key (e.g. `'2026-01'`).
 */
export function nextMonthKey(year: number, month: number): string {
  if (month === 12) return `${year + 1}-01`; // December → next year / January (not that year's December again)
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/** Shape of a valid `'YYYY-MM'` period: a four-digit year and a month between `01` and `12`. */
const MONTH_KEY_PATTERN: RegExp = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Tells whether a value is a valid `'YYYY-MM'` period, such as the `:selectedMonth` route parameter.
 * @param value The candidate period.
 * @returns `true` when it names a real month (e.g. `'2026-11'`), `false` otherwise (e.g. `'2026-13'`).
 */
export function isValidMonthKey(value: string): boolean {
  return MONTH_KEY_PATTERN.test(value);
}

/**
 * Build the `'YYYY-MM'` key of the **local civil** month holding an instant. Reads the local calendar
 * fields, never `toISOString()`, which converts to UTC and can shift the day — hence the month.
 * @param instant Any instant, typically « now ».
 * @returns The civil `'YYYY-MM'` key in the user's time zone (e.g. `'2026-11'`).
 */
export function localMonthKey(instant: Date): string {
  const year: number = instant.getFullYear();
  const month: number = instant.getMonth() + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Extract the `'YYYY-MM'` period a civil date belongs to, in the format of the `:selectedMonth` route
 * parameter. Works on the string itself: no `Date` is built, so no time zone can shift the month.
 * @param dateKey A civil `'YYYY-MM-DD'` date, such as a grid cell.
 * @returns Its `'YYYY-MM'` period (e.g. `'2026-12'` for `'2026-12-02'`).
 */
export function monthKeyOfDate(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/**
 * Build the `'YYYY-MM-DD'` key of the **local civil** day holding an instant, in the format of the grid
 * cells. Reads the local calendar fields, never `toISOString()`, which converts to UTC and can shift the day.
 * @param instant Any instant, typically « now ».
 * @returns The civil `'YYYY-MM-DD'` key in the user's time zone (e.g. `'2026-11-15'`).
 */
export function localDateKey(instant: Date): string {
  const monthKey: string = localMonthKey(instant);
  const day: number = instant.getDate();
  return `${monthKey}-${String(day).padStart(2, '0')}`;
}

/**
 * Fill the leading tail of a grid: `count` columns at the start hold the last days of the previous month,
 * chronologically increasing from left to right (the most recent day sits in the column just before the
 * first-of-month column). Column `col` receives day number `pdays - (count - 1 - col)`.
 * @param prevKey The `'YYYY-MM'` key of the previous month.
 * @param pdays Number of days in the previous month.
 * @param count How many leading columns this tail occupies (`offset`).
 * @param col Zero-based column index within the tail (`0..count-1`).
 * @returns A real civil date string for that position.
 */
function fillPrevTail(prevKey: string, pdays: number, count: number, col: number): string {
  return `${prevKey}-${String(pdays - (count - 1 - col)).padStart(2, '0')}`;
}

/**
 * Build the full Monday-started monthly grid as an array of 42 real civil dates.
 *   - columns `0..offset-1` hold the last days of the previous month (increasing),
 *   - columns `offset..offset+days-1` hold the current month's days `1..days`,
 *   - columns `placed..41` hold the first days of the next month, filling exactly 42 cells.
 * Every entry is a real civil date and the sequence is strictly increasing (consecutive Gregorian days).
 * @param year The calendar year of the displayed month.
 * @param month The 1-based month number of the displayed month.
 * @returns A `string[]` of length 42 with unique, consecutive `'YYYY-MM-DD'` dates.
 */
export function buildMonthGrid(year: number, month: number): string[] {
  const offset = firstOfMonthGridColumnIndex(year, month); // leading prev-month tail width
  const days = daysInMonth(year, month);

  const grid: string[] = [];

  // Leading tail: the last `offset` days of the previous month, chronologically increasing.
  if (month === 1) {
    const pdaysPrev = daysInMonth(year - 1, 12);
    for (let col = 0; col < offset; col++) grid.push(fillPrevTail(previousMonthKey(year, month), pdaysPrev, offset, col));
  } else {
    const pdaysPrev = daysInMonth(year, month - 1);
    for (let col = 0; col < offset; col++) grid.push(fillPrevTail(previousMonthKey(year, month), pdaysPrev, offset, col));
  }

  for (let day = 1; day <= days; day++) {
    grid.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }

  const placed = offset + days;
  const nextMonth = nextMonthKey(year, month);
  for (let i = placed; i < 42; i++) {
    grid.push(`${nextMonth}-${String(i - placed + 1).padStart(2, '0')}`);
  }

  return grid;
}
