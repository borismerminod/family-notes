import { Injectable } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { SqliteService } from './sqlite-service';
import { Observable } from 'rxjs';
import { CalendarEvent } from '../../calendar-event/calendar-event';

@Injectable({
  providedIn: 'root',
})
export class CalendarService extends SqliteService
{
  
  constructor()
  {
    super()
  }

  private mapRowToEvent(row: any) : CalendarEvent 
  {
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

  public async getEventsFromRangedDate(month_date : string) : Promise<CalendarEvent[]>
  {
    try
    {
      await this.ready

      const request = "SELECT * FROM events WHERE strftime('%Y-%m', date) = ?"
      const res = await this.db.query(request, [month_date])
      const rows = res.values ?? [];
      return rows.map((row) => this.mapRowToEvent(row));
    }
    catch(err)
    {
      console.error('Erreur lors de la récupération des événements', err);
      throw err;
    }
  }

}
