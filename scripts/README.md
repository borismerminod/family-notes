# Scripts de base de données

Base SQLite `family_notes` (notes, catégories, événements).

## Où vit quoi

| Fichier | Rôle |
|---|---|
| `frontend/public/assets/migrations/schema_categories.sql` | Table `categories` |
| `frontend/public/assets/migrations/schema_notes.sql` | Schéma courant complet (`categories` + `notes`) |
| `frontend/public/assets/migrations/migration_relational_categories.sql` | Ancien format (`notes.category` en texte libre) → modèle relationnel |
| `frontend/public/assets/migrations/schema_kanban.sql` | Table `kanbans` |
| `scripts/schema_events.sql` | Table `events` |
| `scripts/seed_categories.sql`, `scripts/seed_notes.sql`, `scripts/seed_kanbans.sql`, `scripts/seeds_event.sql` | Jeux de données de démo |
| `scripts/migration_check.sql` | Vérification du résultat d'une migration |

Les quatre premiers sont dans les **assets de l'application** parce qu'ils sont exécutés au
démarrage par `SchemaMigrationService`
([frontend/src/app/core/services/schema-migration.service.ts](../frontend/src/app/core/services/schema-migration.service.ts))
— ce sont les mêmes fichiers que ceux joués à la main avec `sqlite3`, il n'existe pas de copie du
SQL dans le code TypeScript.

## Pourquoi la migration est jouée par l'application

La base vit **sur l'appareil de l'utilisateur** : web store du navigateur, fichier SQLite du
téléphone. Le seed livré (`frontend/public/assets/databases/family_notesSQLite.db`) n'est copié
qu'à la toute première installation — `copyFromAssets` ne remplace jamais une base existante. Une
base déjà en place ne peut donc être mise à niveau que sur place, au démarrage.

`SchemaMigrationService` choisit le script à exécuter d'après le schéma trouvé :

| Base trouvée | Script exécuté |
|---|---|
| Table `categories` présente | aucun (déjà à jour) |
| Aucune table `notes` | `schema_notes.sql` |
| `notes.category` (ancien format) | `migration_relational_categories.sql` |
| `notes` relationnelle sans catégories | `schema_categories.sql` |

## Régénérer le seed de l'application

```bash
cd frontend/public/assets/databases
cp family_notesSQLite.db family_notesSQLite.db.bak          # toujours sauvegarder d'abord
sqlite3 family_notesSQLite.db < ../migrations/migration_relational_categories.sql
sqlite3 family_notesSQLite.db < ../../../../scripts/migration_check.sql
```

Pour repartir d'une base vide : `schema_notes.sql` et `scripts/schema_events.sql`, puis les
`scripts/seed_*.sql`. Les builds natifs embarquent le seed et les scripts via `npx cap sync`.
