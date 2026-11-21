# Plan — Refonte de l'édition de style du Note Editor (vrai éditeur de texte)

> Décidé le 2026-09-12. Reprend la partie « écriture / édition de style » de
> `b42cc77` (CRUD notes + éditeur). Fait suite à `PLAN_PIVOT_DOCUMENT_RICHE.md`
> (contenu = HTML unique) et remplace l'approche « fonction pure » de
> `PLAN_TESTS_FORMAT_TOOLBAR.md`. Voir aussi `PLAN_TESTS_NOTE_EDITOR.md`.

## 1. Pourquoi

Dans le note editor, l'**enregistrement**, le **chargement**, le **titre** et la
**catégorie** fonctionnent bien. En revanche **l'édition de style du texte fonctionne
mal** et doit être entièrement reprise.

Cause racine (implémentation actuelle) :
- `FormatToolbar` (`frontend/src/app/format-toolbar/`) est une **fonction pure** : elle
  reçoit le HTML de la sélection via `@Input() selectedText` et le ré-emballe dans des
  balises (`<strong>`, `<em>`, `<span style>`…), qu'elle ré-émet via
  `@Output() formatApplied`.
- `NoteEditor` capte la sélection (`onSelectionChange`), passe son HTML à la toolbar, puis
  remplace la sélection par le HTML retourné (`onFormatApplied`).
- Conséquences (exactement les symptômes signalés) : cliquer « Gras » **empile** au lieu de
  **basculer** (`<strong><strong>…`), **aucun état actif** sur les boutons, **impossible de
  retirer** un style, et pas de mode « taper avec le gras activé ».

Objectif : un **vrai comportement d'éditeur de texte**. Un bouton (ex. Gras) reste
**visuellement actif** quand il l'est ; sélectionner du texte déjà gras **active** le bouton ;
recliquer sur le bouton actif **retire** le gras ; taper avec Gras activé écrit en gras. Idem
pour toutes les options (italique, souligné, couleur, taille, listes).

## 2. Périmètre

**Ce lot :** refonte du chemin **édition / formatage du contenu** — la zone
`contenteditable` de `note-editor.ts` (`onContentInput`, `onSelectionChange`,
`onFormatApplied`, machinerie `renderHtml`/`content`/`selectedText`/`savedRange`) et **tout**
le composant `format-toolbar`.

**Hors périmètre (ne pas toucher) :**
- `NotesService` (`core/services/notes-service.ts`) — CRUD SQLite intact.
- Champs Titre / Catégorie (`<input>`) et leur liaison aux signaux.
- `NoteEditor.onSave()` et le chargement dans `ngOnInit()` (title/category/content). Le
  contenu reste **une chaîne HTML unique** dans `notes.content` — format inchangé.
- Liste (`note-list`), routes, modèles.
- Incohérence pré-existante `seed_notes.sql` (JSON de blocs) vs éditeur HTML — non corrigée ici.

## 3. Décisions de conception

- **D1 — Moteur = API d'édition native du navigateur** (validé avec l'utilisateur).
  `document.execCommand` (bold/italic/underline, insertUnorderedList/insertOrderedList,
  foreColor, fontSize, formatBlock, insertHTML) + `queryCommandState` / `queryCommandValue`.
  Fournit **nativement** le toggle, l'état actif, l'activation à la re-sélection et la frappe
  « marque activée ». Déprécié mais universellement supporté, y compris la **WebView Android**
  de Capacitor. Compromis retenu : comportement d'éditeur avec un minimum de risque.
