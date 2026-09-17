import { CalendarEvent } from "./calendar-event.model"

export interface CalendarDay
{
    readonly date : string
    readonly events: readonly CalendarEvent[]
}