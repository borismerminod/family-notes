# Diagramme de classes — Fonctionnalité « Kanban »

> Vision de la fonctionnalité **Kanban — gestion des tableaux** : le modèle du domaine `Kanban`,
> la source de données `KanbanService`, l'écran de liste `KanbanList` et l'écran d'édition
> `KanbanEditor`, posés sur la **couche base partagée** (`SqliteService` / `DatabaseService` /
> `SchemaMigrationService`) dont ce lot est le premier réutilisateur après les notes. Créé le
> 2026-10-10 sur le code livré de la branche `kanban` (lot 1 « service » + lot 2 « liste »,
> groupes 6 à 11 verts).
>
> **Mis à jour le 2026-11-04** — ajout du **lot 3 « édition d'un tableau »** : la classe
> `KanbanEditor`, la lecture unitaire `KanbanService.getKanbanById` et les deux routes
> `/kanban/new` · `/kanban/edit/:id`. Trois des quatre écarts du §5 (`E2`, `E3`, `E4`) sont **fermés
> par ce lot** ; `E1` reste ouvert.
>
> Documents liés : la **SPEC** [`KANBAN/CRUD/FEATURE_KANBAN_CRUD.md`](KANBAN/CRUD/FEATURE_KANBAN_CRUD.md),
> l'**approche** [`KANBAN/CRUD/APPROCHE_KANBAN_CRUD.md`](KANBAN/CRUD/APPROCHE_KANBAN_CRUD.md)
> (diagramme *prévu*, décisions `D-K#`), le **plan de test**
> [`KANBAN/CRUD/PLAN_TESTS_KANBAN_CRUD.md`](KANBAN/CRUD/PLAN_TESTS_KANBAN_CRUD.md) et la **revue**
> [`KANBAN/CRUD/REVUE_KANBAN_CRUD.md`](KANBAN/CRUD/REVUE_KANBAN_CRUD.md) (constats `C#`).
> Pour le lot 3 : [`KANBAN/EDITION/FEATURE_KANBAN_EDITION.md`](KANBAN/EDITION/FEATURE_KANBAN_EDITION.md),
> [`KANBAN/EDITION/APPROCHE_KANBAN_EDITION.md`](KANBAN/EDITION/APPROCHE_KANBAN_EDITION.md)
> (décisions `D-E#`), [`KANBAN/EDITION/PLAN_TESTS_KANBAN_EDITION.md`](KANBAN/EDITION/PLAN_TESTS_KANBAN_EDITION.md)
> et [`KANBAN/EDITION/REVUE_KANBAN_EDITION.md`](KANBAN/EDITION/REVUE_KANBAN_EDITION.md).
> Vue **sœur** de [`DIAGRAMME_CLASSES_NOTES.md`](DIAGRAMME_CLASSES_NOTES.md) : les deux domaines ne
> partagent que `SqliteService` et `ConfirmDialog`, d'où un document séparé (décidé avec
> l'utilisateur le 2026-10-10).
>
> Le bloc ci-dessous est un diagramme Mermaid `classDiagram` : il se rend directement dans un
> aperçu Markdown compatible Mermaid (VS Code + extension, GitHub, etc.).

## 1. Diagramme

