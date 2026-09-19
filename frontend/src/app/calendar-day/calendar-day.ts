import { Component, Input } from '@angular/core';
import { CalendarDay } from '../core/models/calendar-day.model';


@Component({
  selector: 'app-calendar-day',
  imports: [],
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
