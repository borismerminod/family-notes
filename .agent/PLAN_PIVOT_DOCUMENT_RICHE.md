# Plan — Pivot vers une note « document riche unique » (abandon des blocs)

> Décidé le 2026-09-10. Remplace l'architecture par blocs de `PLAN_NOTES.md` §3.
> Voir aussi `MODELE_DONNEES_NOTES.md`, `DIAGRAMME_CLASSES_NOTES.md`,
> `PLAN_TESTS_NOTE_EDITOR.md` (à réaligner au fil des étapes).

## 1. Pourquoi

Le NoteEditor « squelette » livré en TDD (25/25) rendait chaque bloc texte dans un
`<textarea>` (texte brut) : **aucun formatage visible**, images impossibles. Objectif réel :
**voir dans la note** du texte riche (gras / italique / souligné, listes) et des images.

Le système de blocs (tableau + UUID, pensé pour une synchro CRDT) apporte du **structurel**
(réordonnancement, sync par bloc) mais alourdit sans bénéfice visible pour ce besoin.
**Décision : abandonner les blocs** pour un **document riche unique** — une seule zone
`contenteditable` où texte, formatage et (plus tard) images cohabitent dans un seul HTML,
stocké tel quel.

## 2. Périmètre

**Ce lot :** basculer le modèle de données et l'éditeur vers l'HTML unique, avec un rendu
**riche, visible et éditable** (formatage via raccourcis natifs Ctrl+B/I/U ; listes).

**Hors périmètre (lots suivants, séquencés par l'utilisateur) :** barre d'outils flottante
(boutons gras/italique/couleur/taille/liste), **insertion d'images**, détection liens / embed
vidéo, drag & drop, auto-save.

## 3. Décisions de conception

- **D1 — Contenu = HTML unique.** `Note.content: string` (HTML) remplace `blocks: NoteBlock[]`.
  La colonne `notes.content` (déjà `TEXT`) stocke l'HTML directement (plus de `JSON.parse`).
- **D2 — Rendu & édition.** `<div contenteditable>` : affiche l'HTML (rendu riche) et, à chaque
  saisie, on capte `innerHTML` → `content`. Formatage de base natif (Ctrl+B/I/U ; listes via la
  future barre d'outils).
- **D3 — Affichage / sécurité.** Rendu via `DomSanitizer` (désinfection). Risque XSS limité
  (appli locale mono-utilisateur) mais on sanitize par principe ; pas de scripts stockés.
- **D4 — Images (préparation).** Ce lot ne fait pas l'insertion d'images. Ultérieurement :
  inline `data:` (base64) dans l'HTML pour démarrer, bascule vers Capacitor Filesystem si la
  taille pose problème.
- **D5 — Modèles.** `note-block.model.ts` retiré ; `block-style.model.ts` (`TextFormat`,
  `NOTE_COLOR_PALETTE`) conservé pour la future barre d'outils ; `category.model.ts` inchangé.

## 4. Séquencement (via les skills du projet)

### Étape A — Modèle & couche données (avec tests)
- `note.model.ts` : `content: string` au lieu de `blocks` ; `index.ts` ajusté ; retrait
  `note-block.model.ts`.
- `NotesService` : `mapRowToNote` renvoie `content` (plus de `parseBlocks`) ; `createNote` /
  `updateNote` écrivent la chaîne HTML directement.
- **Réécrire `notes-service.spec.ts`** (contrat `blocks` JSON → `content` HTML) — skill
  `plan_test`, puis vert.
- **Migrer `scripts/seed_notes.sql`** : `content` JSON de chaque note → HTML équivalent
  (`<h1>…</h1><p>…</p>`), régénérer le `.db` des assets si nécessaire.

### Étape B — Éditeur « document riche » (TDD par groupes)
- **Réécrire `PLAN_TESTS_NOTE_EDITOR.md`** (version document riche) via skill `plan_test`.
  Contrat DOM : `.editor-title`, `.editor-category`, `.editor-content` (le contenteditable),
  `.btn-save`, `.btn-cancel`, `.spinner`, `.not-found`.
- **Réécrire `note-editor.spec.ts`** (remplace les cas blocs).
- **Implémenter groupe par groupe** via skill `dev_par_groupes` : à chaque groupe, tests +
  vérification rendu réel (Browser pane) + **validation utilisateur** avant le suivant.

### Fichiers touchés
`core/models/note.model.ts`, `core/models/index.ts` (- `note-block.model.ts`) ;
`core/services/notes-service.ts` (+ spec) ; `scripts/seed_notes.sql` (+ asset `.db`) ;
`note-editor/note-editor.ts` / `.html` (+ spec) ; `.agent/PLAN_TESTS_NOTE_EDITOR.md`.
`note-list` inchangé.

## 5. Vérification

- `cd frontend && npx ng test --watch=false` → suite complète verte à chaque étape.
- **Rendu réel** (Browser pane) : ouvrir une note du seed → HTML **formaté** ; taper + Ctrl+B
  → gras visible ; Enregistrer → recharger → formatage persistant. Aucune note en JSON/HTML brut.

## 6. Impact CRDT

Ce pivot invalide l'orientation CRDT « par bloc ». Une future synchro multi-appareils se fera
au niveau du document HTML entier (ou via un éditeur CRDT dédié). Acté dans `PLAN_NOTES.md`.
