import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { NotesService } from './notes-service';
import {CategoriesService} from './categories.service'
import { Category, Note } from '../models';
import { NoteBlock } from '../models/document.model';


/**
 * Contrat CIBLE du service (TDD) — version **blocks** (cf. .agent/PLAN_TESTS_NOTES_SERVICE_BLOCKS.md).
 * `Note.content: string` a été remplacé par `Note.blocks: NoteBlock[]` ; la colonne SQLite `content`
 * stocke `JSON.stringify(blocks)`, décodée à la lecture (avec migration de l'ancien HTML / ancien
 * format JSON).
 */
type NoteDraft = Omit<Note, 'id' | 'updatedAt'>;
type NoteUpdate = Omit<Note, 'updatedAt'>;

interface NotesServiceContract {
  getAllNotes(): Promise<Note[]>;
  getNoteById(id: string): Promise<Note | null>;
  createNote(draft: NoteDraft, categoryName : (string | null)): Promise<Note>;
  updateNote(note: NoteUpdate, categoryName: (string | null)): Promise<void>;
  deleteNote(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Doublures du plugin SQLite (hoisted)
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const dbConnection = {
    open: vi.fn(),
    close: vi.fn(),
    execute: vi.fn(),
    run: vi.fn(),
    query: vi.fn(),
  };
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
  class SQLiteConnection {
    constructor() {
      return mocks.sqliteConnection as unknown as SQLiteConnection;
    }
  }
  return { CapacitorSQLite: {}, SQLiteConnection };
});

// ---------------------------------------------------------------------------
// Données de référence
// ---------------------------------------------------------------------------

/** JSON (nouveau format) d'un document à un seul paragraphe. */
const CONTENT_JSON = JSON.stringify([{ id: 'b1', kind: 'text', text: 'Pain, Lait', marks: [] }]);

function dbRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = {
    id: '550e8400-0001',
    title: 'Liste de courses',
    content: CONTENT_JSON,
    category_id: 'cat-uuid-1',
    category_name: 'Personnel',
    category_color: '#ffffff',
    updated_at: '2026-09-01 08:00:00',
  };
  return { ...base, ...overrides };
}

const ROW_A = dbRow({ id: 'id-a', title: 'Note A', category_id: 'cat-a', category_name: 'Personnel', category_color: '#ff0000', updated_at: '2026-09-03 10:00:00' });
const ROW_B = dbRow({ id: 'id-b', title: 'Note B', category_id: 'cat-b', category_name: 'Travail', category_color: '#00ff00', updated_at: '2026-09-02 09:00:00' });
const ROW_C = dbRow({ id: 'id-c', title: 'Note C', category_id: 'cat-c', category_name: 'Famille', category_color: '#0000ff', updated_at: '2026-09-01 08:00:00' });
const SAMPLE_ROWS = [ROW_A, ROW_B, ROW_C];

