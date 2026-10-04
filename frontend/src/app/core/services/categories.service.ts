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


  /**
   * Résout un nom de catégorie en catégorie, en y appliquant la couleur demandée (US4) :
   * la catégorie est créée avec cette couleur si le nom est nouveau, sa couleur est mise à jour si
   * elle a changé, et rien n'est écrit si elle est identique ou si aucune couleur n'est fournie.
   * La couleur appartient à la catégorie : la changer la change pour toutes les notes qui la
   * portent.
   * @param name Le nom saisi (les espaces de bord sont ignorés).
   * @param color La couleur choisie, ou `undefined` pour laisser la couleur en place.
   * @returns La catégorie correspondante, avec sa couleur à jour.
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
   * Compare deux couleurs sans tenir compte de la casse (`#ff9500` ≡ `#FF9500`), les couleurs
   * stockées pouvant venir du seed, de la palette ou d'une saisie antérieure.
   * @param a La première couleur (éventuellement absente).
   * @param b La seconde couleur.
   * @returns `true` quand les deux couleurs désignent la même valeur.
   */
  private sameColor(a: string | undefined, b: string): boolean {
    return (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
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
