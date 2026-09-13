import { CalendarDay } from "./calendar-day.model"

export interface Calendar
{
    readonly year : number
    readonly month : number
    readonly days : readonly CalendarDay[]
}