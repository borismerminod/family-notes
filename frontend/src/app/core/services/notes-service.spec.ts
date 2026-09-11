import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { NotesService } from './notes-service';
import { Note } from '../models';

/**
 * Contrat CIBLE du service, fixé par ces tests (TDD).
 * On type l'instance injectée avec ce contrat pour que le spec compile même si
 * certaines méthodes ne sont pas encore implémentées : elles échoueront alors à
 * l'exécution (vrai « rouge ») au lieu de bloquer toute la suite à la compilation.
 *
 * Les entrées s'appuient sur le modèle `Note` (classes de données du domaine) :
 *   - création : ni `id` ni `updatedAt` (générés par le service) ;
 *   - mise à jour : `id` requis, `updatedAt` regénéré par le service.
 */
type NoteDraft = Omit<Note, 'id' | 'updatedAt'>;
type NoteUpdate = Omit<Note, 'updatedAt'>;

interface NotesServiceContract {
  getAllNotes(): Promise<Note[]>;
  getNoteById(id: string): Promise<Note | undefined>;
  createNote(draft: NoteDraft): Promise<Note>;
  updateNote(note: NoteUpdate): Promise<void>;
  deleteNote(id: string): Promise<void>;
}

/**
 * Tests du `NotesService` (approche TDD / boîte noire).
 *
 * Voir .agent/PLAN_NOTES.md et .agent/IMPL_NOTES_CRUD.md pour le rôle du service :
 * couche d'accès aux données qui récupère et manipule les notes stockées dans SQLite
 * (@capacitor-community/sqlite).
 *
 * Ces tests décrivent le COMPORTEMENT attendu avant de regarder l'implémentation :
 * ils fixent le contrat, l'implémentation devra s'y conformer.
 *
 * Stratégie de doublure : on remplace tout le plugin `@capacitor-community/sqlite`
 * par une fausse connexion. Les tests PILOTENT ce que renvoie `query(...)` et
 * INSPECTENT ce qui est passé à `run(...)` / `execute(...)`.
 *
 * Rappels de schéma (scripts/schema_notes.sql), les lignes SQLite sont en snake_case :
 *   notes(id, title, content, category, updated_at)
 * Le modèle applicatif expose `updatedAt` : le mapping `updated_at` -> `updatedAt`
 * est donc un point central à vérifier.
 */

// ---------------------------------------------------------------------------
// Doublures du plugin SQLite (hoisted : accessibles au factory de vi.mock ET aux tests)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  // Fausse connexion base de données (SQLiteDBConnection)
  const dbConnection = {
    open: vi.fn(),
    close: vi.fn(),
    execute: vi.fn(),
    run: vi.fn(),
    query: vi.fn(),
  };

  // Fausse connexion racine (SQLiteConnection) : renvoie toujours la même dbConnection
  const sqliteConnection = {
    createConnection: vi.fn(),
    retrieveConnection: vi.fn(),
    closeConnection: vi.fn(),
    isConnection: vi.fn(),
    isDatabase: vi.fn(),
    copyFromAssets: vi.fn(),
    initWebStore: vi.fn(),
    saveToStore: vi.fn(),
    checkConnectionsConsistency: vi.fn(),
  };

  return { dbConnection, sqliteConnection };
});

vi.mock('@capacitor-community/sqlite', () => {
  // `new SQLiteConnection(...)` dans le service doit retomber sur notre doublure.
  // Un constructeur qui renvoie un objet remplace l'instance créée.
  class SQLiteConnection {
    constructor() {
      return mocks.sqliteConnection as unknown as SQLiteConnection;
    }
  }
  return {
    CapacitorSQLite: {},
    SQLiteConnection,
  };
});

// ---------------------------------------------------------------------------
// Données de référence (inspirées de scripts/seed_notes.sql)
// ---------------------------------------------------------------------------

/** Construit une ligne DB (snake_case), telle que renvoyée par `query(...).values`. */
function dbRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = {
    id: '550e8400-0001',
    title: 'Liste de courses',
    content: '<p>Pain, Lait</p>',
    category: 'Personnel',
    updated_at: '2026-09-01 08:00:00',
  };
  return { ...base, ...overrides };
}

