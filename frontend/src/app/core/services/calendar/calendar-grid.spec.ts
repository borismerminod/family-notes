import { vi, expect, describe, it } from 'vitest';

import {
  isLeapYear,
  daysInMonth,
  firstOfMonthGridColumnIndex,
  previousMonthKey,
  nextMonthKey,
  buildMonthGrid,
} from './calendar-grid';

/**
 * Independent reference for a real Gregorian civil date (UTC-based, so it never drifts on DST).
 * Used only to validate the grid helpers against actual calendar dates — not imported from the code under test.
 */
function parseRealDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

describe('calendar-grid helpers', () => {
  describe('isLeapYear / daysInMonth (support T012/T013)', () => {
    it('détecte les années bissextiles (2000 ok, 1900 refusé, 2021 refusée)', () => {
      expect(isLeapYear(2000)).toBe(true); // divisible by 400
      expect(isLeapYear(2024)).toBe(true); // divisible by 4, not century
      expect(isLeapYear(1900)).toBe(false); // century but not 400
      expect(isLeapYear(2021)).toBe(false);
    });

    it('février = 28 jours en année non bissextile (T012)', () => {
      expect(daysInMonth(2023, 2)).toBe(28);
    });

    it('février = 29 jours en année bissextile (T013)', () => {
      expect(daysInMonth(2024, 2)).toBe(29);
    });

    it('les mois de 30 et 31 jours sont corrects', () => {
      const thirty = [4, 6, 9, 11]; // April/June/Sep/Nov → 30
      const thirtyOne = [1, 3, 5, 7, 8, 10, 12]; // Jan/Mar/May/Jul/Aug/Oct/Dec → 31
      for (const m of thirty) expect(daysInMonth(2024, m)).toBe(30);
      for (const m of thirtyOne) expect(daysInMonth(2024, m)).toBe(31);
    });
  });

  describe('previousMonthKey / nextMonthKey', () => {
    it('le mois précédent de décembre passe à l\'année précédente (T017)', () => {
      expect(previousMonthKey(2026, 1)).toBe('2025-12');
      expect(previousMonthKey(2026, 3)).toBe('2026-02');
    });

    it('le mois suivant de janvier passe à l\'année suivante (T017)', () => {
      // December rolls into next year / January — the earlier '2026-12' answer encoded the bug.
      expect(nextMonthKey(2025, 12)).toBe('2026-01');
      expect(nextMonthKey(2025, 3)).toBe('2025-04'); // plain month advance: March → April
    });
  });

  describe('firstOfMonthGridColumnIndex', () => {
    it('retourne 0 pour un mois commençant lundi et 6 pour un dimanche (T014/T015)', () => {
      expect(firstOfMonthGridColumnIndex(2024, 1)).toBe(0); // 2024-01-01 = Monday
      expect(firstOfMonthGridColumnIndex(2024, 9)).toBe(6); // 2024-09-01 = Sunday
    });
  });

  describe('buildMonthGrid', () => {
    it('T010 - grille d\'un mois de 30 jours : 42 dates consécutives, positionnées lun.-dim.', () => {
      const grid = buildMonthGrid(2026, 4); // April 2026 (offset 2), 30 days
      expect(grid).toEqual([
        '2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02', '2026-04-03', '2026-04-04',
        '2026-04-05', '2026-04-06', '2026-04-07', '2026-04-08', '2026-04-09', '2026-04-10',
        '2026-04-11', '2026-04-12', '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16',
        '2026-04-17', '2026-04-18', '2026-04-19', '2026-04-20', '2026-04-21', '2026-04-22',
        '2026-04-23', '2026-04-24', '2026-04-25', '2026-04-26', '2026-04-27', '2026-04-28',
        '2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04',
        '2026-05-05', '2026-05-06', '2026-05-07', '2026-05-08', '2026-05-09', '2026-05-10',
      ]);
    });

    it('T011 - grille d\'un mois de 31 jours complète correctement les mois adjacents', () => {
      const grid = buildMonthGrid(2024, 1); // January 2024 (offset 0), 31 days → no leading tail
      expect(grid[30]).toBe('2024-01-31');
      expect(grid.slice(31)).toEqual(Array.from({ length: 11 }, (_, i) => `2024-02-${String(i + 1).padStart(2, '0')}`));
    });

    it('T014 - premier jour du mois en colonne 0 (lundi), sans décalage inutile', () => {
      const grid = buildMonthGrid(2024, 1); // Monday start: offset 0
      expect(grid).toEqual([
        '2024-01-01', '2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-06',
        '2024-01-07', '2024-01-08', '2024-01-09', '2024-01-10', '2024-01-11', '2024-01-12',
        '2024-01-13', '2024-01-14', '2024-01-15', '2024-01-16', '2024-01-17', '2024-01-18',
        '2024-01-19', '2024-01-20', '2024-01-21', '2024-01-22', '2024-01-23', '2024-01-24',
        '2024-01-25', '2024-01-26', '2024-01-27', '2024-01-28', '2024-01-29', '2024-01-30',
        '2024-01-31', '2024-02-01', '2024-02-02', '2024-02-03', '2024-02-04', '2024-02-05',
        '2024-02-06', '2024-02-07', '2024-02-08', '2024-02-09', '2024-02-10', '2024-02-11',
      ]);
      // No leading tail (offset 0): first cell is the real first-of-month.
      expect(grid[0]).toBe('2024-01-01');
    });

    it('T015 - premier jour du mois en dernière colonne de la première semaine (dimanche, offset 6)', () => {
      const grid = buildMonthGrid(2024, 9); // September 2024 starts on Sunday → col 6
      expect(grid).toEqual([
        '2024-08-26', '2024-08-27', '2024-08-28', '2024-08-29', '2024-08-30', '2024-08-31',
        '2024-09-01', '2024-09-02', '2024-09-03', '2024-09-04', '2024-09-05', '2024-09-06',
        '2024-09-07', '2024-09-08', '2024-09-09', '2024-09-10', '2024-09-11', '2024-09-12',
        '2024-09-13', '2024-09-14', '2024-09-15', '2024-09-16', '2024-09-17', '2024-09-18',
        '2024-09-19', '2024-09-20', '2024-09-21', '2024-09-22', '2024-09-23', '2024-09-24',
        '2024-09-25', '2024-09-26', '2024-09-27', '2024-09-28', '2024-09-29', '2024-09-30',
        '2024-10-01', '2024-10-02', '2024-10-03', '2024-10-04', '2024-10-05', '2024-10-06',
      ]);
      // First-of-month lands in column 6 (last of the first week); columns 0..5 are prev-month.
      expect(grid.indexOf('2024-09-01')).toBe(6);
      expect(Array.from({ length: 6 }, (_, i) => `2024-08-${String(i + 26).padStart(2, '0')}`)).toEqual(grid.slice(0, 6));
    });

    it('T016 - les 42 cases sont des dates réelles, uniques et consécutives (aucune case vide ni fictive)', () => {
      const samples: Array<[number, number]> = [
        [2023, 1], [2023, 2], [2024, 1], [2024, 2], // non-leap / leap Februarys
        [2026, 4], [2025, 9], [2025, 12],           // leading tail + trailing head
      ];
      for (const [year, month] of samples) {
        const grid = buildMonthGrid(year, month);

        // Exactly 42 unique cells.
        expect(grid.length).toBe(42);
        expect(new Set(grid).size).toBe(42);

        // Every cell is a real civil date and parses back identically (no fictive / zero-padded drift).
        for (const key of grid) {
          const parsed = parseRealDate(key);
          expect(`${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`).toBe(key);
        }

        // Strictly consecutive Gregorian days: adjacent cells differ by exactly one UTC day (86_400_000 ms),
        // which is DST-free because both are built from civil dates.
        for (let i = 1; i < grid.length; i++) {
          expect(parseRealDate(grid[i]).getTime() - parseRealDate(grid[i - 1]).getTime()).toBe(86_400_000);
        }

        // The single occurrence of the first-of-month sits at its real weekday column.
        const expectedOffset = firstOfMonthGridColumnIndex(year, month);
        expect(grid.indexOf(`${year}-${String(month).padStart(2, '0')}-01`)).toBe(expectedOffset);
      }
    });

    it('T017 - passage d\'année : décembre et janvier sont calculés et ordonnés correctement', () => {
      const grid = buildMonthGrid(2025, 12); // December → January of next year (offset 0)
      expect(grid).toEqual([
        '2025-12-01', '2025-12-02', '2025-12-03', '2025-12-04', '2025-12-05', '2025-12-06',
        '2025-12-07', '2025-12-08', '2025-12-09', '2025-12-10', '2025-12-11', '2025-12-12',
        '2025-12-13', '2025-12-14', '2025-12-15', '2025-12-16', '2025-12-17', '2025-12-18',
        '2025-12-19', '2025-12-20', '2025-12-21', '2025-12-22', '2025-12-23', '2025-12-24',
        '2025-12-25', '2025-12-26', '2025-12-27', '2025-12-28', '2025-12-29', '2025-12-30',
        '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05',
        '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09', '2026-01-10', '2026-01-11',
      ]);

      // December 31 and January 1 are adjacent, in that order, across the year boundary.
      const dec31Idx = grid.indexOf('2025-12-31');
      expect(dec31Idx).toBeGreaterThan(-1);
      expect(grid[dec31Idx + 1]).toBe('2026-01-01');
    });
  });
});
