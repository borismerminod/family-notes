import { Injectable } from '@angular/core';
import { SqliteService } from './sqlite-service';
import { CalendarEvent } from '../models/calendar-event.model';

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
      noteIds: row.note_ids ?? row.noteIds ?? [],
    };
  }

  /**
   * Retrieves every event whose civil date falls within the given inclusive range.
   *
   * The calendar grid always spans 42 real dates, some of which belong to the previous or next
   * month. Events must therefore be fetched over the whole visible interval `[start, end]` rather
   * than a single month, so that events on adjacent-month days are retrieved as well.
   *
   * Dates are compared as civil `YYYY-MM-DD` strings: ISO lexical ordering matches chronological
   * order and no UTC conversion is applied, so an event never shifts to the previous or next day.
   * @param range The inclusive interval `{ start, end }`, each a `YYYY-MM-DD` string.
   * @returns A promise resolving to every event whose date lies within that interval.
   */
  public async getEventsFromRangedDate(range: { start: string; end: string }): Promise<CalendarEvent[]> {
    return this.runQuery('Erreur lors de la récupération des événements', async () => {
      const request = 'SELECT * FROM events WHERE date >= ? AND date <= ?';
      const res = await this.db.query(request, [range.start, range.end]);
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
      return Promise.all(rows.map((row) => this.mapRowToEvent(row)));
    });
  }
}
