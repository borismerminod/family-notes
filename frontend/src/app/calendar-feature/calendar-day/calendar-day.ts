import { Component, input, InputSignal } from '@angular/core';
import { CalendarDay } from '../../core/models/calendar-day.model';
import { CalendarEvent } from '../../core/models/calendar-event.model';
import { DatePipe } from '@angular/common';


@Component({
  selector: 'app-calendar-day',
  imports: [DatePipe],
  templateUrl: './calendar-day.html',
  styleUrl: './calendar-day.css',
  host: {
    '[class.today]': 'isToday()',
    '[class.selected]': 'isSelected()',
    '[class.other-month]': 'isOtherMonth()',
  },
})
export class CalendarDayComponent
{

  /** The date rendered by the cell, with its events already sorted. */
  readonly dayDate: InputSignal<CalendarDay> = input.required<CalendarDay>()

  /** Whether the date is the current civil day; sets `.today` on the host (`D-DAY1`). */
  readonly isToday: InputSignal<boolean> = input<boolean>(false)

  /** Whether the date is the one the user selected; sets `.selected` on the host (`D-DAY1`). */
  readonly isSelected: InputSignal<boolean> = input<boolean>(false)

  /** Whether the date belongs to a month adjacent to the displayed one; sets `.other-month` on the host (`D-DAY1`). */
  readonly isOtherMonth: InputSignal<boolean> = input<boolean>(false)

  /** Maximum number of events shown in the cell; the others are summed up by `.more-events` (`D-DAY2`). */
  readonly maxVisibleEvents: InputSignal<number> = input<number>(3)


  constructor()
  {
  }

  /**
   * @returns The first events of the day, in the order received, within the display capacity.
   */
  visibleEvents(): readonly CalendarEvent[]
  {
    const day: CalendarDay = this.dayDate();
    const capacity: number = this.maxVisibleEvents();
    return day.events.slice(0, capacity);
  }

  /**
   * @returns How many events of the day do not fit in the display capacity, `0` when they all fit.
   */
  hiddenEventCount(): number
  {
    const totalEventCount: number = this.dayDate().events.length;
    const capacity: number = this.maxVisibleEvents();
    return Math.max(totalEventCount - capacity, 0);
  }

}
