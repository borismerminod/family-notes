import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { CalendarService } from '../core/services/calendar-service';
import {CalendarDay} from '../core/models/calendar-day.model'
import { CalendarEvent } from '../core/models/calendar-event.model';
import { buildMonthGrid, isValidMonthKey, localDateKey, localMonthKey, monthKeyOfDate } from '../core/services/calendar-grid';
import { groupEventsByDate, sortEvents } from '../core/services/calendar-events';
import {CalendarDayComponent} from '../calendar-day/calendar-day'
import { DatePipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, ActivatedRoute } from '@angular/router';

/** Outcome of loading the events of a grid: the cells to display, and whether the fetch failed. */
interface GridLoadResult
{
  readonly days : CalendarDay[]
  readonly failed : boolean
}

@Component({
  selector: 'app-calendar',
  imports: [CalendarDayComponent, DatePipe,RouterLink, RouterLinkActive],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css',
})
export class Calendar implements OnInit
{
  private calendarService = inject(CalendarService)
  selectedMonthDate : (string)
  nextMonth : string
  previousMonth : string
  /** Local civil date of today (`'YYYY-MM-DD'`), refreshed each time a month is displayed. */
  todayDate : string
  /** Civil date (`'YYYY-MM-DD'`) the user last picked in the grid, empty while none is selected. */
  selectedDate : string
  router : Router = inject(Router)
  route: ActivatedRoute = inject(ActivatedRoute)
  days = signal<(CalendarDay|null)[]>([])
  /** Whether the events of the displayed grid are being fetched, to show a discreet loading state. */
  eventsLoading = signal<boolean>(false)
  /** Whether the last fetch of the displayed grid's events failed, to tell it apart from an empty month. */
  eventsError = signal<boolean>(false)
  /** Number of the most recent grid load: only its answer may update the screen. */
  private latestGridLoad : number = 0

  constructor()
  {
    this.selectedMonthDate = ""
    this.nextMonth = ""
    this.previousMonth = ""
    this.todayDate = ""
    this.selectedDate = ""
    this.days.set([])
  }

  async ngOnInit() : Promise<void>
  {
    this.route.paramMap.subscribe(async (params) => {
      const tempMonthDate = params.get('selectedMonth');
      if(tempMonthDate === null || !isValidMonthKey(tempMonthDate))
      {
        await this.redirectToCurrentMonth()
      }
      else
      {
        this.selectedMonthDate = tempMonthDate
        this.previousMonth = this.getPreviousMonth()
        this.nextMonth = this.getNextMonth()
        this.todayDate = this.computeTodayDate()
        await this.refreshDays()
      }
    });
    //
    console.log(this.days())

  }

  private getSelectedMonthDate(): string
  {
    const segments = window.location.pathname.split('/').filter(Boolean)
    return segments.at(-1) ?? ''
  }

  /**
   * Replaces a missing or malformed period in the URL by the local current month. The URL stays the
   * single source of truth of the displayed month: the corrected route is what rebuilds the grid, and
   * `replaceUrl` keeps the invalid address out of the browser history.
   */
  private async redirectToCurrentMonth() : Promise<void>
  {
    const now : Date = new Date()
    const currentMonth : string = localMonthKey(now)
    await this.router.navigate(['/calendar', currentMonth], { replaceUrl: true })
  }

  /**
   * Replaces the displayed grid with the one of the selected month, in two steps: the 42 cells are shown
   * at once without events, so the grid stays usable while they load and the events of a previous period
   * are never shown as if they belonged to the new one; then the cells are filled once the events arrive.
   * The loading state is shown for as long as the fetch runs, and a failure raises the error state until
   * the next load, so it is never mistaken for a month without events.
   *
   * Each load is numbered: when the user navigates while a fetch is in flight, the answer of the older
   * period arrives after a newer load has started and is ignored, so it never overwrites the cells, the
   * loading state nor the error state of the period actually displayed.
   */
  private async refreshDays() : Promise<void>
  {
    this.latestGridLoad += 1
    const gridLoad : number = this.latestGridLoad
    const gridDates : string[] = this.buildSelectedMonthGridDates()
    const daysWithoutEvents : CalendarDay[] = groupEventsByDate(gridDates, [])
    this.days.set(daysWithoutEvents)
    this.eventsLoading.set(true)
    this.eventsError.set(false)
    const loadResult : GridLoadResult = await this.fetchGridDays(gridDates)
    if(gridLoad === this.latestGridLoad)
    {
      this.days.set(loadResult.days)
      this.eventsError.set(loadResult.failed)
      this.eventsLoading.set(false)
    }
  }

  /**
   * Loads the cells of a grid without ever rejecting: a failed fetch must not escape as an unhandled
   * rejection, so it is turned into the cells without events, flagged as failed.
   * @param gridDates The 42 dates of the grid, in display order.
   * @returns The cells to display, and whether their events could not be fetched.
   */
  private async fetchGridDays(gridDates : string[]) : Promise<GridLoadResult>
  {
    try
    {
      const daysWithEvents : CalendarDay[] = await this.loadGridDays(gridDates)
      return { days: daysWithEvents, failed: false }
    }
    catch
    {
      const daysWithoutEvents : CalendarDay[] = groupEventsByDate(gridDates, [])
      return { days: daysWithoutEvents, failed: true }
    }
  }

  /**
   * Builds the 42 civil dates of the displayed month's grid, Monday first: the previous-month tail, the
   * month itself, then the next-month head, each a real date. The grid only depends on the period, so it
   * can be shown before any event is loaded.
   * @returns The 42 `'YYYY-MM-DD'` dates, in display order.
   */
  private buildSelectedMonthGridDates() : string[]
  {
    const periodParts : string[] = this.selectedMonthDate.split('-')
    const year : number = Number(periodParts[0])
    const month : number = Number(periodParts[1])
    return buildMonthGrid(year, month)
  }

