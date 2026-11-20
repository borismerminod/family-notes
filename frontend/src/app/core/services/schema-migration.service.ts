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
  /** Table `kanban_cards` (the cards of a column, referencing `kanban_columns` and `notes`). */
  kanbanCards: 'schema_kanban_cards.sql',
  /** Table `events` (calendar events), complete with its `note_id` reference, for a database without it. */
  events: 'schema_events.sql',
  /** Adds the `note_id` reference to an `events` table that predates it (the seed's one). */
  eventsNote: 'migration_events_note.sql',
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
   * Amène la base au schéma courant : notes et catégories relationnelles, table `kanbans`, table
   * `kanban_columns`, table `kanban_cards`, puis table `events` avec sa référence de note. Les cinq
   * étapes sont **indépendantes** et jouées dans cet ordre, qui est celui des dépendances —
   * `kanban_columns` référence `kanbans`, `kanban_cards` référence `kanban_columns` **et** `notes`,
   * et `events` référence `notes` — et chacune ne fait rien si ce qu'elle apporte est déjà en place.
   * @param db La connexion ouverte à migrer.
   * @returns Une promesse résolue à `true` si **au moins une** étape a modifié le schéma
   * (l'appelant doit alors flusher le store), `false` si la base était déjà à jour.
   */
  async migrate(db: SQLiteDBConnection): Promise<boolean> {
    const relationalNotesCreated = await this.ensureRelationalNotes(db);
    const kanbanTableCreated = await this.ensureKanbanTable(db);
    const kanbanColumnsTableCreated = await this.ensureKanbanColumnsTable(db);
    const kanbanCardsTableCreated = await this.ensureKanbanCardsTable(db);
    const eventsTableMigrated = await this.ensureEventsTable(db);

    return (
      relationalNotesCreated ||
      kanbanTableCreated ||
      kanbanColumnsTableCreated ||
      kanbanCardsTableCreated ||
      eventsTableMigrated
    );
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
   * Step 4 — the cards of a column. It comes last because its script references
   * `kanban_columns` **and** `notes`, which the earlier steps guarantee (D-C17). The binary seed
   * is not regenerated for this batch either, so this step creates the table everywhere, fresh
   * installs included. The two-level cascade `kanbans` → `kanban_columns` → `kanban_cards` and
   * the `ON DELETE SET NULL` from `notes` need no extra work: `DatabaseService` already sets
   * `PRAGMA foreign_keys = ON` outside any transaction (D-L14).
   * @param db La connexion à migrer.
   * @returns Une promesse résolue à `true` si la table a été créée.
   */
  protected async ensureKanbanCardsTable(db: SQLiteDBConnection): Promise<boolean> {
    return this.createTableIfMissing(db, 'kanban_cards', SCRIPTS.kanbanCards);
  }

  /**
   * Step 5 — the calendar events and their optional reference to a note (D-EV8, D-EV9). It comes
   * after the kanban steps because `note_id` references `notes`, which the first step guarantees.
   *
   * Until this batch the `events` table only existed through the binary seed, and without
   * `note_id`. Three databases are therefore possible: one **without** the table, which receives
   * the complete schema (`schema_events.sql`); one holding the table **without** `note_id` — the
   * seed's, so a fresh install as well as a device installed before this batch — which receives the
   * column (`migration_events_note.sql`); and one already holding `note_id`, left untouched. The
   * column check is what keeps the `ALTER TABLE` script from being replayed, since `ADD COLUMN`
   * fails on an existing column.
   * @param db The connection to migrate.
   * @returns A promise resolving to `true` if the table was created or given its `note_id` column.
   */
  protected async ensureEventsTable(db: SQLiteDBConnection): Promise<boolean> {
    const tableCreated: boolean = await this.createTableIfMissing(db, 'events', SCRIPTS.events);
    if (tableCreated) {
      return true;
    }

    const eventColumns: string[] = await this.tableColumns(db, 'events');
    const hasNoteReference: boolean = eventColumns.includes('note_id');
    if (hasNoteReference) {
      return false;
    }

    await this.runScript(db, SCRIPTS.eventsNote);
    return true;
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
