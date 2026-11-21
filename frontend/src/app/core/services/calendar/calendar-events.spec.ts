import { vi, expect, describe, it } from 'vitest';

import { sortEvents, groupEventsByDate } from './calendar-events';
import { CalendarEvent } from '../../models/calendar-event.model';
import { buildMonthGrid } from './calendar-grid';

/** Build a `CalendarEvent` for the test fixtures. */
function mk(id: string, date = '2026-04-05', start_time = '', end_time = ''): CalendarEvent {
  return { id, title: `Ev ${id}`, date, start_time, end_time, note: null };
}

describe('calendar-events helpers', () => {
  describe('sortEvents (T018–T022)', () => {
    it('T018 - classe par heure de début croissante quand les heures diffèrent', () => {
      const events = [mk('a', '2026-04-05', '14:30'), mk('b', '2026-04-05', '07:15'), mk('c', '2026-04-05', '09:00')];
      const sorted = sortEvents(events);
      expect(sorted.map((e) => e.start_time)).toEqual(['07:15', '09:00', '14:30']);
    });

    it('T019 - les événements sans heure de début apparaissent après ceux qui en ont une', () => {
      const events = [mk('n1'), mk('h2', '2026-04-05', '18:00'), mk('n3'), mk('h1', '2026-04-05', '08:00')];
      const sorted = sortEvents(events);
      expect(sorted.map((e) => e.id)).toEqual(['h1', 'h2', 'n1', 'n3']); // has-hour first, then no-hour
    });

    it('T020 - même heure de début : ordre déterministe par identifiant croissant', () => {
      const events = [mk('b', '2026-04-05', '10:00'), mk('a', '2026-04-05', '10:00'), mk('c', '2026-04-05', '10:00')];
      expect(sortEvents(events).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    });

    it('T021 - plusieurs événements sans heure : ordre déterministe via identifiant croissant (et après ceux avec heure)', () => {
      const events = [mk('x'), mk('h', '2026-04-05', '09:00'), mk('m'), mk('p')];
      expect(sortEvents(events).map((e) => e.id)).toEqual(['h', 'm', 'p', 'x']); // with-hour first, then id order
    });

    it('T022 - collection vide ou unique : résultat valide sans erreur ; ne mute pas l entrée', () => {
      const empty = sortEvents([]);
      expect(empty).toEqual([]);

      const single = mk('only', '2026-04-05', '12:00');
      const out = sortEvents([single]);
      expect(out).toHaveLength(1);
      expect(out[0]).toBe(single);

      // Immutability : le tri renvoie un nouveau tableau, lentrée garde son ordre dorigine.
      const unsorted = [mk('c', '2026-04-05', '12:00'), mk('a', '2026-04-05', '09:00'), mk('b', '2026-04-05', '10:00')];
      const sorted = sortEvents(unsorted);
      expect(sorted.map((e) => e.id)).toEqual(['a', 'b', 'c']);
      expect(unsorted.map((e) => e.id)).toEqual(['c', 'a', 'b']); // ordre dorigine intact
    });
  });

  describe('groupEventsByDate (T023–T026)', () => {
    const grid = buildMonthGrid(2026, 4); // April 2026: leading tail [Mar 30/31], trailing head [May 1..10]

    it('T023 - plusieurs événements sur des dates différentes : chacun associé à sa bonne date civile', () => {
      const events = [mk('d1', '2026-04-07'), mk('d2', '2026-04-09'), mk('d3', '2026-04-15')];
      const grouped = groupEventsByDate(grid, events);

      expect(grouped).toHaveLength(42);
      const day = (key: string) => grouped.find((d) => d.date === key)!;
      expect(day('2026-04-07').events.map((e) => e.id)).toEqual(['d1']);
      expect(day('2026-04-09').events.map((e) => e.id)).toEqual(['d2']);
      expect(day('2026-04-15').events.map((e) => e.id)).toEqual(['d3']);
    });

    it('T024 - plusieurs événements sur une même date : regroupés dans la collection de cette journée (ordre préservé)', () => {
      const events = [mk('m1', '2026-04-12'), mk('m2', '2026-04-12'), mk('m3', '2026-04-12')];
      const grouped = groupEventsByDate(grid, events);
      expect(grouped).toHaveLength(42);
      const day = grouped.find((d) => d.date === '2026-04-12')!;
      expect(day.events.map((e) => e.id)).toEqual(['m1', 'm2', 'm3']);
    });

    it('T025 - événements des mois adjacents : associés à leur date réelle au sein de la grille (queue/tête du mois)', () => {
      // March 30 & 31 are the leading tail of April; May 1..6 are its trailing head — all real grid cells.
      const events = [mk('prev', '2026-03-30'), mk('prevend', '2026-03-31'), mk('next', '2026-05-04')];
      const grouped = groupEventsByDate(grid, events);

      expect(grouped).toHaveLength(42);
      const day = (key: string) => grouped.find((d) => d.date === key)!;
      // Matched by real civil-date string equality regardless of displayed month.
      expect(day('2026-03-30').events.map((e) => e.id)).toEqual(['prev']);
      expect(day('2026-03-31').events.map((e) => e.id)).toEqual(['prevend']);
      expect(day('2026-05-04').events.map((e) => e.id)).toEqual(['next']);
    });

    it('T026 - collection vide : toutes les dates de la grille possèdent une collection vide', () => {
      const grouped = groupEventsByDate(buildMonthGrid(2024, 1), []);
      expect(grouped).toHaveLength(42);
      for (const day of grouped) {
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(day.events).toEqual([]);
      }
    });

    it('T026 - dates sans événement : les cellules non couvertes restent vides', () => {
      const events = [mk('e', '2026-04-18')];
      const grouped = groupEventsByDate(grid, events);
      expect(grouped.find((d) => d.date === '2026-04-18')!.events).toHaveLength(1);
      // Every other cell of the 42-grid is untouched.
      expect(grouped.filter((d) => d.events.length === 0)).toHaveLength(41);
    });
  });
});
