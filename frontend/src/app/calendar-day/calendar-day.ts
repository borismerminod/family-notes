import { Component, Input } from '@angular/core';
import { CalendarEvent } from '../calendar-event/calendar-event';

@Component({
  selector: 'app-calendar-day',
  imports: [],
  templateUrl: './calendar-day.html',
  styleUrl: './calendar-day.css',
})
export class CalendarDay
{

  @Input()
  dayNumber : string

  @Input()
  calendarEvents : CalendarEvent[]

  constructor()
  {
    this.dayNumber = ""
    this.calendarEvents = []
  }

}
