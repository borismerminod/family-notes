import { Injectable } from '@angular/core';
import { Note } from '../models/note.model';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';
import { SqliteService } from './sqlite-service';

@Injectable({
  providedIn: 'root',
})
export class NotesService extends SqliteService {

  constructor()
  {
    super()
  }

  /**
   * Convertit une ligne SQLite (snake_case) vers le modèle applicatif Note (camelCase).
   * La colonne `content` (HTML) est reprise telle quelle (pivot « document riche »).
   */
  private mapRowToNote(row: any): Note {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      content: row.content ?? '',
      updatedAt: row.updated_at,
    };
  }

  /**
   * Récupère toutes les notes de la base de données.
   */
  async getAllNotes(): Promise<Note[]> {
    try {
      await this.ready;
      const res = await this.db.query('SELECT * FROM notes ORDER BY updated_at DESC');
      const rows = res.values ?? [];
      return rows.map((row) => this.mapRowToNote(row));
    } catch (err) {
      console.error('Erreur lors de la récupération des notes', err);
      throw err;
    }
  }

  /**
   * Récupère une note par son identifiant, ou undefined si elle n'existe pas.
   */
  async getNoteById(id: string): Promise<Note | undefined> {
    try {
      await this.ready;
      const res = await this.db.query('SELECT * FROM notes WHERE id = ?', [id]);
      const rows = res.values ?? [];
      if (rows.length === 0) {
        return undefined;
      }
      return this.mapRowToNote(rows[0]);
    } catch (err) {
      console.error('Erreur lors de la récupération de la note', err);
      throw err;
    }
  }

  /**
   * Crée une nouvelle note et renvoie la note créée (avec son identifiant généré).
   */
  async createNote(draft: Omit<Note, 'id' | 'updatedAt'>): Promise<Note> {
    try {
      await this.ready;
      const id = crypto.randomUUID();
      const updatedAt = new Date().toISOString();
      const content = draft.content ?? '';
      const sql = 'INSERT INTO notes (id, title, content, category, updated_at) VALUES (?, ?, ?, ?, ?)';
      const params = [id, draft.title, content, draft.category, updatedAt];
      await this.db.run(sql, params);
      if (this.isWeb) {
        await this.sqlite.saveToStore(this.DB_NAME);
      }
      return { id, title: draft.title, category: draft.category, content, updatedAt };
    } catch (err) {
      console.error('Erreur lors de la création de la note', err);
      throw err;
    }
  }

  /**
   * Met à jour une note existante (identifiée par son id).
   */
  async updateNote(note: Omit<Note, 'updatedAt'>): Promise<void> {
    try {
      await this.ready;
      const updatedAt = new Date().toISOString();
      const content = note.content ?? '';
      const sql = 'UPDATE notes SET title = ?, content = ?, category = ?, updated_at = ? WHERE id = ?';
      const params = [note.title, content, note.category, updatedAt, note.id];
      await this.db.run(sql, params);
      if (this.isWeb) {
        await this.sqlite.saveToStore(this.DB_NAME);
      }
    } catch (err) {
      console.error('Erreur lors de la mise à jour de la note', err);
      throw err;
    }
  }

  /**
   * Enregistre ou met à jour une note dans la base de données.
   */
  async saveNote(note: Note): Promise<Note> {
    try {
      await this.ready;
      // On utilise INSERT OR REPLACE pour gérer l'ajout et la mise à jour en une seule commande SQL
      const sql = `
        INSERT OR REPLACE INTO notes (id, title)
        VALUES (?, ?);
      `;
      await this.db.run(sql, [note.id, note.title]);
      if (this.isWeb) {
        await this.sqlite.saveToStore(this.DB_NAME);
      }
      return note;
    } catch (err) {
      console.error('Erreur lors de l\'enregistrement de la note', err);
      throw err;
    }
  }

  /**
   * Supprime une note.
   */
  async deleteNote(id: string): Promise<void> {
    try {
      await this.ready;
      await this.db.run('DELETE FROM notes WHERE id = ?', [id]);
      if (this.isWeb) {
        await this.sqlite.saveToStore(this.DB_NAME);
      }
    } catch (err) {
      console.error('Erreur lors de la suppression de la note', err);
      throw err;
    }
  }
}
