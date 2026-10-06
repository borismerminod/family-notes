# Approche de développement — Sélecteur de catégories intuitif

> **Date :** 2026-09-26 · **Statut :** brouillon — à valider
> **SPEC :** `.agent/CATEGORIES/FEATURE_CATEGORIES_SELECTEUR.md`
> **Docs de référence :** `.agent/DIAGRAMME_CLASSES_NOTES.md`, `.agent/MODELE_DONNEES_NOTES.md`,
> `.agent/PLAN_NOTES.md`, mémoire projet (écarts NotesService, valider-mermaid)
> **Code de référence :** `note-editor/`, `note-list/`, `core/services/{notes-service,sqlite-service}.ts`,
> `core/models/{note,category}.model.ts`, seed `frontend/public/assets/databases/family_notesSQLite.db`

---

## 0. Décisions de cadrage (tranchées le 2026-09-26)

| # | Décision | Choix |
|---|----------|-------|
| D-C1 | Stockage | **Table `categories` clé par `id`** (`id` PK, `name` UNIQUE, `color`). `Note.category` **migrera vers `Category.id`** — migration des notes existantes requise. |
| D-C2 | Logique | **`CategoriesService` dédié**, héritant de `SqliteService` (même pattern que `NotesService`). |
| D-C3 | Migration | **Peuplement auto** : au premier lancement, les valeurs distinctes de `notes.category` (aujourd'hui des noms) deviennent des catégories, puis `notes.category` est réécrit avec les `id`. |
| D-C4 | Création fluide | La **résolution nom → catégorie** (et création si nouvelle) se fait **à l'enregistrement** de la note (`NoteEditor.onSave`), conformément à la SPEC US3. |
| D-C5 | Anti-doublons | Normalisation **trim + casse** (`"Travail"` ≡ `"travail"` ≡ `" travail "`) : unicité garantie par un index `UNIQUE` sur `name` + comparaison en `COLLATE NOCASE` côté SQL. |

---

## 1. Diagramme de classes

> **Légende :** classes marquées `%% À CRÉER` = nouveau code ; les autres existent déjà
> (cf. `DIAGRAMME_CLASSES_NOTES.md` §1 et §5). Les attributs `?` sont optionnels.

```mermaid
classDiagram
    direction TB

    %% ---------- Modèles du domaine ----------
    class Note {
        +string id
        +string title
        +Category category
        +NoteBlock[] blocks
        +string updatedAt
    }

    class Category {
        <<interface>>
        +string id
        +string name
        +string color?
    }

    class NoteBlock {
        <<union: TextBlock | ImageBlock | VideoBlock>>
    }

    %% ---------- Types énumés / littéraux ----------
    class CATEGORY_COLOR_PALETTE {
        <<const : string[]>>
        10 couleurs prédéfinies
    }

    %% ---------- Service (accès données SQLite) ----------
    class SqliteService {
        <<Injectable root>>
        -SQLiteConnection sqlite
        -SQLiteDBConnection db
        -string DB_NAME = "family_notes"
        -Promise~void~ ready
        #runQuery(errorMessage, op) Promise~T~
        #persist() Promise~void~
    }

    class NotesService {
        <<Injectable root — existant>>
        -mapRowToNote(row) Note
        +getAllNotes() Promise~Note[]~
        +getNoteById(id) Promise~Note?~
        +createNote(draft) Promise~Note~
        +updateNote(note) Promise~void~
        +deleteNote(id) Promise~void~
    }

    class CategoriesService {
        <<Injectable root — À CRÉER>>
        -migrateSchema() Promise~void~
        +getAllCategories() Promise~Category[]~
        +getById(id) Promise~Category?~
        +findByName(name) Promise~Category?~
        +create(name, color?) Promise~Category~
        +getOrCreate(name, color?) Promise~Category~
        +setColor(id, color) Promise~void~
    }

    %% ---------- Composants (UI) ----------
    class NoteEditor {
        <<Component app-note-editor — existant>>
        -NotesService notesService
        -CategoriesService categoriesService
        +Signal~Category[]~ categories
        +Signal~string~ title
        +Signal~Category?~ selectedCategory
        +Signal~string~ categoryDraft
        +Signal~NoteBlock[]~ blocks
        +Signal~boolean~ isLoading
        +Signal~boolean~ notFound
        +Signal~boolean~ editing
        +ngOnInit() Promise~void~
        -loadNote(id) Promise~void~
        -loadCategories() Promise~void~
        +onCategorySelected(cat) void
        +onCategoryColorPicked(color) Promise~void~
        +onSave() Promise~void~
        +onCancel() void
    }

    class CategorySelector {
        <<Component app-category-selector — À CRÉER>>
        +InputSignal~Category[]~ categories
        +InputSignal~string~ draft
        +InputSignal~string?~ color
        +InputSignal~string?~ placeholder
        +OutputEmitter~string~ draftChange
        +OutputEmitter~Category~ selected
        +Signal~boolean~ isOpen
        +Signal~boolean~ colorPopupOpen
        +Computed~Category[]~ filteredCategories
        +Computed~boolean~ exactMatch
        +onFocus() void
        +onInput(value) void
        +onKeydown(event) void
        +onPick(cat) void
        +onBlur() void
        +toggleColorPopup() void
        +pickColor(color) void
    }

    class NoteList {
        <<Component app-note-list — existant>>
        -NotesService noteService
        +Signal~Note[]~ notes
        +Signal~Note[]~ filteredNotes
        +accentColorFor(note) string
    }

    %% ---------- Relations ----------
    Note ..> Category : category → Category.id
    Note ..> CATEGORY_COLOR_PALETTE : categoryName/categoryColor résolus par JOIN
    Category ..> CATEGORY_COLOR_PALETTE : color choisie dans la palette

    SqliteService <|-- NotesService : hérite
    SqliteService <|-- CategoriesService : hérite
    CategoriesService ..> Category : produit / persiste
    CategoriesService ..> SqliteService : migration DDL (notes ⇄ categories)

    NoteEditor --> NotesService : inject()
    NoteEditor --> CategoriesService : inject()
    NoteEditor *-- CategorySelector : catInput ↓ / (draftChange)(selected) ↑
    NoteEditor ..> Note : charge / enregistre (category = id)
    NoteList --> NotesService : inject()
    NoteList ..> Note : affiche categoryName / categoryColor
```

> **Existant vs à créer :**
> - **Existant** (inchangé ou extension légère) : `Note`, `NoteBlock`, `SqliteService`, `NotesService`,
>   `NoteEditor`, `NoteList`.
> - **À créer** : table SQL `categories` + migration (dans `CategoriesService`),
>   `CategoriesService`, `CategorySelector`, `CATEGORY_COLOR_PALETTE`.
> - **Extensions** : `Note` gagne `categoryName?` / `categoryColor?` (résolus par JOIN, non
>   persistés) ; `NotesService` passe à un `LEFT JOIN categories` ; `NoteList` utilise la
>   couleur de catégorie en priorité ; `NoteEditor` remplace l'input texte brut par
>   `CategorySelector`.

## 2. Lecture des relations

| Relation | Signification |
|---|---|
| `Note ..> Category` | `Note.category` stocke désormais **`Category.id`** (D-C1) ; le nom et la couleur affichables sont résolus à la lecture. |
| `SqliteService <|-- Notes/CategoriesService` | Les deux services partagent la connexion, le garde `ready`, le wrapper `runQuery` et le flush `persist` (pattern existant). |
| `CategoriesService ..> SqliteService` | Le service porte aussi la **migration DDL** : création de `categories` + réécriture de `notes.category` (nom → id). |
| `NoteEditor *-- CategorySelector` | L'écran imbrique le sélecteur : `[categories] [draft] [color]` en entrée, `(draftChange)` pour la frappe libre et `(selected)` pour la prise dans la liste. |
| `NoteEditor --> CategoriesService` | Charge la liste globale au démarrage, enregistre la note avec un **id de catégorie** et délègue l'autocréation via `getOrCreate`. |
| `NoteList ..> Note` | Affiche `categoryName` (fallback : chaîne vide) et tinte les cartes avec `categoryColor`. |

---

## 3. Approche de développement

#### Lot 1 — Modèle de données & migration
*   **Au lancement de l'application (Migration automatique) :**
    *   Vérifier si la table des catégories existe dans la base de données.
    *   Si la table est nouvelle et qu'il existe des notes avec des noms de catégories textuels :
        *   Récupérer la liste de tous les noms de catégories uniques présents dans les notes.
        *   Pour chaque nom trouvé :
            *   Créer une nouvelle entrée dans la table `categories` avec un identifiant unique.
            *   Mettre à jour les notes concernées pour remplacer le nom par l'identifiant de la catégorie.
    *   Enregistrer ces modifications pour que la migration ne se relance plus au prochain démarrage.
*   **En parallèle (Mise à jour des outils de développement) :**
    *   Mettre à jour `scripts/schema_notes.sql` pour refléter le nouveau modèle.
    *   Générer un nouveau seed contenant déjà la table `categories` et les notes avec leurs nouveaux IDs.

#### Lot 2 — Service des catégories (`CategoriesService`)
*   **Récupération des catégories :** Consulter la table et renvoyer la liste triée par nom.
*   **Recherche par nom :** Prendre le nom saisi, enlever les espaces inutiles, et chercher une correspondance sans tenir compte de la casse.
*   **Création de catégorie :** Générer un nouvel identifiant unique et enregistrer le nom et la couleur.
*   **Gestion de l'existence (Autocréation) :** Chercher si le nom existe ; si oui, retourner la catégorie existante ; sinon, en créer une nouvelle.
*   **Mise à jour de la couleur :** Associer une nouvelle couleur à l'identifiant d'une catégorie existante.

#### Lot 3 — Lecture des notes enrichie (`NotesService`)
*   **Enrichissement des données :** Lors de la récupération d'une note (ou d'une liste de notes), effectuer une jointure avec la table des catégories pour récupérer le nom et la couleur associés à l'ID stocké dans la note.
*   **Mapping :** Transformer les données brutes (ID) en propriétés lisibles pour via l'interface Category qui sera attachée à l'interface Note à la place du categoryName et du categoryColor, sans modifier les données stockées en base.