```mermaid
classDiagram
    direction TB

    %% ---------- Modèle du domaine ----------
    class Kanban {
        <<interface — kanban.model.ts>>
        +string id
        +string name
        +string updatedAt
    }

    %% ---------- Couche base partagée ----------
    class DatabaseService {
        <<Injectable root — propriétaire de la connexion>>
        -SchemaMigrationService migrations
        -SQLiteConnection sqlite
        -string DB_NAME = "family_notes"
        -boolean isWeb
        -Promise~SQLiteDBConnection~ opening?
        +connect() Promise~SQLiteDBConnection~
        +persist() Promise~void~
        -open() Promise~SQLiteDBConnection~
        -initializeWebStore() Promise~void~
    }

    class SchemaMigrationService {
        <<Injectable root — moteur de migrations>>
        +migrate(db) Promise~boolean~
        #runScript(db, script) Promise~void~
        #loadScript(script) Promise~string~
        #tableColumns(db, table) Promise~string[]~
    }

    class SqliteService {
        <<Injectable root — classe de base>>
        -DatabaseService database
        #SQLiteDBConnection db
        #Promise~void~ ready
        #initializeDatabase() Promise~void~
        #runQuery(errorMessage, operation) Promise~T~
        #persist() Promise~void~
    }

    %% ---------- Service de données Kanban ----------
    class KanbanService {
        <<Injectable root — kanban-service.ts>>
        +getAllKanbans() Promise~Kanban[]~
        +getKanbanById(id) Promise~Kanban ou null~
        +createKanban(name) Promise~Kanban~
        +renameKanban(id, name) Promise~Kanban~
        +deleteKanban(id) Promise~void~
        -requireName(name) string
        -mapRowToKanban(row) Kanban
    }

    %% ---------- Composants (UI) ----------
    class KanbanList {
        <<Component app-kanban-list>>
        -KanbanService kanbanService
        -Router router
        +Signal~Kanban[]~ kanbans
        +Signal~boolean~ isLoading
        +Signal~boolean~ loadError
        +Signal~Kanban~ kanbanToDelete?
        +Signal~boolean~ confirmOpen
        +Signal~string~ actionError
        +Signal~string~ countLabel
        +Signal~string~ confirmMessage
        +ngOnInit() void
        +loadKanbans() Promise~void~
        +onAddKanban() void
        +onOpenKanban(kanban) void
        +onDeleteKanban(kanban, event) void
        +onDeleteConfirmed(confirmed) Promise~void~
    }

    class KanbanEditor {
        <<Component app-kanban-editor — kanban-editor.ts>>
        -ActivatedRoute route
        -KanbanService kanbanService
        -Router router
        -Signal~string ou null~ kanbanId
        +string defaultName
        +Signal~string~ name
        +Signal~string~ initialName
        +Signal~boolean~ editing
        +Signal~boolean~ isLoading
        +Signal~boolean~ loadError
        +Signal~boolean~ notFound
        +Signal~string~ saveError
        +Signal~boolean~ confirmOpen
        +Signal~boolean~ hasPendingChanges
        +ngOnInit() Promise~void~
        +onSave() Promise~void~
        +onBack() void
        +onLeaveConfirmed(confirmed) void
        +onRetry() void
        +goToList() void
        -loadKanban(id) Promise~void~
        -writeKanban(nameToSave) Promise~Kanban~
        -nameToSave() string
    }

    class ConfirmDialog {
        <<Component app-confirm-dialog — partagé>>
        +InputSignal~string~ message
        +ModelSignal~boolean~ open
        +InputSignal~string~ confirmLabel
        +InputSignal~string~ cancelLabel
        +OutputEmitter~boolean~ answered
        +onConfirm() void
        +onCancel() void
        +onBackdropClick(event) void
        +onEscape() void
    }

    %% ---------- Infrastructure ----------
    class SQLiteDBConnection {
        <<@capacitor-community/sqlite>>
        +query(statement, values?) Promise~DBSQLiteValues~
        +run(statement, values?) Promise~capSQLiteChanges~
        +execute(statements) Promise~capSQLiteChanges~
    }

    class kanbans_table {
        <<table — assets/migrations/schema_kanban.sql>>
        +TEXT id
        +TEXT name
        +TEXT created_at
        +TEXT updated_at
        +INDEX idx_kanbans_updated_at
    }

    %% ---------- Relations ----------
    KanbanService --|> SqliteService : extends
    KanbanService ..> Kanban : mappe / persiste
    KanbanService ..> kanbans_table : SELECT / INSERT / UPDATE / DELETE

    SqliteService --> DatabaseService : inject()
    DatabaseService --> SchemaMigrationService : inject()
    DatabaseService ..> SQLiteDBConnection : ouvre / partage
    SQLiteDBConnection o-- kanbans_table : base family_notes
    SchemaMigrationService ..> kanbans_table : script non référencé — écart E1

    KanbanList --> KanbanService : inject()
    KanbanList --> Router : inject()
    KanbanList "1" o-- "0..*" Kanban : affiche
    KanbanList "1" *-- "1" ConfirmDialog : confirmation de suppression
    KanbanList ..> KanbanEditor : ouvre par la route /kanban/new · /kanban/edit/:id

    KanbanEditor --> KanbanService : inject()
    KanbanEditor --> Router : inject()
    KanbanEditor --> ActivatedRoute : inject()
    KanbanEditor ..> Kanban : lit / enregistre le nom
    KanbanEditor "1" *-- "1" ConfirmDialog : abandon de la saisie
```

