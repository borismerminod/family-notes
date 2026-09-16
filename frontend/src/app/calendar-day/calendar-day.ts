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

  @Input() dayDate : string

  /*@Input()
  calendarEvents : CalendarEvent[]*/

  constructor()
  {
    this.dayDate = ""
    //this.calendarEvents = []
  }

}
