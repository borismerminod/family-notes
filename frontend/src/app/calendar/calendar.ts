import { Component, inject, Input, OnInit, signal } from '@angular/core';
import { CalendarService } from '../core/services/calendar-service';
import {CalendarDay} from '../core/models/calendar-day.model'
import { CalendarEvent } from '../core/models/calendar-event.model';
import {CalendarDayComponent} from '../calendar-day/calendar-day'
import { DatePipe } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-calendar',
  imports: [CalendarDayComponent, DatePipe,RouterLink, RouterLinkActive],
  templateUrl: './calendar.html',
  styleUrl: './calendar.css',
})
export class Calendar implements OnInit
{
  private readonly THIRTY_ONE_DAYS_MONTHS = [1, 3, 5, 7, 8, 10,12]
  private readonly THIRTY_DAYS_MONTHS = [4,6,9,11]



  private calendarService = inject(CalendarService)
  selectedMonthDate : (string)
  nextMonth : string
  previousMonth : string
  router : Router = inject(Router)
  route: ActivatedRoute = inject(ActivatedRoute)
  days = signal<(CalendarDay|null)[]>([])

  constructor()
  {
    this.selectedMonthDate = ""
    this.nextMonth = ""
    this.previousMonth = ""
    this.days.set([])
  }

  async ngOnInit() : Promise<void>
  {
    this.route.paramMap.subscribe(async (params) => {
    const tempMonthDate = params.get('selectedMonthDate'); 
    if(tempMonthDate !== null)
    {
      this.selectedMonthDate = tempMonthDate
      this.previousMonth = this.getPreviousMonth()
      this.nextMonth = this.getNextMonth()
      this.days.set(await this.buildSelectedMonthCalendar()) 
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

  private async buildSelectedMonthCalendar() : Promise<(CalendarDay|null)[]>
  {
    let days : (CalendarDay | null)[] = new Array(42).fill(null)
    let numberOfDays = 0
    let firstDate : Date = new Date(this.selectedMonthDate + "-1")
    const firstDayIndex = this.getWeekDayNumber(firstDate)
    console.log("firstDayIndex",firstDayIndex)
  
    let monthDateArr = this.selectedMonthDate.split("-")

    let previousMonth : string = this.getPreviousMonth()
    let nextMonth : string = this.getNextMonth()
    let selectedMonthnumberOfDays = 0 

    if(monthDateArr.length > 0)
    {
      const month : number = Number(monthDateArr[1])
      const year : number =  Number(monthDateArr[0])
      selectedMonthnumberOfDays = this.computeDayNumberFromMonth(month, year)
      let lastDayIndex = firstDayIndex + selectedMonthnumberOfDays
      await this.fillCalendarArray(days, firstDayIndex, lastDayIndex, 1, this.selectedMonthDate)
    }

    monthDateArr = previousMonth.split("-")
    if(monthDateArr.length > 0)
    {
      const month : number = Number(monthDateArr[1])
      const year : number =  Number(monthDateArr[0])
      let numberOfDaysIndex = (this.computeDayNumberFromMonth(month, year) - (firstDayIndex-1))

      await this.fillCalendarArray(days, 0, firstDayIndex, numberOfDaysIndex, previousMonth)
    }

    monthDateArr = nextMonth.split("-")
    if(monthDateArr.length > 0)
    {
      const month : number = Number(monthDateArr[1])
      const year : number =  Number(monthDateArr[0])
      let numberOfDaysIndex = (this.computeDayNumberFromMonth(month, year) - (firstDayIndex-1))

      await this.fillCalendarArray(days, firstDayIndex+selectedMonthnumberOfDays, 42, 1, nextMonth)
    }



    return Promise.all(days)

  }

  private async fillCalendarArray(days : (
      CalendarDay | null)[], 
      firstIndex : number, 
      lastIndex : number, 
      dayIndex : number,
      monthDate : string
  )
  {

    if(firstIndex < 0 || firstIndex > days.length)
    {
      return
    }
    else if (lastIndex < 0 || lastIndex > days.length)
    {
      return
    }
    else if(firstIndex > lastIndex)
    {
      let tmp = firstIndex
      firstIndex = lastIndex
      lastIndex = tmp
    }
    for(let i=firstIndex; i<lastIndex; i++)
    {
      const day : string = monthDate+ "-"+ String(dayIndex).padStart(2, '0')
      const calendarEvents : CalendarEvent[] = await this.calendarService.getEventsFromDate(day)

      const calendarDay : CalendarDay = {date: day, events : calendarEvents}
      days[i] = calendarDay
      dayIndex++

    }
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

  private computeDayNumberFromMonth(month: number, year: number) : number
  {
    
    let numberOfDays:number = 0
    if(month === 2)
    {
      if(this.estBissextile(year))
      {
        numberOfDays = 29
      }
      else
      {
        numberOfDays = 28
      }
    }
    if(this.THIRTY_ONE_DAYS_MONTHS.includes(month)) 
    {
      numberOfDays = 31
    }
    else if (this.THIRTY_DAYS_MONTHS.includes(month))
    {
      numberOfDays = 30
    }

    return numberOfDays

  }

  private estBissextile(annee: number): boolean 
  {
    return annee % 4 === 0 &&
           (annee % 100 !== 0 || annee % 400 === 0);
  }

  private getWeekDayNumber(date: Date)
  {
    console.log(date.getDay())
    return (date.getDay() + 6) % 7 
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

  goToNextMonth()
  {
    this.router.navigate(['/calendar', this.nextMonth])
  }

  goToPreviousMonth()
  {
    this.router.navigate(['/calendar', this.previousMonth])
  }

}
