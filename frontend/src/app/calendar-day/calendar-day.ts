import { Component, Input } from '@angular/core';
import { CalendarDay } from '../core/models/calendar-day.model';
import { DatePipe } from '@angular/common';


@Component({
  selector: 'app-calendar-day',
  imports: [DatePipe],
  templateUrl: './calendar-day.html',
  styleUrl: './calendar-day.css',
})
export class CalendarDayComponent
{

  @Input() dayDate! : CalendarDay


  constructor()
  {
  }

}
