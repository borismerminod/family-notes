import { TestBed } from '@angular/core/testing';

import { CalendarService } from './calendar-service';
import { CalendarEvent } from '../models/calendar-event.model';
import { vi, expect, describe, it, beforeEach } from 'vitest';

describe('CalendarService', () => {
  let service: CalendarService;
  let mockDb: any;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [CalendarService],
    });
    service = TestBed.inject(CalendarService);

    // Mocking the protected db and ready properties to avoid actual database initialization.
    mockDb = {
      query: vi.fn().mockImplementation(async () => ({ values: [] })),
      run: vi.fn().mockImplementation(async () => ({})),
    };

    (service as any).db = mockDb;
    (service as any).ready = Promise.resolve();
    // Mock the persist method to prevent it from calling the real Capacitor plugin.
    (service as any).persist = vi.fn().mockResolvedValue(undefined);
  });

  describe('getEventsFromRangedDate', () => {
    const range = { start: '2026-11-01', end: '2026-12-31' };

    it('T001 - retourne les événements compris dans la plage demandée (grille mensuelle)', async () => {
      const events: CalendarEvent[] = [
        { id: 'e1', title: 'Nov', date: '2026-11-15', start_time: '09:00', end_time: '10:00', noteIds: [] },
        { id: 'e2', title: 'Déc', date: '2026-12-20', start_time: '', end_time: '', noteIds: ['n1'] },
      ];
      mockDb.query.mockImplementation(async () => ({ values: events }));

      const result = await service.getEventsFromRangedDate(range);

      expect(result).toEqual(events);
      // Bornes inclusives : la requête couvre toute l'étendue de la grille.
      expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('date >= ? AND date <= ?'), [range.start, range.end]);
    });

    it('T002 - inclut les événements des mois adjacents présents dans la plage', async () => {
      const events: CalendarEvent[] = [
        { id: 'prev', title: 'Octobre', date: '2026-10-30', start_time: '', end_time: '', noteIds: [] },
        { id: 'main', title: 'Novembre', date: '2026-11-15', start_time: '', end_time: '', noteIds: [] },
        { id: 'next', title: 'Décembre', date: '2026-12-31', start_time: '', end_time: '', noteIds: [] },
      ];
      mockDb.query.mockImplementation(async () => ({ values: events }));

      const result = await service.getEventsFromRangedDate(range);

      expect(result.map((e) => e.id)).toEqual(['prev', 'main', 'next']);
    });

    it('T003 - récupère tous les événements associés à une même date, sans perte ni duplication', async () => {
      const events: CalendarEvent[] = [
        { id: 'a', title: 'Premier', date: '2026-11-15', start_time: '08:00', end_time: '09:00', noteIds: [] },
        { id: 'b', title: 'Deuxième', date: '2026-11-15', start_time: '10:00', end_time: '', noteIds: [] },
        { id: 'c', title: 'Troisième', date: '2026-11-15', start_time: '', end_time: '', noteIds: [] },
      ];
      mockDb.query.mockImplementation(async () => ({ values: events }));

      const result = await service.getEventsFromRangedDate(range);

      expect(result).toHaveLength(3);
      expect(result.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    });

    it('T004 - retourne une collection vide (et non une erreur) quand la plage est sans événement', async () => {
      mockDb.query.mockImplementation(async () => ({ values: [] }));

      const result = await service.getEventsFromRangedDate(range);

      expect(result).toEqual([]);
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('T005 - convertit les lignes en objets CalendarEvent avec toutes leurs propriétés', async () => {
      mockDb.query.mockImplementation(async () => ({
        values: [{
          id: 'e1',
          title: 'Rencontre',
          date: '2026-11-15',
          start_time: '14:30',
          end_time: '15:30',
          note_ids: ['note-a', 'note-b'],
        }],
      }));

      const result = await service.getEventsFromRangedDate(range);

      expect(result).toEqual([
        { id: 'e1', title: 'Rencontre', date: '2026-11-15', start_time: '14:30', end_time: '15:30', noteIds: ['note-a', 'note-b'] },
      ]);
    });

    it('T005 - applique des valeurs par défaut aux colonnes optionnelles absentes', async () => {
      mockDb.query.mockImplementation(async () => ({
        values: [{ id: 'e1', title: 'Sans horaire ni notes', date: '2026-11-15' }],
      }));

      const result = await service.getEventsFromRangedDate(range);

      expect(result[0].start_time).toBe('');
      expect(result[0].end_time).toBe('');
      expect(result[0].noteIds).toEqual([]);
    });

    it('T006 - conserve la date au format civil YYYY-MM-DD, sans décalage de fuseau horaire', async () => {
      mockDb.query.mockImplementation(async () => ({
        values: [{ id: 'e1', title: 'Journée fixe', date: '2026-11-15', start_time: '', end_time: '', noteIds: [] }],
      }));

      const result = await service.getEventsFromRangedDate(range);

      // La date est renvoyée telle qu'elle est stockée, sans conversion en UTC.
      expect(result[0].date).toBe('2026-11-15');
    });

    it('T007 - remonte l\'erreur de la requête SQLite à la couche appelante', async () => {
      const dbError = new Error('SQLite failed');
      mockDb.query.mockImplementation(async () => {
        throw dbError;
      });

      await expect(service.getEventsFromRangedDate(range)).rejects.toBe(dbError);
    });

    it('T008 - récupère les événements situés exactement aux bornes de la plage', async () => {
      const events: CalendarEvent[] = [
        { id: 'start', title: 'Début', date: '2026-11-01', start_time: '', end_time: '', noteIds: [] },
        { id: 'end', title: 'Fin', date: '2026-12-31', start_time: '', end_time: '', noteIds: [] },
      ];
      mockDb.query.mockImplementation(async () => ({ values: events }));

      const result = await service.getEventsFromRangedDate(range);

      expect(result.map((e) => e.id)).toEqual(['start', 'end']);
    });
  });
});
