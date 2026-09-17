import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { CalendarService } from '../core/services/calendar-service';
import { ActivatedRoute } from '@angular/router';
import {CalendarDay} from '../calendar-day/calendar-day';
import { CalendarEvent } from '../calendar-event/calendar-event';

@Component({
  selector: 'app-calendar',
  imports: [CalendarDay],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css',
})
export class Calendar implements OnInit
{
  private readonly THIRTY_ONE_DAYS_MONTHS = [1, 3, 5, 7, 8, 10,12]
  private readonly THIRTY_DAYS_MONTHS = [4,6,9,11]



  private calendarService = inject(CalendarService)
  private route = inject(ActivatedRoute)

  selectedMonthDate! : string
  //private calendarEvents: CalendarEvent[]
  days = signal<string[]>([])

  constructor()
  {
    this.days.set([])
  }

  async ngOnInit() : Promise<void>
  {
    this.selectedMonthDate = this.route.snapshot.paramMap.get('selectedMonthDate') ?? ''
    const calendarEvents =  this.calendarService.getEventsFromRangedDate(this.selectedMonthDate)

    //this.days.set(await this.computeDayNumberFromMonth())
    //console.log(this.days())

  }

  /*private computeDayNumberFromMonth() : Promise<CalendarDay[]>
  {
    let days : CalendarDay[] = []
    const selectedMonthDateArr = this.selectedMonthDate.split("-")
    
    if(selectedMonthDateArr.length > 1 )
    {
      const selectedMonth : number = Number(selectedMonthDateArr[1])
      const selectedYear : number =  Number(selectedMonthDateArr[0])
      
      if(selectedMonth === 2)
      {
        if(this.estBissextile(selectedYear))
        {
          
          days = Array.from({ length: 29 },  (_, index) => {
            const dateOfDay : string  = this.selectedMonthDate+"-"+String(index + 1).padStart(2)
            let events : CalendarEvent[]
            this.calendarService.getEventsFromDate(dateOfDay).then((eventList) => {
              events = [...eventList]
              return {dayDate: dateOfDay, calendarEvents: events}
            })


          })
        }
        else
        {
          days = Array.from({ length: 28 }, (_, index) => this.selectedMonthDate+"-"+String(index + 1).padStart(2))
        }
      }
      if(this.THIRTY_ONE_DAYS_MONTHS.includes(selectedMonth)) 
      {
        days = Array.from({ length: 31 }, (_, index) => this.selectedMonthDate+"-"+String(index + 1).padStart(2))
      }
      else if (this.THIRTY_DAYS_MONTHS.includes(selectedMonth))
      {
        days = Array.from({ length: 30 }, (_, index) => this.selectedMonthDate+"-"+String(index + 1).padStart(2))
      }
    }

    return days

  }*/

  private estBissextile(annee: number): boolean 
  {
    return annee % 4 === 0 &&
           (annee % 100 !== 0 || annee % 400 === 0);
  }

}