## 2. Lecture des relations

| Relation | Signification |
|---|---|
| `KanbanService --\|> SqliteService` (héritage) | Le service **n'ouvre aucune connexion** : il hérite de `db`, du garde `ready`, du wrapper `runQuery` et du flush `persist`. Chaque méthode publique n'est donc qu'une requête SQL enveloppée dans `runQuery('<message>', …)` ([kanban-service.ts:24](../frontend/src/app/core/services/kanban-service.ts:24)). |
| `SqliteService --> DatabaseService` | La connexion est **partagée** par toutes les sources de données : `DatabaseService.connect()` l'ouvre à la première demande, d'où qu'elle vienne, et les suivantes réutilisent la même promesse (`opening`). |
| `DatabaseService --> SchemaMigrationService` | À l'ouverture, la base déjà installée sur l'appareil est mise au schéma courant en jouant des scripts `.sql` des assets — le SQL n'est **jamais** dupliqué en TypeScript (mémoire projet `db-migrations-in-sql-assets`). |
| `SchemaMigrationService ..> schema_kanban.sql` | Lien **prévu mais pas réalisé** : le script existe dans les assets, rien ne l'exécute. Voir l'**écart E1** au §5. |
| `KanbanService ..> Kanban` | `mapRowToKanban` convertit une ligne `kanbans` en modèle : `created_at` reste en base, seule `updated_at` est exposée (`D-K1`). `requireName` rejette un nom vide **avant** de toucher la base. |
| `KanbanService ..> Kanban` (lecture unitaire) | `getKanbanById` rend **un** tableau depuis son identifiant, ou `null` quand aucune ligne ne correspond — une **réponse, pas une erreur**, sur le modèle de `getNoteById` (`D-E7`). C'est la brique sur laquelle `/kanban/edit/:id` s'ouvre ([kanban-service.ts:38](../frontend/src/app/core/services/kanban-service.ts:38)). |
| `KanbanList --> KanbanService` | La page **injecte** le service et ne l'appelle que pour deux choses : `getAllKanbans` au chargement, `deleteKanban` après confirmation. Depuis la révision de `D-K2`/`D-K3`, elle ne porte **aucun formulaire** : `createKanban` et `renameKanban` sont appelés par l'**écran d'édition** (lot 3), pas par elle. |
| `KanbanList o-- Kanban` (agrégation 0..*) | Le signal `kanbans` porte la liste affichée, triée du plus récemment modifié au plus ancien par le `ORDER BY updated_at DESC` du service. |
| `KanbanList *-- ConfirmDialog` (composition) | La page **imbrique** la popup partagée de la page « Mes Notes », sans la modifier : elle pousse `[message]`, lie `[(open)]` à son signal `confirmOpen` et reçoit la réponse via `(answered)` → `onDeleteConfirmed`. |
| `KanbanList --> Router` | La liste **navigue** vers l'écran d'édition — `/kanban/new` depuis « + », `/kanban/edit/:id` depuis une carte — sans rien écrire (`D-K11`). Les deux routes sont **déclarées depuis le lot 3** ([app.routes.ts:33-42](../frontend/src/app/app.routes.ts:33)), avant `path: '**'` : l'écart `E2` est fermé. |
| `KanbanList ..> KanbanEditor` | Lien **par la route uniquement** : aucune dépendance de code entre les deux composants, ni import, ni entrée partagée (`D-E8`). |
| `KanbanEditor --> KanbanService` | L'écran lit le tableau à éditer (`getKanbanById`), puis appelle `createKanban` **ou** `renameKanban` selon le mode. Il ne touche **jamais** la base directement. |
| `KanbanEditor --> ActivatedRoute` | L'identifiant `:id` est lu **une seule fois**, dans `snapshot.paramMap` à l'initialisation (`D8`) : sa présence distingue le mode édition du mode création (`D-E8`). L'écran ne suit donc pas un changement de paramètre — parcours qui n'existe pas aujourd'hui. |
| `KanbanEditor --> Router` | `/kanban` est la **seule sortie** de l'écran : après un enregistrement réussi (`D-E1`), après confirmation d'abandon (`US4`), et depuis les boutons de retour — barre de navigation, « Revenir à la liste » des états « introuvable » (`D-E4`) et « erreur de chargement » (`D3`). |
| `KanbanEditor *-- ConfirmDialog` (composition) | **La même popup** que les suppressions, ici pour confirmer l'**abandon d'une saisie** non enregistrée (`US4`). Le composant partagé n'a pas été modifié : l'écran pousse `[message]`, lie `[(open)]` à `confirmOpen` et reçoit la réponse via `(answered)` → `onLeaveConfirmed`. |