describe('NotesService (accès SQLite, modèle blocks)', () => {
  let service: NotesServiceContract;

  beforeEach(() => {
    if (typeof customElements !== 'undefined') {
      vi.spyOn(customElements, 'whenDefined').mockResolvedValue(undefined as never);
    }

    mocks.dbConnection.open.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.close.mockReset().mockResolvedValue(undefined);
    mocks.dbConnection.execute.mockReset().mockResolvedValue({ changes: { changes: 1 } });
    mocks.dbConnection.run.mockReset().mockResolvedValue({ changes: { changes: 1, lastId: 1 } });
    mocks.dbConnection.query.mockReset().mockResolvedValue({ values: [] });

    mocks.sqliteConnection.createConnection.mockReset().mockResolvedValue(mocks.dbConnection);
    mocks.sqliteConnection.retrieveConnection.mockReset().mockResolvedValue(mocks.dbConnection);
    mocks.sqliteConnection.closeConnection.mockReset().mockResolvedValue(undefined);
    mocks.sqliteConnection.isConnection.mockReset().mockResolvedValue({ result: false });
    mocks.sqliteConnection.isDatabase.mockReset().mockResolvedValue({ result: true });
    mocks.sqliteConnection.copyFromAssets.mockReset().mockResolvedValue(undefined);
    mocks.sqliteConnection.initWebStore.mockReset().mockResolvedValue(undefined);
    mocks.sqliteConnection.saveToStore.mockReset().mockResolvedValue(undefined);
    mocks.sqliteConnection.checkConnectionsConsistency.mockReset().mockResolvedValue({ result: false });

    TestBed.configureTestingModule({});
    service = TestBed.inject(NotesService) as unknown as NotesServiceContract;
  });

  function allRunParams(): unknown[] {
    return mocks.dbConnection.run.mock.calls.flatMap((call) => (call[1] as unknown[]) ?? []);
  }
  function allQueryParams(): unknown[] {
    return mocks.dbConnection.query.mock.calls.flatMap((call) => (call[1] as unknown[]) ?? []);
  }
  function writeStatements(): string {
    const runSql = mocks.dbConnection.run.mock.calls.map((call) => String(call[0]));
    const executeSql = mocks.dbConnection.execute.mock.calls.map((call) => String(call[0]));
    return [...runSql, ...executeSql].join(' | ').toLowerCase();
  }

  it('est instanciable', () => {
    expect(service).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // G1 — getAllNotes (lecture + mapping)
  // -------------------------------------------------------------------------
  describe('getAllNotes', () => {
    it('mappe les lignes DB (updated_at -> updatedAt) et décode les blocs', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [ROW_A] });

      const first = (await service.getAllNotes())[0];

      expect(first.id).toBe('id-a');
      expect(first.title).toBe('Note A');
      expect(first.category!.name).toBe('Personnel');
      expect(first.updatedAt).toBe('2026-09-03 10:00:00');
      const raw = first as unknown as Record<string, unknown>;
      expect(raw['updated_at']).toBeUndefined();
      expect(first.blocks).toEqual([{ id: 'b1', kind: 'text', text: 'Pain, Lait', marks: [] }]);
    });

    it('décode [] si le contenu est nul (pas de plantage)', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [dbRow({ content: null })] });
      const notes = await service.getAllNotes();
      expect(notes[0].blocks).toEqual([]);
    });

    it('renvoie un tableau vide quand la base ne contient aucune note', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [] });
      expect(await service.getAllNotes()).toEqual([]);
    });

    it('conserve l’ordre de la requête', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: SAMPLE_ROWS });
      const ids = (await service.getAllNotes()).map((n) => n.id);
      expect(ids).toEqual(['id-a', 'id-b', 'id-c']);
    });

    it('remonte l’erreur si la requête échoue', async () => {
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
      expect(note!.id).toBe('id-b');
      expect(note!.blocks).toEqual([{ id: 'b1', kind: 'text', text: 'Pain, Lait', marks: [] }]);
    });

    it('renvoie undefined quand aucune note ne correspond', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [] });
      expect(await service.getNoteById('inconnu')).toBeNull();
    });

    it('transmet l’identifiant en paramètre lié', async () => {
      mocks.dbConnection.query.mockResolvedValue({ values: [ROW_C] });
      await service.getNoteById('id-c');
      console.log("TEST BOBO", allQueryParams())
      expect(allQueryParams()).toContain('id-c');
    });
  });

  // -------------------------------------------------------------------------
  // G3 — createNote (encode)
  // -------------------------------------------------------------------------
  describe('createNote', () => {
    const blocks: NoteBlock[] = [{ id: 'b1', kind: 'text', text: 'Bonjour', marks: [] }];
    const category : Category = { id: 'cat-work', name: 'Travail' }
    const input: NoteDraft = { title: 'Nouvelle note', category, blocks };

    it('déclenche un INSERT avec titre et catégorie (paramètres liés)', async () => {
      const categories = TestBed.inject(CategoriesService); 
      vi.spyOn(categories, 'get').mockResolvedValue(category);
      await service.createNote(input, 'Travail');
      const params = allRunParams();
      expect(writeStatements()).toContain('insert');
      expect(params).toContain('Nouvelle note');
      expect(params).toContain('cat-work');
    });

    it('transmet le JSON des blocs en paramètre lié de l’INSERT', async () => {
      await service.createNote(input, null);
      expect(allRunParams()).toContain(JSON.stringify(blocks));
    });

    it('renvoie la note créée avec ses blocs et un id non vide', async () => {
      const created = await service.createNote(input, null);
      expect(created.title).toBe('Nouvelle note');
      expect(created.blocks).toEqual(blocks);
      expect(created.id.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // G4 — updateNote (encode)
  // -------------------------------------------------------------------------
  describe('updateNote', () => {
    const blocks: NoteBlock[] = [{ id: 'b1', kind: 'text', text: 'MàJ', marks: [] }];
    const category : Category = { id: 'cat-pers', name: 'Personnel', color:''}
    const updated: NoteUpdate = { id: 'id-a', title: 'Titre modifié', category, blocks };

    it('déclenche un UPDATE ciblant le bon id avec le JSON des blocs', async () => {
      const categories = TestBed.inject(CategoriesService); 
      vi.spyOn(categories, 'get').mockResolvedValue(category);
      
      await service.updateNote(updated, 'Personnal');
      const params = allRunParams();
      expect(writeStatements()).toContain('update');
      expect(params).toContain('id-a');
      expect(params).toContain('Titre modifié');
      expect(params).toContain(JSON.stringify(blocks));
      expect(params).toContain('cat-pers');
    });
  });

  // -------------------------------------------------------------------------
  // G5 — deleteNote
  // -------------------------------------------------------------------------
  describe('deleteNote', () => {
    it('déclenche une suppression liée au bon id', async () => {
      await service.deleteNote('id-a');
      expect(writeStatements()).toContain('delete');
      expect(allRunParams()).toContain('id-a');
    });

    it('remonte l’erreur si la suppression échoue', async () => {
      mocks.dbConnection.run.mockRejectedValue(new Error('Suppression impossible'));
      await expect(service.deleteNote('id-a')).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // G6 — décodage & migration (decodeContent)
  // -------------------------------------------------------------------------
  describe('décodage & migration', () => {
    async function decodeOnly(content: unknown): Promise<NoteBlock[]> {
      mocks.dbConnection.query.mockResolvedValue({ values: [dbRow({ content })] });
      return (await service.getAllNotes())[0].blocks;
    }

    it('A2 migre un ancien bloc heading (h1)', async () => {
      const legacy = JSON.stringify([{ id: 'b1', type: 'heading', content: 'Courses', style: { size: 'h1' } }]);
      expect(await decodeOnly(legacy)).toEqual([{ id: 'b1', kind: 'h1', text: 'Courses', marks: [] }]);
    });

    it('A3 migre les anciens blocs text / image / video', async () => {
      const legacy = JSON.stringify([
        { id: 'b1', type: 'text', content: 'Para', style: { size: 'normal' } },
        { id: 'b2', type: 'image', src: 'x.jpg' },
        { id: 'b3', type: 'video', url: 'https://v/y' },
      ]);
      expect(await decodeOnly(legacy)).toEqual([
        { id: 'b1', kind: 'text', text: 'Para', marks: [] },
        { id: 'b2', kind: 'image', src: 'x.jpg' },
        { id: 'b3', kind: 'video', url: 'https://v/y' },
      ]);
    });

    it('A4 migre du HTML brut en blocs', async () => {
      const blocks = await decodeOnly('<h1>Titre</h1><p>x</p>');
      expect(blocks.map((b) => b.kind)).toEqual(['h1', 'text']);
      expect((blocks[0] as any).text).toBe('Titre');
    });

    it('A5 replie une chaîne non-JSON en un bloc texte', async () => {
      const blocks = await decodeOnly('Bonjour');
      expect(blocks).toEqual([expect.objectContaining({ kind: 'text', text: 'Bonjour', marks: [] })]);
    });

    it('A7 replie un JSON invalide en un bloc texte (pas de plantage)', async () => {
      const blocks = await decodeOnly('[{bad');
      expect(blocks).toEqual([expect.objectContaining({ kind: 'text', text: '[{bad' })]);
    });
  });
});
