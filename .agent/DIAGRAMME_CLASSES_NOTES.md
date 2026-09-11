# Diagramme de classes — Fonctionnalité « Notes »

> Vision globale de la fonctionnalité Note (modèles du domaine, service d'accès aux
> données, composant de liste). Créé le 2026-09-08. Complète `MODELE_DONNEES_NOTES.md`
> (détail des modèles) et `PLAN_NOTES.md` (architecture par blocs / CRDT).
>
> Le bloc ci-dessous est un diagramme Mermaid `classDiagram` : il se rend directement
> dans un aperçu Markdown compatible Mermaid (VS Code + extension, GitHub, etc.).

## 1. Diagramme

```mermaid
classDiagram
    direction LR

    %% ---------- Modèles du domaine ----------
    class Note {
        +string id
        +string title
        +string category
        +NoteBlock[] blocks
        +string updatedAt
    }

    class NoteBlock {
        <<union: HeadingBlock | TextBlock | ImageBlock | VideoBlock>>
    }

    class BaseBlock {
        <<interface>>
        +string id
        +BlockType type
    }

    class HeadingBlock {
        +'heading' type
        +string content
        +TextBlockStyle style
    }

    class TextBlock {
        +'text' type
        +string content
        +TextBlockStyle style
    }

    class ImageBlock {
        +'image' type
        +string src
    }

    class VideoBlock {
        +'video' type
        +string url?
        +string src?
    }

    class TextBlockStyle {
        <<interface>>
        +BlockSize size
    }

    class Category {
        <<interface — anticipé>>
        +string id
        +string name
        +string color?
    }

    %% ---------- Types énumérés / littéraux ----------
    class BlockType {
        <<type>>
        heading | text | image | video
    }

    class BlockSize {
        <<type>>
        small | normal | large | h2 | h1
    }

    class TextFormat {
        <<type>>
        bold | italic | underline
    }

    class NoteColor {
        <<type + NOTE_COLOR_PALETTE>>
        8 couleurs (#000000 … #8E8E93)
    }

    %% ---------- Service (accès données SQLite) ----------
    class NotesService {
        <<Injectable root>>
        -SQLiteConnection sqlite
        -SQLiteDBConnection db
        -string DB_NAME = "family_notes"
        -boolean isWeb
        -Promise~void~ ready
        -initializeDatabase() Promise~void~
        -mapRowToNote(row) Note
        -parseBlocks(content) NoteBlock[]
        +getAllNotes() Promise~Note[]~
        +getNoteById(id) Promise~Note?~
        +createNote(draft) Promise~Note~
        +updateNote(note) Promise~void~
        +saveNote(note) Promise~Note~
        +deleteNote(id) Promise~void~
    }

    %% ---------- Composant (UI liste) ----------
    class NoteList {
        <<Component app-note-list>>
        -NotesService noteService
        -Router router
        +Signal~Note[]~ notes
        +Signal~boolean~ isLoading
        +Signal~string~ searchQuery
        +Signal~Note[]~ filteredNotes
        +ngOnInit() void
        +loadNotes() Promise~void~
        +onAddNote() void
        +onEditNote(note) void
        +onDeleteNote(note) Promise~void~
    }

    %% ---------- Relations ----------
    Note "1" o-- "0..*" NoteBlock : blocks (JSON)
    NoteBlock <|.. HeadingBlock
    NoteBlock <|.. TextBlock
    NoteBlock <|.. ImageBlock
    NoteBlock <|.. VideoBlock
    BaseBlock <|.. HeadingBlock
    BaseBlock <|.. TextBlock
    BaseBlock <|.. ImageBlock
    BaseBlock <|.. VideoBlock
    HeadingBlock *-- TextBlockStyle : style
    TextBlock *-- TextBlockStyle : style
    BaseBlock ..> BlockType : type
    TextBlockStyle ..> BlockSize : size
    Note ..> Category : category (string, → Category.id à terme)

    NotesService ..> Note : produit / persiste
    NoteList --> NotesService : inject()
    NoteList ..> Note : affiche / filtre
```

## 2. Lecture des relations

| Relation | Signification |
|---|---|
| `Note o-- NoteBlock` (agrégation, 0..*) | Une note contient une liste ordonnée de blocs, sérialisée en JSON dans `notes.content`. |
| `NoteBlock <|.. Heading/Text/Image/Video` | Union discriminée sur `type` — chaque variante réalise le contrat `NoteBlock`. |
| `BaseBlock <|.. …` | Chaque bloc hérite des champs communs `id` (UUID) + `type`. |
| `Block *-- TextBlockStyle` (composition) | `HeadingBlock` et `TextBlock` embarquent leur style structurel (`size`). |
| `Note ..> Category` (dépendance) | `category` est aujourd'hui une **chaîne** ; pointera vers `Category.id` quand la table existera (anticipé — voir `MODELE_DONNEES_NOTES.md` §5). |
| `NoteList --> NotesService` | Le composant **injecte** le service (`inject(NotesService)`) et l'appelle pour charger/supprimer. |
| `NotesService ..> Note` | Le service mappe les lignes SQLite ⇄ `Note` et (dé)sérialise les blocs. |

## 3. Cycle CRUD (parcours des couches)

```
NoteList (UI, signals)
   │  loadNotes / onDeleteNote / onAddNote / onEditNote
   ▼
NotesService (Injectable)
   │  getAllNotes · getNoteById · createNote · updateNote · deleteNote
   │  mapRowToNote ⇄ parseBlocks  (JSON.parse/stringify des blocs)
   ▼
SQLite (@capacitor-community/sqlite, base "family_notes")
   table notes(id, title, content JSON, category, updated_at)
```

## 4. Notes de conception

- **Formatage inline** (gras/italique/souligné/couleur) : appliqué en **HTML** dans le
  `content` des blocs texte, pas comme structure persistée à part. `TextFormat` et
  `NoteColor`/`NOTE_COLOR_PALETTE` décrivent donc les *options* de la barre d'outils.
- **`saveNote` legacy** : n'écrit encore que `id, title` — à fusionner avec
  `createNote`/`updateNote` (cf. mémoire projet « écarts NotesService »).
- **`Category`** : modèle **anticipé**. La table `categories` et sa migration ne sont
  pas encore créées ; `Note.category` reste une colonne `TEXT`.
- **UUID par bloc** : prérequis de la future synchronisation CRDT (`PLAN_NOTES.md`).