## 3. Cycle CRUD (parcours des couches)

```
KanbanList (UI, signals)
   │  loadKanbans · onAddKanban · onOpenKanban · onDeleteKanban → onDeleteConfirmed
   │  (ConfirmDialog entre la demande et la suppression)
   ▼
KanbanService (Injectable root)
   │  getAllKanbans · createKanban · renameKanban · deleteKanban
   │  requireName (nom obligatoire) ⇄ mapRowToKanban (ligne → modèle)
   ▼
SqliteService (classe de base)
   │  runQuery : await ready → opération → log + rethrow      ·      persist : flush web
   ▼
DatabaseService  ──►  SchemaMigrationService (scripts assets/migrations/*.sql)
   │  connexion partagée "family_notes"
   ▼
SQLite (@capacitor-community/sqlite)
   table kanbans(id, name, created_at, updated_at) + index idx_kanbans_updated_at
```

Et le parcours de l'**écran d'édition** (lot 3), qui descend les mêmes couches :

```
KanbanEditor (UI, signals)
   │  ngOnInit → mode création (rien lu) ou mode édition → loadKanban
   │  onSave → nameToSave (trim, repli « Sans titre ») → writeKanban
   │  onBack → hasPendingChanges ? ConfirmDialog : goToList
   ▼
KanbanService
   │  getKanbanById (null = réponse)  ·  createKanban  ·  renameKanban
   ▼
   … mêmes couches que ci-dessus (SqliteService → DatabaseService → SQLite)
```

> **Écritures et rafraîchissement** : la liste n'est mise à jour qu'**après succès en base**
> (`D-K7`). La suppression retire la carte **sur place** (`kanbans.update(filter)`) au lieu de
> relancer `getAllKanbans` : un aller-retour de moins et pas de clignotement. Un échec laisse la
> carte à l'écran et renseigne le bandeau `actionError`.

## 4. Notes de conception

- **Un tableau n'a pas de description** (`D-K1`) : `Kanban` se limite à `id`, `name`, `updatedAt`.
  La date de création vit en base mais n'est pas exposée par le modèle.
