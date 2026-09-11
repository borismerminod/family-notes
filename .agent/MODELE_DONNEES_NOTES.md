# Modèle de données — Module « Notes »

> Référence des modèles TypeScript du domaine Notes, créés le 2026-09-08.
> Complète `PLAN_NOTES.md` (§3, architecture par blocs) et sert de base aux phases 2+.

## 1. Vue d'ensemble

Une **note** est un tableau de **blocs** indépendants et réordonnables (architecture
par blocs, préparant la synchronisation CRDT). Chaque bloc porte un `id` (UUID) unique.
Le tableau de blocs est stocké en JSON dans la colonne `notes.content` et **désérialisé**
en `Note.blocks` par le `NotesService`.

```
Note
 ├─ id, title, category, updatedAt
 └─ blocks: NoteBlock[]
        ├─ HeadingBlock { content, style:{ size } }
        ├─ TextBlock    { content, style:{ size } }
        ├─ ImageBlock   { src }
        └─ VideoBlock   { url? | src? }
```

## 2. Fichiers (`frontend/src/app/core/models/`)

| Fichier | Contenu |
|---|---|
| `note.model.ts` | `Note` (repris et enrichi de `blocks: NoteBlock[]`) |
| `note-block.model.ts` | Union discriminée `NoteBlock` + type guards (`isTextBlock`, …) |
| `block-style.model.ts` | `BlockSize`, `TextBlockStyle`, `TextFormat`, `NOTE_COLOR_PALETTE`, `NoteColor` |
| `category.model.ts` | `Category` (anticipation — voir §5) |
| `index.ts` | Barrel d'export (`import { Note, NoteBlock } from '../core/models'`) |

## 3. Union discriminée des blocs

Discriminant : le littéral `type`.

| `type` | Interface | Champs spécifiques |
|---|---|---|
| `heading` | `HeadingBlock` | `content: string`, `style: TextBlockStyle` |
| `text` | `TextBlock` | `content: string`, `style: TextBlockStyle` |
| `image` | `ImageBlock` | `src: string` (chemin local Capacitor Filesystem) |
| `video` | `VideoBlock` | `url?` (lien externe → embed) **ou** `src?` (fichier local) |

Le **formatage inline** (gras / italique / souligné / couleur) est appliqué en **HTML**
dans le champ `content` (cf. `seed_notes.sql` : `<span style='color:#FF0000'>…</span>`).
`block-style.model.ts` décrit donc les *options* de la barre d'outils (`TextFormat`,
`NOTE_COLOR_PALETTE`), pas une structure persistée à part.

## 4. Correspondance SQL ⇄ modèle

Table `notes` (`scripts/schema_notes.sql`) :

| Colonne SQL | Champ `Note` | Transformation |
|---|---|---|
| `id` | `id` | direct |
| `title` | `title` | direct |
| `category` | `category` | direct |
| `content` (TEXT/JSON) | `blocks` | `JSON.parse` ⇄ `JSON.stringify` (défensif : `[]` si nul/illisible) |
| `updated_at` | `updatedAt` | renommage snake_case → camelCase |

Assuré par `NotesService` : `mapRowToNote` / `parseBlocks` (lecture),
`createNote` / `updateNote` (écriture, sérialisation des blocs).

## 5. Décisions & points ouverts

- **`Note.blocks` requis** (représentation parsée) plutôt qu'un `content: string` brut —
  aligné sur l'éditeur par blocs. Conséquence assumée : le service (dé)sérialise le JSON.
- **`category` reste une chaîne** (colonne `TEXT`). Le modèle `Category` **anticipe**
  l'auto-création décrite dans `PLAN_NOTES.md` §B.1 : la **table `categories`** et sa
  migration ne sont **pas encore créées** (hors périmètre de ce lot).
- **`saveNote` legacy** laissé tel quel (n'écrit que `id, title`) — à fusionner avec
  `createNote`/`updateNote` (déjà noté dans la mémoire projet).
- `BlockSize` couvre à la fois le seed (`h1`/`h2`/`normal`) et les tailles de la spec
  (Petite/Normale/Grande → `small`/`normal`/`large`).

## 6. Tests

`notes-service.spec.ts` (Vitest) mis à jour : le contrat utilise désormais `blocks`
(au lieu de `content`) et vérifie la (dé)sérialisation JSON ⇄ blocs. Suite : **37/37 verte**.
Lancer : `npx ng test --watch=false` (voir mémoire `test-setup-notes-service`).
