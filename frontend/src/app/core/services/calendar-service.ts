import { Injectable } from '@angular/core';
import { SqliteService } from './sqlite-service';
import { CalendarEvent } from '../../calendar-event/calendar-event';

/**
 * SQLite-backed data source for calendar events. Reads events from the `events` table and maps
 * each raw row (snake_case columns) to the application {@link CalendarEvent} model.
 */
@Injectable({
  providedIn: 'root',
})
export class CalendarService extends SqliteService {
  constructor() {
    super();
  }

  /**
   * Maps a raw SQLite row to a {@link CalendarEvent}, defaulting the optional time and audit
   * columns to empty strings when absent.
   * @param row The raw row returned by the SQLite driver.
   * @returns The corresponding calendar event.
   */
  private mapRowToEvent(row: any): CalendarEvent {
    return {
      id: row.id,
      title: row.title,
      date: row.date,
      start_time: row.start_time ?? '',
      end_time: row.end_time ?? '',
      created_at: row.created_at ?? '',
      updated_at: row.updated_at ?? '',
    };
  }

  /**
   * Retrieves every event of a given month.
   * @param month_date The target month as a `YYYY-MM` string, matched against the event date.
   * @returns A promise resolving to the events falling in that month.
   */
  public async getEventsFromRangedDate(month_date: string): Promise<CalendarEvent[]> {
    return this.runQuery('Erreur lors de la récupération des événements', async () => {
      const request = "SELECT * FROM events WHERE strftime('%Y-%m', date) = ?";
      const res = await this.db.query(request, [month_date]);
      const rows = res.values ?? [];
      return rows.map((row) => this.mapRowToEvent(row));
    });
  }

  /**
   * Retrieves every event scheduled on a specific day.
   * @param date The target day as a `YYYY-MM-DD` string.
   * @returns A promise resolving to the events on that day.
   */
  public async getEventsFromDate(date: string): Promise<CalendarEvent[]> {
    return this.runQuery('Erreur lors de la récupération des événements', async () => {
      const request = 'SELECT * FROM events WHERE date = ?';
      const res = await this.db.query(request, [date]);
      const rows = res.values ?? [];
      return rows.map((row) => this.mapRowToEvent(row));
    });
  }
}