  /**
   * Loads the events of a whole grid with one ranged query over [first cell, last cell], so the events
   * of the adjacent-month cells are fetched too, then sorts them and aligns each one to the cell of its
   * civil date (plain string equality).
   * @param gridDates The 42 dates of the grid, in display order.
   * @returns One `CalendarDay` per cell, holding its sorted events.
   */
  private async loadGridDays(gridDates : string[]) : Promise<CalendarDay[]>
  {
    const firstGridDate : string = gridDates[0]
    const lastGridDate : string = gridDates[gridDates.length - 1]
    const gridRange : { start: string, end: string } = { start: firstGridDate, end: lastGridDate }
    const gridEvents : CalendarEvent[] = await this.calendarService.getEventsFromRangedDate(gridRange)
    const sortedEvents : CalendarEvent[] = sortEvents(gridEvents)
    return groupEventsByDate(gridDates, sortedEvents)
  }

  private getPreviousMonth() : string
  {
    const selectedMonthDateArr = this.selectedMonthDate.split("-")
    let previousMonthStr : string = ""
    if(selectedMonthDateArr.length > 0)
    {
      const selectedMonth : number = Number(selectedMonthDateArr[1])
      const selectedYear : number =  Number(selectedMonthDateArr[0])
      let previousMonth : number = selectedMonth - 1
      let previousYear : number = selectedYear

      if(selectedMonth === 1)
      {
        previousMonth = 12
        previousYear = selectedYear - 1
      }

      previousMonthStr = String(previousYear) + "-" + String(previousMonth).padStart(2,"0")
    }
    return previousMonthStr
  }

  private getNextMonth() : string
  {
    const selectedMonthDateArr = this.selectedMonthDate.split("-")
    let nextMonthStr : string = ""
    if(selectedMonthDateArr.length > 0)
    {
      const selectedMonth : number = Number(selectedMonthDateArr[1])
      const selectedYear : number =  Number(selectedMonthDateArr[0])
      let nextMonth : number = selectedMonth + 1
      let nextYear : number = selectedYear

      if(selectedMonth === 12)
      {
        nextMonth = 1
        nextYear = selectedYear + 1
      }

      nextMonthStr = String(nextYear) + "-" + String(nextMonth).padStart(2,"0")
    }
    return nextMonthStr
  }

  isCurrentMonth(day: CalendarDay) : boolean
  {
    const monthArr : string[] = day.date.split("-")
    const selectedMonthArr = this.selectedMonthDate.split("-")

    if(monthArr.length > 1 && selectedMonthArr.length > 1)
    {
      return monthArr[1] === selectedMonthArr[1] && monthArr[0] === selectedMonthArr[0]
    }

    return false
  }

  /**
   * Computes today as a local civil date, so the « today » marker never shifts a day through UTC.
   * @returns Today's `'YYYY-MM-DD'` date in the user's time zone.
   */
  private computeTodayDate() : string
  {
    const now : Date = new Date()
    return localDateKey(now)
  }

  /**
   * Tells whether a cell holds today's date, whichever month it belongs to: an adjacent-month cell of
   * the grid can be today too.
   * @param day The cell of the grid.
   * @returns `true` when the cell is today's local civil date.
   */
  isToday(day: CalendarDay) : boolean
  {
    return day.date === this.todayDate
  }

  /**
   * Selects the date of a cell; only one date is selected at a time. A date of the displayed month only
   * changes the selection, kept in the component state: the URL stays put and nothing is fetched again.
   * A date of an adjacent month also navigates to its month, where it stays selected since the
   * component is reused when only the route parameter changes.
   * @param day The cell the user picked.
   */
  async selectDay(day: CalendarDay) : Promise<void>
  {
    this.selectedDate = day.date
    if(!this.isCurrentMonth(day))
    {
      await this.navigateToMonthOf(day)
    }
  }

  /**
   * Navigates to the month a cell belongs to, as an explicit navigation that adds a history entry.
   * @param day A cell of the grid, typically of an adjacent month.
   */
  private async navigateToMonthOf(day: CalendarDay) : Promise<void>
  {
    const monthOfDay : string = monthKeyOfDate(day.date)
    await this.router.navigate(['/calendar', monthOfDay])
  }

  /**
   * Tells whether a cell holds the selected date. Independent from {@link isToday}: a cell can be both.
   * @param day The cell of the grid.
   * @returns `true` when the cell is the date the user last picked.
   */
  isSelected(day: CalendarDay) : boolean
  {
    return day.date === this.selectedDate
  }

  /**
   * Goes to the period chosen in the month picker, as an explicit navigation that adds a history entry.
   * A malformed value, or the period already displayed, triggers nothing: no navigation, no history
   * entry, no fetch.
   * @param pickedMonth The `'YYYY-MM'` value committed by the picker.
   */
  async chooseMonth(pickedMonth: string) : Promise<void>
  {
    const isNewValidPeriod : boolean = isValidMonthKey(pickedMonth) && pickedMonth !== this.selectedMonthDate
    if(isNewValidPeriod)
    {
      await this.router.navigate(['/calendar', pickedMonth])
    }
  }

  /**
   * Goes back to the month holding today's local civil date. Shares the rules of {@link chooseMonth}:
   * nothing happens when that month is already displayed.
   */
  async goToToday() : Promise<void>
  {
    const now : Date = new Date()
    const currentMonth : string = localMonthKey(now)
    await this.chooseMonth(currentMonth)
  }

  goToNextMonth()
  {
    this.router.navigate(['/calendar', this.nextMonth])
  }

  goToPreviousMonth()
  {
    this.router.navigate(['/calendar', this.previousMonth])
  }

}