- **D2 — Un composant regroupant toolbar + contenteditable.** Nouveau composant
  `RichTextEditor` : la barre d'outils **et** le `<div contenteditable>` dans le même
  composant (demande explicite de l'utilisateur). `NoteEditor` l'embarque et ne gère plus que
  titre/catégorie/save/load.
- **D3 — Un service applique les fonctionnalités.** Nouveau `FormattingService` : fin wrapper
  autour de l'API native. `execCommand('styleWithCSS', true)` au démarrage → génère des
  `<span style>` propres plutôt que `<font>`.
- **D4 — État actif piloté par signaux.** `RichTextEditor` maintient un signal `active`
  recalculé via le service sur `selectionchange` (+ keyup/mouseup/input) ; les boutons portent
  `[class.active]` → surbrillance visible et mise à jour à la re-sélection.
- **D5 — Préservation de la sélection.** Chaque bouton de la toolbar reçoit
  `(mousedown)="$event.preventDefault()"` pour ne pas voler le focus du contenteditable
  (sinon `execCommand` agirait hors sélection).
- **D6 — Injection du contenu sans saut de curseur.** Le HTML entrant n'est écrit dans le DOM
  qu'au **chargement initial / arrivée d'une note** (effet gardé : écrire seulement si la
  valeur diffère de `editor.innerHTML` **et** que l'éditeur n'a pas le focus). Nos propres
  frappes ne sont jamais ré-injectées. Gère l'arrivée asynchrone de la note en mode édition.
- **D7 — Média au caret.** Popups image / vidéo + `FileReader` + `toEmbedUrl` (repris de
  l'ancienne toolbar) ; insertion via `FormattingService.insertHtml(...)` au caret (au lieu
  d'émettre vers un parent).

## 4. Correspondance comportement demandé → mécanisme natif

| Scénario | Mécanisme |
|---|---|
| Clic Gras → bouton reste actif + visible | `execCommand('bold')` + `queryCommandState('bold')` → `[class.active]` |
| Sélection d'un texte déjà gras → bouton actif | `selectionchange` recalcule `active` via `queryCommandState` |
| Reclic sur Gras actif → retire le gras | toggle natif d'`execCommand('bold')` |
| Taper avec Gras activé (curseur replié) | état de frappe natif d'`execCommand` |
| Italique / souligné / listes | `queryCommandState` + toggle idem |
| Couleur / taille | `foreColor` / `fontSize`+`formatBlock` + `queryCommandValue` pour la surbrillance |

## 5. Architecture cible

```
NoteEditor (titre, catégorie, save/load)
  └── <app-rich-text-editor [content]="content()" (contentChange)="content.set($event)">
        ├── toolbar (marques, tailles, listes, couleurs, popups image/vidéo)  ← même composant
        └── div.editor-content [contenteditable]                              ← même composant
        (utilise FormattingService)
```

### `FormattingService` (`core/services/formatting-service.ts`)

Commandes (agissent sur la sélection du contenteditable focalisé) :
- `toggleMark('bold'|'italic'|'underline')` → `execCommand(...)` (toggle natif, curseur replié
  → frappe « marque activée »).
- `toggleList('bullet'|'numbered')` → `execCommand('insertUnorderedList'|'insertOrderedList')`.
- `setColor(color)` → `execCommand('foreColor', false, color)`.
- `setSize(size)` : `small|normal|large` → `execCommand('fontSize', false, {small:2, normal:3,
  large:5})` ; `h1|h2` → `execCommand('formatBlock', false, 'H1'|'H2')`.
- `insertHtml(html)` → `execCommand('insertHTML', false, html)`.

Requêtes d'état actif :
- `isMarkActive(...)` → `queryCommandState`. `isListActive(...)` → `queryCommandState`.
- `currentColor()` → `queryCommandValue('foreColor')` normalisé (rgb→hex) pour comparer à
  `NOTE_COLOR_PALETTE`.
- `currentSize()` → combiner `queryCommandValue('formatBlock')` (h1/h2) et
  `queryCommandValue('fontSize')` (bucket → small/normal/large).

Helpers purs (testables sous jsdom) : mapping taille↔bucket, normalisation couleur rgb→hex,
`toEmbedUrl` (YouTube/Vimeo, repris de l'ancienne toolbar).

### `RichTextEditor` (`rich-text-editor/rich-text-editor.ts` / `.html` / `.css`)

- **Template** : boutons de la toolbar (repris de `format-toolbar.html`) **au-dessus** du
  `<div #editor class="editor-content" contenteditable="true">`, dans le même composant.
- **Entrées/sorties** : `[content]` (HTML initial) + `(contentChange)` émis sur `(input)` et
  après chaque commande (`editor.innerHTML`).
- **État actif** : signal `active` (record `bold/italic/underline/bullet/numbered` + `color` +
  `size`), recalculé via `FormattingService`. Boutons `[class.active]="active().bold"` etc.
- **Sélection préservée** : `(mousedown)="$event.preventDefault()"` sur chaque bouton ;
  `(click)` → service → recalcul `active` → émission du contenu.
- **Média** : popups image/vidéo + FileReader + `toEmbedUrl` → `insertHtml` au caret.

### Fichiers

**À créer**
- `frontend/src/app/core/services/formatting-service.ts` (+ `.spec.ts`)
- `frontend/src/app/rich-text-editor/rich-text-editor.ts` / `.html` / `.css` (+ `.spec.ts`)

**À modifier**
- `note-editor/note-editor.ts` — retirer `selectedText`, `savedRange`, `onSelectionChange`,
  `onFormatApplied`, `renderHtml` + machinerie de sélection ; importer `RichTextEditor` au lieu
  de `FormatToolbar` ; garder `content`, `onSave`, `ngOnInit`.
- `note-editor/note-editor.html` — remplacer `<app-format-toolbar>` + `<div contenteditable>`
  par `<app-rich-text-editor [content]="content()" (contentChange)="content.set($event)">`.
- `note-editor/note-editor.css` — déplacer les styles du contenu riche (`.editor-content`,
  `h1/h2/p/ul/ol/li/img`, placeholder) vers `rich-text-editor.css` ; garder navbar/en-tête.
- `note-editor/note-editor.spec.ts` — retirer/adapter les tests de formatage (contrat
  pure-function disparu) ; garder load/save/title/category/not-found.

**À supprimer**
- `frontend/src/app/format-toolbar/` (`.ts` / `.html` / `.css` / `.spec.ts`) — markup toolbar +
  logique média migrés dans `RichTextEditor` ; logique de style dans `FormattingService` ;
  récupérer les styles CSS et `toEmbedUrl`.

## 6. Tests

jsdom **n'implémente pas** `execCommand`/`queryCommandState` → la vérification comportementale
réelle se fait **en navigateur** (§7), pas en unitaire.

- `formatting-service.spec.ts` : helpers purs (mapping taille↔bucket, normalisation couleur,
  `toEmbedUrl`) ; pour les commandes, **mocker** `execCommand`/`queryCommandState`/
  `queryCommandValue` et vérifier les appels/arguments.
- `rich-text-editor.spec.ts` : rendu des boutons ; clic → appel du service (mocké) avec la
  bonne commande ; `[class.active]` reflète l'état d'un service mocké ; ouverture des popups ;
  émission de `contentChange`.
- `note-editor.spec.ts` : retirer les cas de l'ancien contrat pure-function/sélection ; garder
  load/save/title/category/not-found (contenu via `<app-rich-text-editor>`).
- Supprimer `format-toolbar.spec.ts`.

## 7. Vérification (bout en bout)

1. `cd frontend && npm test` → suite unitaire verte (helpers service + composants mockés +
   notes-service intact).
2. Dev server (Browser pane, pas Bash) : `ng serve`, ouvrir `/notes/new`.
3. Dans le contenteditable :
   - Taper, sélectionner un mot, cliquer **Gras** → mot gras **et** bouton actif.
   - Re-sélectionner → bouton Gras actif ; recliquer → gras retiré.
   - Curseur seul (sans sélection), activer Gras, taper → nouveau texte gras.
   - Répéter pour Italique, Souligné, une couleur, une taille (small/large/H1/H2), listes
     à puces/numérotées → surbrillance + toggle.
   - Insérer image (lien + fichier) et vidéo YouTube → insertion au caret.
4. Enregistrer, rouvrir la note → formatage **persisté** et **ré-affiché** ; boutons se
   réactivent à la re-sélection de texte stylé.
5. Console navigateur : aucune erreur.

## 8. Notes / limites

- `execCommand` déprécié mais universel (WebView Android incluse) — compromis assumé (D1).
- Insertion média : `insertHTML` avec URLs saisies (parité avec l'existant) — échappement des
  attributs à envisager, hors périmètre.
