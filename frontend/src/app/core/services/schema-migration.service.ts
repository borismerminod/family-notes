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
  /** Table `kanbans` (tableaux kanban). */
  kanban: 'schema_kanban.sql',
  /** Table `kanban_columns` (les colonnes d'un tableau, « listes » côté interface). */
  kanbanColumns: 'schema_kanban_columns.sql',
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
 * (`PRAGMA user_version` appartient au mécanisme d'upgrade du plugin Capacitor). Chaque étape
 * porte **sa propre garde** et aucune ne court-circuite les suivantes : la présence de la table
 * `categories` marquait auparavant « base à jour » et tout était sauté, ce qui empêchait
 * `schema_kanban.sql` d'être joué un jour sur un appareil déjà installé — constat `E1` de
 * `REVUE_KANBAN_EDITION.md`, refermé par la décision `D-L15` de
 * `.agent/KANBAN/EDITION_LISTES/APPROCHE_KANBAN_EDITION_LISTES.md`.
 */
@Injectable({
  providedIn: 'root',
})
export class SchemaMigrationService {
  /**
   * Amène la base au schéma courant : notes et catégories relationnelles, table `kanbans`, puis
   * table `kanban_columns`. Les trois étapes sont **indépendantes** et jouées dans cet ordre —
   * `kanban_columns` référence `kanbans`, qui doit donc exister avant elle — et chacune ne fait
   * rien si ce qu'elle apporte est déjà en place.
   * @param db La connexion ouverte à migrer.
   * @returns Une promesse résolue à `true` si **au moins une** étape a modifié le schéma
   * (l'appelant doit alors flusher le store), `false` si la base était déjà à jour.
   */
  async migrate(db: SQLiteDBConnection): Promise<boolean> {
    const relationalNotesCreated = await this.ensureRelationalNotes(db);
    const kanbanTableCreated = await this.ensureKanbanTable(db);
    const kanbanColumnsTableCreated = await this.ensureKanbanColumnsTable(db);

    return relationalNotesCreated || kanbanTableCreated || kanbanColumnsTableCreated;
  }

  /**
   * Étape 1 — notes et catégories au modèle relationnel, gardée par la présence de la table
   * `categories`. Trois bases possibles quand elle manque : une base **vide**, qui reçoit le
   * schéma courant complet ; une base à l'**ancien format** (`notes.category` en texte libre),
   * qui passe par la migration relationnelle ; et le **cas limite** d'une base dont les notes
   * sont déjà relationnelles mais sans table des catégories, qui reçoit cette table et, si elle
   * lui manque aussi, la colonne `notes.category_id`.
   * @param db La connexion à migrer.
   * @returns Une promesse résolue à `true` si l'étape a modifié le schéma.
   */
  protected async ensureRelationalNotes(db: SQLiteDBConnection): Promise<boolean> {
    const hasCategories = (await db.isTable('categories')).result ?? false;
    if (hasCategories) {
      return false;
    }

    const noteColumns = await this.tableColumns(db, 'notes');

    if (noteColumns.length === 0) {
      await this.runScript(db, SCRIPTS.notes);
      return true;
    }

    if (noteColumns.includes('category')) {
      await this.runScript(db, SCRIPTS.relationalCategories);
      return true;
    }

    await this.runScript(db, SCRIPTS.categories);
    if (!noteColumns.includes('category_id')) {
      await db.execute('ALTER TABLE notes ADD COLUMN category_id TEXT REFERENCES categories(id)');
    }
    return true;
  }

  /**
   * Étape 2 — la table des tableaux kanban. Elle n'existait jusqu'ici que par le **seed** livré
   * dans les assets, jamais par une migration : un appareil installé avant le lot `KANBAN/CRUD`
   * n'avait aucun moyen de l'obtenir (constat `E1`).
   * @param db La connexion à migrer.
   * @returns Une promesse résolue à `true` si la table a été créée.
   */
  protected async ensureKanbanTable(db: SQLiteDBConnection): Promise<boolean> {
    return this.createTableIfMissing(db, 'kanbans', SCRIPTS.kanban);
  }

  /**
   * Étape 3 — la table des colonnes d'un tableau. Le seed binaire n'est pas regénéré pour ce lot
   * (`D-L15`) : cette étape la crée donc partout, installation neuve comprise.
   * @param db La connexion à migrer.
   * @returns Une promesse résolue à `true` si la table a été créée.
   */
  protected async ensureKanbanColumnsTable(db: SQLiteDBConnection): Promise<boolean> {
    return this.createTableIfMissing(db, 'kanban_columns', SCRIPTS.kanbanColumns);
  }

  /**
   * Joue le script qui crée une table, à la seule condition qu'elle manque. Les scripts sont
   * eux-mêmes rejouables (`CREATE TABLE IF NOT EXISTS`) : la garde sert à savoir si le schéma a
   * **changé**, pas à protéger la base.
   * @param db La connexion à migrer.
   * @param table Le nom de la table attendue.
   * @param script Le nom de fichier du script qui la crée, relatif à {@link MIGRATIONS_PATH}.
   * @returns Une promesse résolue à `true` si le script a été exécuté.
   */
  private async createTableIfMissing(
    db: SQLiteDBConnection,
    table: string,
    script: string,
  ): Promise<boolean> {
    const alreadyExists = (await db.isTable(table)).result ?? false;
    if (alreadyExists) {
      return false;
    }

    await this.runScript(db, script);
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