const ROW_A = dbRow({ id: 'id-a', title: 'Note A', category: 'Personnel', updated_at: '2026-09-03 10:00:00' });
const ROW_B = dbRow({ id: 'id-b', title: 'Note B', category: 'Travail', updated_at: '2026-09-02 09:00:00' });
const ROW_C = dbRow({ id: 'id-c', title: 'Note C', category: 'Famille', updated_at: '2026-09-01 08:00:00' });
const SAMPLE_ROWS = [ROW_A, ROW_B, ROW_C];

describe('NotesService (accès SQLite)', () => {
  let service: NotesServiceContract;

  beforeEach(() => {
    // jsdom ne fournit pas le web component `jeep-sqlite` que le plugin attend en web :
    // on débloque cette attente pour que l'initialisation du service se termine.
    if (typeof customElements !== 'undefined') {
      vi.spyOn(customElements, 'whenDefined').mockResolvedValue(undefined as never);
    }

    // Réinitialise les doublures et (re)pose des valeurs par défaut « base vide / écriture OK ».
    mocks.dbConnection.open.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.close.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.execute.mockReset().mockResolvedValue({ changes: { changes: 1 } });
    mocks.dbConnection.run.mockReset().mockResolvedValue({ changes: { changes: 1, lastId: 1 } });
    mocks.dbConnection.query.mockReset().mockResolvedValue({ values: [] });

    mocks.sqliteConnection.createConnection.mockReset().mockResolvedValue(mocks.dbConnection);
    mocks.sqliteConnection.retrieveConnection.mockReset().mockResolvedValue(mocks.dbConnection);
    mocks.sqliteConnection.closeConnection.mockReset().mockResolvedValue(undefined);
    mocks.sqliteConnection.isConnection.mockReset().mockResolvedValue({ result: false });
    // Base déjà présente => le service saute le seed copyFromAssets pendant les tests.
    mocks.sqliteConnection.isDatabase.mockReset().mockResolvedValue({ result: true });
    mocks.sqliteConnection.copyFromAssets.mockReset().mockResolvedValue(undefined);
    mocks.sqliteConnection.initWebStore.mockReset().mockResolvedValue(undefined);
    mocks.sqliteConnection.saveToStore.mockReset().mockResolvedValue(undefined);
    mocks.sqliteConnection.checkConnectionsConsistency.mockReset().mockResolvedValue({ result: false });

    TestBed.configureTestingModule({});
    service = TestBed.inject(NotesService) as unknown as NotesServiceContract;
  });

  // Toutes les valeurs (id, title, ...) transmises à `run(...)` via des paramètres liés.
  function allRunParams(): unknown[] {
    return mocks.dbConnection.run.mock.calls.flatMap((call) => (call[1] as unknown[]) ?? []);
  }

  // Toutes les valeurs transmises à `query(...)` via des paramètres liés.
  function allQueryParams(): unknown[] {
    return mocks.dbConnection.query.mock.calls.flatMap((call) => (call[1] as unknown[]) ?? []);
  }

  // Texte SQL de tous les appels d'écriture (run + execute), en minuscules.
  function writeStatements(): string {
    const runSql = mocks.dbConnection.run.mock.calls.map((call) => String(call[0]));
    const executeSql = mocks.dbConnection.execute.mock.calls.map((call) => String(call[0]));
    return [...runSql, ...executeSql].join(' | ').toLowerCase();
  }

  it('est instanciable', () => {
    expect(service).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // G1 — getAllNotes (lecture)
  // -------------------------------------------------------------------------
  describe('getAllNotes', () => {
    it('mappe les lignes DB (snake_case) vers des notes (updated_at -> updatedAt)', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [ROW_A] });

      const notes = await service.getAllNotes();
      const first = notes[0];

      expect(first.id).toBe('id-a');
      expect(first.title).toBe('Note A');
      expect(first.category).toBe('Personnel');
      expect(first.updatedAt).toBe('2026-09-03 10:00:00');
      // Le mapping doit produire du camelCase : la clé brute snake_case ne doit pas rester.
      const raw = first as unknown as Record<string, unknown>;
      expect(raw['updated_at']).toBeUndefined();
      // La colonne `content` (HTML) est reprise telle quelle.
      expect(first.content).toBe('<p>Pain, Lait</p>');
    });

    it('reprend le contenu tel quel, chaîne vide si nul (pas de plantage)', async () => {
      mocks.dbConnection.query.mockResolvedValue({
        values: [dbRow({ content: null }), dbRow({ id: 'id-x', content: '<h1>Titre</h1>' })],
      });

      const notes = await service.getAllNotes();

      expect(notes[0].content).toBe('');
      expect(notes[1].content).toBe('<h1>Titre</h1>');
    });

    it('renvoie un tableau vide quand la base ne contient aucune note', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [] });

      const notes = await service.getAllNotes();

      expect(notes).toEqual([]);
    });

    it('renvoie une note par ligne, en conservant l’ordre de la requête', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: SAMPLE_ROWS });

      const notes = await service.getAllNotes();
      const ids = notes.map((note) => note.id);

      expect(notes.length).toBe(SAMPLE_ROWS.length);
      expect(ids).toEqual(['id-a', 'id-b', 'id-c']);
    });

    it('remonte l’erreur si la requête échoue (pas d’échec silencieux)', async () => {
      mocks.dbConnection.query.mockRejectedValue(new Error('DB indisponible'));

      await expect(service.getAllNotes()).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // G2 — getNoteById
  // -------------------------------------------------------------------------
  describe('getNoteById', () => {
    it('renvoie la note mappée quand la ligne existe', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [ROW_B] });

      const note = await service.getNoteById('id-b');

      expect(note).toBeTruthy();
      expect(note!.id).toBe('id-b');
      expect(note!.title).toBe('Note B');
      expect(note!.updatedAt).toBe('2026-09-02 09:00:00');
    });

    it('renvoie undefined quand aucune note ne correspond', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [] });

      const note = await service.getNoteById('inconnu');

      expect(note).toBeUndefined();
    });

    it('transmet l’identifiant en paramètre lié (pas d’interpolation dans le SQL)', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [ROW_C] });

      await service.getNoteById('id-c');
      const params = allQueryParams();

      expect(params).toContain('id-c');
    });
  });

  // -------------------------------------------------------------------------
  // G3 — createNote
  // -------------------------------------------------------------------------
  describe('createNote', () => {
    const input: NoteDraft = {
      title: 'Nouvelle note',
      category: 'Travail',
      content: '<p>Bonjour</p>',
    };

    it('déclenche une écriture INSERT contenant le titre et la catégorie (paramètres liés)', async () => {
      await service.createNote(input);
      const params = allRunParams();

      expect(writeStatements()).toContain('insert');
      expect(params).toContain('Nouvelle note');
      expect(params).toContain('Travail');
    });

    it('transmet le contenu HTML en paramètre lié de l’INSERT', async () => {
      await service.createNote(input);
      const params = allRunParams();

      expect(params).toContain('<p>Bonjour</p>');
    });

    it('renvoie la note créée, avec un identifiant non vide et son contenu', async () => {
      const created = await service.createNote(input);

      expect(created.title).toBe('Nouvelle note');
      expect(created.category).toBe('Travail');
      expect(created.content).toBe('<p>Bonjour</p>');
      expect(typeof created.id).toBe('string');
      expect(created.id.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // G4 — updateNote
  // -------------------------------------------------------------------------
  describe('updateNote', () => {
    const updated: NoteUpdate = {
      id: 'id-a',
      title: 'Titre modifié',
      category: 'Personnel',
      content: '<p>MàJ</p>',
    };

    it('déclenche une écriture UPDATE ciblant le bon identifiant avec les nouvelles valeurs', async () => {
      await service.updateNote(updated);
      const params = allRunParams();

      expect(writeStatements()).toContain('update');
      expect(params).toContain('id-a');
      expect(params).toContain('Titre modifié');
    });
  });

  // -------------------------------------------------------------------------
  // G5 — deleteNote
  // -------------------------------------------------------------------------
  describe('deleteNote', () => {
    it('déclenche une suppression liée au bon identifiant', async () => {
      await service.deleteNote('id-a');
      const params = allRunParams();

      expect(writeStatements()).toContain('delete');
      expect(params).toContain('id-a');
    });

    it('remonte l’erreur si la suppression échoue (pas d’échec silencieux)', async () => {
      mocks.dbConnection.run.mockRejectedValue(new Error('Suppression impossible'));

      await expect(service.deleteNote('id-a')).rejects.toThrow();
    });
  });
});