#### Lot 4 — Composant de sélection (`CategorySelector`)
*   **Ouverture de la liste :** Lorsqu'on clique dans le champ, afficher une liste déroulante contenant toutes les catégories disponibles.
*   **Filtrage dynamique :** Pendant la saisie, filtrer la liste pour n'afficher que les catégories correspondant au texte saisi.
*   **Option de création :** Si le texte saisi ne correspond à aucune catégorie, proposer l'option « Créer "[texte saisi]" ».
*   **Sélection :** Lors du clic sur un élément de la liste, remplir le champ avec le nom et fermer la liste.
*   **Personnalisation visuelle :** Permettre l'ouverture d'une palette de couleurs pour changer l'apparence du champ de saisie.

#### Lot 5 — Intégration dans l'éditeur (`NoteEditor`)
*   **Chargement initial :** Charger la liste des catégories et la catégorie associée à la note.
*   **Gestion de la saisie :** Permettre la sélection d'une catégorie existante ou la saisie d'un nouveau nom.
*   **Mémorisation de la couleur :** Si une nouvelle catégorie est en cours de création, mémoriser la couleur choisie pour l'appliquer lors de l'enregistrement.
*   **Processus d'enregistrement :**
    *   Transformer le texte saisi en un identifiant de catégorie (en créant la catégorie si nécessaire).
    *   Enregistrer la note avec cet identifiant.
    *   Mettre à jour la couleur de la catégorie si elle a été modifiée.

