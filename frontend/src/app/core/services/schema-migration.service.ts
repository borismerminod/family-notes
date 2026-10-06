import { Injectable } from '@angular/core';
import type { SQLiteDBConnection } from '@capacitor-community/sqlite';

/** Dossier des scripts SQL embarqués dans les assets de l'application. */
const MIGRATIONS_PATH = 'assets/migrations';

/**
 * Scripts SQL exécutés par le service, servis depuis `frontend/public/assets/migrations/`.
 * Ce sont les mêmes fichiers que ceux joués à la main avec `sqlite3` (cf. scripts/README.md) :
 * le SQL n'existe qu'à un seul endroit.
 */
const SCRIPTS = {
  /** Table `categories` seule. */
  categories: 'schema_categories.sql',
  /** Schéma courant complet (`categories` + `notes`), pour une base vide. */
  notes: 'schema_notes.sql',
  /** Ancien format (`notes.category` en texte libre) vers le modèle relationnel. */
  relationalCategories: 'migration_relational_categories.sql',
} as const;

/**
 * Met le schéma d'une base déjà ouverte au niveau attendu par les services de données.
 *
 * La base vit sur l'appareil de l'utilisateur — web store du navigateur ou fichier SQLite du
 * téléphone — et le seed livré dans les assets n'est copié qu'à la toute première installation :
 * une base déjà en place ne peut donc être mise à jour que sur place, au démarrage. C'est le rôle
 * de ce service, qui exécute les scripts SQL du dossier `assets/migrations` sans jamais les
 * réécrire ici.
 *
 * La décision est prise à partir du schéma réellement trouvé plutôt que d'un numéro de version
 * (`PRAGMA user_version` appartient au mécanisme d'upgrade du plugin Capacitor) : la présence de
 * la table `categories` marque une base à jour, et une seule lecture suffit alors à tout sauter.
 */
@Injectable({
  providedIn: 'root',
})
export class SchemaMigrationService {
  /**
   * Amène la base au schéma courant : table `categories` et clé étrangère `notes.category_id`.
   * Une base restée à l'ancien format déclenchait jusqu'ici l'erreur `no such table: categories`
   * sur la moindre lecture de notes.
   * @param db La connexion ouverte à migrer.
   * @returns Une promesse résolue à `true` si le schéma a été modifié (l'appelant doit alors
   * flusher le store), `false` si la base était déjà à jour.
   */
  async migrate(db: SQLiteDBConnection): Promise<boolean> {
    const hasCategories = (await db.isTable('categories')).result ?? false;
    if (hasCategories) {
      return false;
    }

    const noteColumns = await this.tableColumns(db, 'notes');

    if (noteColumns.length === 0) {
      // Base vide : on crée le schéma courant.
      await this.runScript(db, SCRIPTS.notes);
    } else if (noteColumns.includes('category')) {
      // Ancien format : les noms de catégories deviennent des lignes de `categories`.
      await this.runScript(db, SCRIPTS.relationalCategories);
    } else {
      // Cas limite : notes déjà relationnelles mais catégories absentes.
      await this.runScript(db, SCRIPTS.categories);
      if (!noteColumns.includes('category_id')) {
        await db.execute('ALTER TABLE notes ADD COLUMN category_id TEXT REFERENCES categories(id)');
      }
    }

    return true;
  }

  /**
   * Charge un script des assets et l'exécute sur la connexion.
   * @param db La connexion sur laquelle exécuter le script.
   * @param script Le nom de fichier du script, relatif à {@link MIGRATIONS_PATH}.
   * @returns Une promesse résolue une fois le script exécuté.
   */
  protected async runScript(db: SQLiteDBConnection, script: string): Promise<void> {
    await db.execute(await this.loadScript(script));
  }

  /**
   * Lit le contenu d'un script SQL embarqué dans les assets.
   * @param script Le nom de fichier du script, relatif à {@link MIGRATIONS_PATH}.
   * @returns Une promesse résolue sur le SQL du script.
   */
  protected async loadScript(script: string): Promise<string> {
    const response = await fetch(`${MIGRATIONS_PATH}/${script}`);
    if (!response.ok) {
      throw new Error(`Script de migration introuvable : ${MIGRATIONS_PATH}/${script}`);
    }
    return response.text();
  }

  /**
   * Liste les colonnes d'une table, pour détecter le schéma en place.
   * @param db La connexion à interroger.
   * @param table Le nom de la table à inspecter.
   * @returns Une promesse résolue sur les noms de colonnes, vide si la table n'existe pas.
   */
  protected async tableColumns(db: SQLiteDBConnection, table: string): Promise<string[]> {
    const res = await db.query(`PRAGMA table_info('${table}')`);
    return (res.values ?? []).map((column: any) => column.name as string);
  }
}
