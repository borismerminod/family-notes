import { Injectable } from '@angular/core';
import { Category } from '../models/category.model';
import { SqliteService } from './sqlite-service';

@Injectable({
  providedIn: 'root',
})
export class CategoriesService extends SqliteService {
  constructor() {
    super();
  }

  /**
   * Retrieves all categories from the database, ordered by name.
   * @returns A promise that resolves with an array of all available categories.
   */
  async getAllCategories(): Promise<Category[]> {
    return this.runQuery('Erreur lors de la récupération des catégories', async () => {
      const res = await this.db.query('SELECT * FROM categories ORDER BY name ASC');
      const rows = res.values ?? [];
      return rows.map((row: any) => ({
        id: row.id,
        name: row.name,
        color: row.color,
      }));
    });
  }

  /**
   * Retrieves a specific category by its name.
   * @param name The name of the category to find.
   * @returns A promise that resolves with the found category, or undefined if none exists.
   */
  async get(name: string): Promise<Category | undefined> {
    return this.runQuery(`Erreur lors de la récupération de la catégorie: ${name}`, async () => {
      const res = await this.db.query('SELECT * FROM categories WHERE name = ?', [name.trim()]);
      const rows = res.values ?? [];
      if (rows.length === 0) return undefined;
      const row = rows[0];
      return {
        id: row.id,
        name: row.name,
        color: row.color,
      };
    });
  }

  /**
   * Creates a new category record in the database.
   * @param name The name of the category.
   * @param color The optional color for the category.
   * @returns A promise that resolves with the newly created Category object.
   */
  async create(name: string, color?: string): Promise<Category> {
    const normalizedName = name.trim();
    return this.runQuery(`Erreur lors de la création de la catégorie: ${normalizedName}`, async () => {
      const id = crypto.randomUUID();
      const sql = 'INSERT INTO categories (id, name, color) VALUES (?, ?, ?)';
      await this.db.run(sql, [id, normalizedName, color || '']);
      await this.persist();
      return { id, name: normalizedName, color: color || '' };
    });
  }


  /** TO DELETE
   * Resolves a category name to a Category object, applying the requested color (US4):
   * The category is created with this color if the name is new, its color is updated if
   * it has changed, and nothing is written if it is identical or if no color is provided.
   * The color belongs to the category: changing it changes it for all notes that
   * carry it.
   * @param name The entered name (leading/trailing spaces are ignored).
   * @param color The chosen color, or `undefined` to keep the current color.
   * @returns The corresponding category, with its color updated.
   */
  async getOrCreate(name: string, color?: string): Promise<Category> {
    const existing = await this.get(name);
    if (!existing) {
      return this.create(name, color);
    }

    const unchanged = !color || this.sameColor(existing.color, color);
    if (unchanged || !existing.id) {
      return existing;
    }

    await this.setColor(existing.id, color);
    return { ...existing, color };
  }

  /**
   * Compares two colors case-insensitively (`#ff9500` ≡ `#FF9500`), where colors
   * stored might come from the seed, the palette, or a previous input.
   * @param a The first color (possibly undefined).
   * @param b The second color.
   * @returns `true` when the two colors denote the same value.
   */
  private sameColor(a: string | undefined, b: string): boolean {
    return (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
  }

  /**
   * Deletes a category from the database using its ID.
   * @param id The unique ID of the category to delete.
   * @returns A promise that resolves when the deletion is complete.
   */
  async delete(id: string): Promise<void> {
    return this.runQuery('Erreur lors de la suppression de la catégorie', async () => {
      await this.db.run('DELETE FROM categories WHERE id = ?', [id]);
      await this.persist();
    });
  }

  /**
   * Updates the color of an existing category using its ID.
   * @param id The ID of the category to update.
   * @param color The new color value.
   * @returns A promise that resolves when the color update is complete.
   */
  async setColor(id: string, color: string): Promise<void> {
    return this.runQuery('Erreur lors de la mise à jour de la couleur', async () => {
      await this.db.run('UPDATE categories SET color = ? WHERE id = ?', [color, id]);
      await this.persist();
    });
  }
}