#### Lot 6 — Affichage dans la liste (`NoteList`)
*   **Affichage enrichi :** Utiliser le nom et la couleur de la catégorie pour l'affichage des cartes de notes dans la liste, au lieu de l'identifiant technique.

---

## 4. Impacts & points d'attention

- **Migration irréversible des données seedées** : après migration, `notes.category` contient des id — tout code qui suppose que c'est un nom doit être audité (`note-list.ts` lignes 65, 103 ; `note-list.html` ligne 41 ; specs `note-list.spec.ts`, `notes-service.spec.ts`). C'est le **principal risque de régression**.
- **Seed** : régénérer `frontend/public/assets/databases/family_notesSQLite.db` (table `categories` + notes au format id) ou laisser la migration runtime faire le travail — à trancher à l'implémentation, mais **tester la migration runtime est obligatoire** (chemin web `jeep-sqlite` + chemin natif).
- **`user_version`** : utiliser `PRAGMA user_version` pour rendre la migration idempotente et rejouable sans coûter une lecture de plus à chaque lancement.
- **NOCASE et doublons** : الindex `UNIQUE … COLLATE NOCASE` rend l'insertion en doublon impossible au niveau SQL ; `getOrCreate` doit rester idempotent sous concurrence (relecture après échec d'INSERT).
- **Dépendances entre lots** : 1 → 2 → 3 → (4 ∥ 5) → 6 ; le lot 6 casse l'affichage si le lot 3 n'est pas fait.
- **`saveNote` legacy** : opportunité de le supprimer/fusionner (mémoire projet) mais **hors périmètre** — ne pas y toucher dans ce lot.
- **Tests existants à mettre à jour** : `notes-service.spec.ts` (JOIN), `note-list.spec.ts` (fixtures `category` = id + `categoryName`), `note-editor.spec.ts` (double service).

## 5. Découpage suggéré

Ordre de réalisation (chaque lot est testable indépendamment — alimentera `plan_test` puis `dev_par_groupes`) :

1. **Lot 1** — migration & table `categories` (fondations, testable sur web store).
2. **Lot 2** — `CategoriesService` (CRUD + `getOrCreate`, tests purs).
3. **Lot 3** — `NotesService` avec JOIN (+ mise à jour des specs de lecture).
4. **Lot 4** — `CategorySelector` (composant isolé, tests de composant).
5. **Lot 5** — intégration `NoteEditor` (bout en bout US1–US4).
6. **Lot 6** — `NoteList` (affichage nom + couleur).

**Hors périmètre (rappel SPEC) :** sous-catégories ; interface dédiée de modification/suppression de catégories ; suppression en cascade des catégories devenues orphelines ; éditor de couleurs dans un menu de configuration.
