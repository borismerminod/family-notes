# Scripts de base de données

Base SQLite `family_notes` (notes, catégories, événements, tableaux kanban et leurs colonnes).

## Où vit quoi

| Fichier | Rôle |
|---|---|
| `frontend/public/assets/migrations/schema_categories.sql` | Table `categories` |
| `frontend/public/assets/migrations/schema_notes.sql` | Schéma courant complet (`categories` + `notes`) |
| `frontend/public/assets/migrations/migration_relational_categories.sql` | Ancien format (`notes.category` en texte libre) → modèle relationnel |
| `frontend/public/assets/migrations/schema_kanban.sql` | Table `kanbans` |
| `frontend/public/assets/migrations/schema_kanban_columns.sql` | Table `kanban_columns` (les « listes » d'un tableau) |
| `scripts/schema_events.sql` | Table `events` |
| `scripts/seed_categories.sql`, `scripts/seed_notes.sql`, `scripts/seed_kanbans.sql`, `scripts/seed_kanban_columns.sql`, `scripts/seeds_event.sql` | Jeux de données de démo |
| `scripts/migration_check.sql` | Vérification de la migration vers les catégories relationnelles |
| `scripts/kanban_columns_check.sql` | Vérification de la table `kanban_columns` (schéma, cascade, positions) |

Les cinq premiers sont dans les **assets de l'application** parce qu'ils sont exécutés au
démarrage par `SchemaMigrationService`
([frontend/src/app/core/services/schema-migration.service.ts](../frontend/src/app/core/services/schema-migration.service.ts))
— ce sont les mêmes fichiers que ceux joués à la main avec `sqlite3`, il n'existe pas de copie du
SQL dans le code TypeScript.

## Pourquoi la migration est jouée par l'application

La base vit **sur l'appareil de l'utilisateur** : web store du navigateur, fichier SQLite du
téléphone. Le seed livré (`frontend/public/assets/databases/family_notesSQLite.db`) n'est copié
qu'à la toute première installation — `copyFromAssets` ne remplace jamais une base existante. Une
base déjà en place ne peut donc être mise à niveau que sur place, au démarrage.

`SchemaMigrationService` enchaîne **trois étapes indépendantes**, chacune gardée par la présence
de ce qu'elle apporte, et n'exécute que celles qui manquent. Aucune ne court-circuite les
suivantes : c'est la correction apportée par le lot `KANBAN/EDITION_LISTES` (décision `D-L15`),
l'ancien raccourci « table `categories` présente ⇒ base à jour » ayant empêché
`schema_kanban.sql` d'être joué sur un appareil déjà installé.

| Étape | Garde | Base trouvée | Script exécuté |
|---|---|---|---|
| 1 — notes et catégories | table `categories` | présente | aucun |
| | | aucune table `notes` | `schema_notes.sql` |
| | | `notes.category` (ancien format) | `migration_relational_categories.sql` |
| | | `notes` relationnelle sans catégories | `schema_categories.sql` (+ `ALTER TABLE` si besoin) |
| 2 — tableaux kanban | table `kanbans` | absente | `schema_kanban.sql` |
| 3 — colonnes des tableaux | table `kanban_columns` | absente | `schema_kanban_columns.sql` |

## Intégrité référentielle

`DatabaseService` pose **`PRAGMA foreign_keys = ON`** sur la connexion partagée, juste après son
ouverture et **avant** la migration (décision `D-L14`). SQLite désactive les clés étrangères par
défaut, et tant qu'elles le sont il **ignore en silence** les actions déclarées : la cascade de
`kanban_columns.kanban_id` laisserait les colonnes d'un tableau supprimé derrière elle, et le
`ON DELETE SET NULL` de `notes.category_id` laisserait des notes pointant vers une catégorie
disparue.

Deux pièges tiennent à ce pragma :

- il est **propre à la connexion** (il n'est pas stocké dans le fichier) — une session `sqlite3`
  doit le poser elle-même, ce que font `scripts/kanban_columns_check.sql` et les exemples
  ci-dessous ;
- SQLite l'**ignore à l'intérieur d'une transaction**, et le plugin Capacitor enrobe `execute()`
  dans une transaction par défaut : le pragma est donc posé avec `transaction: false`. C'est aussi
  pourquoi les `PRAGMA foreign_keys = OFF` / `= ON` écrits dans
  `migration_relational_categories.sql` sont sans effet quand l'application joue le script — ils
  ne valent que pour une exécution à la main.

## Régénérer le seed de l'application

```bash
cd frontend/public/assets/databases
cp family_notesSQLite.db family_notesSQLite.db.bak          # toujours sauvegarder d'abord
sqlite3 family_notesSQLite.db < ../migrations/migration_relational_categories.sql
sqlite3 family_notesSQLite.db < ../../../../scripts/migration_check.sql
```

Pour repartir d'une base vide, dans cet ordre (`kanban_columns` référence `kanbans`, et les seeds
supposent leurs tables créées) :

```bash
sqlite3 famille.db < frontend/public/assets/migrations/schema_notes.sql
sqlite3 famille.db < frontend/public/assets/migrations/schema_kanban.sql
sqlite3 famille.db < frontend/public/assets/migrations/schema_kanban_columns.sql
sqlite3 famille.db < scripts/schema_events.sql
sqlite3 famille.db < scripts/seed_categories.sql
sqlite3 famille.db < scripts/seed_notes.sql
sqlite3 famille.db < scripts/seed_kanbans.sql
sqlite3 famille.db < scripts/seed_kanban_columns.sql
sqlite3 famille.db < scripts/seeds_event.sql
sqlite3 famille.db < scripts/kanban_columns_check.sql
```

Les builds natifs embarquent le seed et les scripts via `npx cap sync` : **tout ajout ou
modification d'un script des assets demande `npm run build` puis `npx cap sync`**, sans quoi le
nouveau script ne parvient jamais à l'application.
