import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { CalendarService } from '../core/services/calendar-service';
import {CalendarDay} from '../core/models/calendar-day.model'
import { CalendarEvent } from '../core/models/calendar-event.model';
import {CalendarDayComponent} from '../calendar-day/calendar-day'

@Component({
  selector: 'app-calendar',
  imports: [CalendarDayComponent],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css',
})
export class Calendar implements OnInit
{
  private readonly THIRTY_ONE_DAYS_MONTHS = [1, 3, 5, 7, 8, 10,12]
  private readonly THIRTY_DAYS_MONTHS = [4,6,9,11]



  private calendarService = inject(CalendarService)
  selectedMonthDate! : string
  //private calendarEvents: CalendarEvent[]
  days = signal<CalendarDay[]>([])

  constructor()
  {
    this.days.set([])
  }

  async ngOnInit() : Promise<void>
  {
    this.selectedMonthDate = this.getSelectedMonthDate()
    //
    this.days.set(await this.computeDayNumberFromMonth())
    console.log(this.days())

  }

  private getSelectedMonthDate(): string
  {
    const segments = window.location.pathname.split('/').filter(Boolean)
    return segments.at(-1) ?? ''
  }

  private async computeDayNumberFromMonth() : Promise<CalendarDay[]>
  {
    let days : Promise<CalendarDay>[] = []
    const selectedMonthDateArr = this.selectedMonthDate.split("-")
    
    if(selectedMonthDateArr.length > 1 )
    {
      const selectedMonth : number = Number(selectedMonthDateArr[1])
      const selectedYear : number =  Number(selectedMonthDateArr[0])
      
      if(selectedMonth === 2)
      {
        if(this.estBissextile(selectedYear))
        {
          
          days = Array.from({ length: 29 },  async (_, index) => {
            const dateOfDay : string  = this.selectedMonthDate+"-"+String(index + 1).padStart(2)
            let events : CalendarEvent[] = await this.calendarService.getEventsFromDate(dateOfDay)
            let day : CalendarDay = {date: dateOfDay, events: events}
            return day
          })
        }
        else
        {
          days = Array.from({ length: 28 },  async (_, index) => {
            const dateOfDay : string  = this.selectedMonthDate+"-"+String(index + 1).padStart(2)
            let events : CalendarEvent[] = await this.calendarService.getEventsFromDate(dateOfDay)
            let day : CalendarDay = {date: dateOfDay, events: events}
            return day
          })
        }
      }
      if(this.THIRTY_ONE_DAYS_MONTHS.includes(selectedMonth)) 
      {
        days = Array.from({ length: 31 },  async (_, index) => {
          const dateOfDay : string  = this.selectedMonthDate+"-"+String(index + 1).padStart(2)
          let events : CalendarEvent[] = await this.calendarService.getEventsFromDate(dateOfDay)
          let day : CalendarDay = {date: dateOfDay, events: events}
          return day
        })
      }
      else if (this.THIRTY_DAYS_MONTHS.includes(selectedMonth))
      {
        days = Array.from({ length: 30 },  async (_, index) => {
          const dateOfDay : string  = this.selectedMonthDate+"-"+String(index + 1).padStart(2)
          let events : CalendarEvent[] = await this.calendarService.getEventsFromDate(dateOfDay)
          let day : CalendarDay = {date: dateOfDay, events: events}
          return day
        })  
      }
    }

    return Promise.all(days)

  }

  private estBissextile(annee: number): boolean 
  {
    return annee % 4 === 0 &&
           (annee % 100 !== 0 || annee % 400 === 0);
  }

}
