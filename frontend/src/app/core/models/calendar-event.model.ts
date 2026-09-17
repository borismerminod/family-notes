
export interface CalendarEvent {
    readonly id: string;
    readonly title: string;
    readonly start_time: string;        // 'HH:mm'
    readonly end_time: string;          // 'HH:mm'
    readonly noteIds: readonly string[]; 
}