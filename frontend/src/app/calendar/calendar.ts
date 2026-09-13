import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { CalendarService } from '../core/services/calendar-service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-calendar',
  imports: [],
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
  days = signal<number[]>([])

  constructor()
  {
    this.days.set([])
  }

  async ngOnInit() : Promise<void>
  {
    this.selectedMonthDate = this.route.snapshot.paramMap.get('selectedMonthDate') ?? ''
    const calendarEvents = await this.calendarService.getEventsFromRangedDate(this.selectedMonthDate)

    this.days.set(this.computeDayNumberFromMonth())
    console.log(calendarEvents)

  }

  private computeDayNumberFromMonth() : number[]
  {
    let days : number[] = []
    const selectedMonthDateArr = this.selectedMonthDate.split("-")
    
    if(selectedMonthDateArr.length > 1 )
    {
      const selectedMonth : number = Number(selectedMonthDateArr[1])
      const selectedYear : number =  Number(selectedMonthDateArr[0])
      
      if(selectedMonth === 2)
      {
        if(this.estBissextile(selectedYear))
        {
          days = Array.from({ length: 29 }, (_, index) => index + 1)
        }
        else
        {
          days = Array.from({ length: 28 }, (_, index) => index + 1)
        }
      }
      if(this.THIRTY_ONE_DAYS_MONTHS.includes(selectedMonth)) 
      {
        days = Array.from({ length: 31 }, (_, index) => index + 1)
      }
      else if (this.THIRTY_DAYS_MONTHS.includes(selectedMonth))
      {
        days = Array.from({ length: 30 }, (_, index) => index + 1)
      }
    }

    return days
   
  }

  private estBissextile(annee: number): boolean 
  {
    return annee % 4 === 0 &&
           (annee % 100 !== 0 || annee % 400 === 0);
  }

}