- **Pas d'unicité du nom** (`D-K4`) : aucune contrainte en base, aucun contrôle dans le service —
  deux tableaux peuvent porter le même nom. Le seul contrôle est « non vide après `trim` », tenu à
  la fois par le `CHECK (length(trim(name)) > 0)` du script SQL et par `requireName`, qui refuse
  avant toute écriture.
- **Suppression idempotente** : `deleteKanban` d'un tableau déjà disparu n'est **pas** une erreur
  (l'état final est celui demandé). `renameKanban`, lui, **lève** `Kanban introuvable` quand aucune
  ligne n'a été touchée, et ne sauvegarde alors rien.
- **Deux états d'erreur distincts dans la page** : `loadError` remplace la liste par un état plein
  écran avec un bouton « Réessayer » (US1) ; `actionError` est un **bandeau non bloquant** affiché
  au-dessus de la liste après un échec de suppression, remis à zéro au début de chaque nouvelle
  action pour qu'un message ne soit jamais lu comme portant sur le tableau suivant.
- **Clic sur la corbeille arrêté** (`event.stopPropagation()`) : l'icône est **dans** la carte,
  dont le clic ouvre l'écran d'édition — sans cela l'écran s'ouvrirait derrière la popup.
- **La modification en attente est un état dérivé** (`KanbanEditor.hasPendingChanges`, un
  `computed`), et non un drapeau : le nom affiché est comparé au **nom de départ**, tous deux
  nettoyés de leurs espaces de début et de fin (`D-E3`). Il n'y a donc rien à remettre à zéro, et
  retaper exactement le même nom — ou n'ajouter que des espaces — ne compte pas comme une
  modification.
- **Trois états d'erreur distincts dans l'écran d'édition**, à ne pas confondre : `notFound`
  (l'identifiant de la route ne correspond à aucun tableau — une **réponse**, bloc « Tableau
  introuvable. » avec retour à la liste, `D-E4`), `loadError` (la lecture a **échoué** — bloc plein
  écran avec « Réessayer » **et** « Revenir à la liste », `D3`) et `saveError` (bandeau
  `role="alert"` après un échec d'enregistrement, la saisie restant intacte et la modification
  restant « en attente », `D-E9`).
- **Le nom de départ est rafraîchi avant la navigation** après un enregistrement réussi (`D5`) :
  c'est ce qui rend observable « plus de modification en attente » alors que le composant reste
  monté. Détail d'implémentation le plus facile à oublier, d'après l'approche.
- **Le repli sur « Sans titre » est porté par l'écran**, pas par le service (`D-E2`) : `nameToSave`
  nettoie et remplace, si bien que `requireName` — qui refuserait un nom vide — n'est **jamais**
  atteint depuis cet écran. Son refus reste un **filet de sécurité** pour d'autres appelants
  (`D-E10`).
- **La zone de contenu du tableau est un bloc statique vide** (`.board-canvas` / `.ghost-column`,
  `D-E11`) : aucun comportement, aucun appel au service. C'est le point d'ancrage visuel du lot
  suivant (listes et cartes).
- **Le mode de l'écran d'édition a une seule source de vérité** *(refactoring `R5`, 2026-11-04)* :
  `KanbanEditor.kanbanId` est un **signal privé** rempli une fois depuis la route, et `editing` en
  est un **`computed`** — les deux ne peuvent donc plus diverger. `writeKanban` lit le même signal
  pour choisir entre création et renommage.
- **Libellés calculés** : `countLabel` (« Aucun tableau » / « 1 tableau » / « N tableaux ») et
  `confirmMessage` (qui **nomme** le tableau visé) sont des `computed`, donc toujours cohérents avec
  `kanbans()` et `kanbanToDelete()`.

## 5. Écarts code ↔ plans relevés

> **Mis à jour le 2026-11-04.** Les écarts `E2`, `E3` et `E4` pointaient tous vers le **lot 3**
> (écran d'édition du tableau) : il est **livré**, et ils sont donc **fermés** — le diagramme
> ci-dessus porte maintenant `KanbanEditor`, `getKanbanById` et les deux routes. **`E1` reste
> ouvert** : `schema_kanban.sql` n'est toujours référencé nulle part dans le code
> ([schema-migration.service.ts:12-19](../frontend/src/app/core/services/schema-migration.service.ts:12)),
> vérifié le 2026-11-04. Le lot 3 n'y touchait pas (aucun changement de schéma).

| # | Écart | État réel |
|---|---|---|
| **E1** | **La table `kanbans` n'est créée par personne.** L'APPROCHE prévoyait `KanbanService.ensureSchema()` (`D-K6`) ; la livraison a préféré un script d'assets, `assets/migrations/schema_kanban.sql`, et l'en-tête du service l'annonce comme « créée par `SchemaMigrationService` ». Mais `SchemaMigrationService` ne connaît que trois scripts (`categories`, `notes`, `relationalCategories`) : **`schema_kanban.sql` n'est référencé nulle part dans le code** ([schema-migration.service.ts:12-21](../frontend/src/app/core/services/schema-migration.service.ts:12)). Le lot ne fonctionne donc aujourd'hui que sur une base où la table a été créée à la main (`scripts/seed_kanbans.sql`) ou copiée du seed des assets. La revue (`C10`) décrit l'intention, pas l'état du code. | `ensureSchema` **n'existe pas** ; le script existe mais **n'est jamais joué**. Le diagramme porte donc ce lien en pointillé annoté. |
| **E2** ✅ | ~~**Les routes de l'écran d'édition n'existent pas.**~~ **Fermé par le lot 3 le 2026-11-04** : `app.routes.ts` déclare `kanban/new` puis `kanban/edit/:id`, servies par le même `KanbanEditor` (`D-E8`) et placées **avant** `path: ''` et `path: '**'` ([app.routes.ts:33-42](../frontend/src/app/app.routes.ts:33)). « + » et le clic sur une carte cessent donc de retomber sur « Mes Notes » : c'est la première fois que le parcours Kanban est démontrable de bout en bout. Le commentaire périmé de la route `/kanban` (`C12`) est corrigé au passage ([app.routes.ts:28-29](../frontend/src/app/app.routes.ts:28)). | **Routes déclarées**, commentaire à jour. Reste à **vérifier à la main** sur le téléphone (hors plan de test) — attention au bundle périmé : `android/.../assets/public/` ne bouge qu'au `npm run build` + `npx cap sync`. |
| **E3** ✅ | ~~**`createKanban` / `renameKanban` sont livrés mais inutilisés.**~~ **Fermé par le lot 3 le 2026-11-04** : `KanbanEditor.writeKanban` appelle `createKanban` en mode création et `renameKanban` en mode édition ([kanban-editor.ts:208-213](../frontend/src/app/kanban-editor/kanban-editor.ts:208)). Les deux écritures ont enfin leur appelant. | Plus de code mort : les deux méthodes sont **appelées et couvertes** (`T5.x`, `T6.x`). |
| **E4** ✅ | ~~**Pas de lecture unitaire**~~ **Fermé par le lot 3 le 2026-11-04** : `getKanbanById(id): Promise<Kanban \| null>` existe ([kanban-service.ts:38](../frontend/src/app/core/services/kanban-service.ts:38)), passe par le même `runQuery` que les autres lectures et rend `null` sans lever quand aucune ligne ne correspond (`D-E7`). | **Présent dans le code et dans le diagramme.** Ses trois cas de test (`T1.1`, `T1.2`, `T1.3` du plan `EDITION`) ont été ajoutés le 2026-11-04 par le refactoring `R1` de [`REVUE_KANBAN_EDITION.md`](KANBAN/EDITION/REVUE_KANBAN_EDITION.md) — la méthode avait été livrée **sans** eux (constat `C1`). |
