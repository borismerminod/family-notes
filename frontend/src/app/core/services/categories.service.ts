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

  async get(name: string): Promise<Category | undefined> {
    return this.runQuery(`Erreur lors de la récupération de la catégorie: ${name}`, async () => {
      const res = await this.db.query('SELECT * FROM categories WHERE name = ?', [name]);
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


  async delete(id: string): Promise<void> {
    return this.runQuery('Erreur lors de la suppression de la catégorie', async () => {
      await this.db.run('DELETE FROM categories WHERE id = ?', [id]);
      await this.persist();
    });
  }

  async setColor(id: string, color: string): Promise<void> {
    return this.runQuery('Erreur lors de la mise à jour de la couleur', async () => {
      await this.db.run('UPDATE categories SET color = ? WHERE id = ?', [color, id]);
      await this.persist();
    });
  }
}
