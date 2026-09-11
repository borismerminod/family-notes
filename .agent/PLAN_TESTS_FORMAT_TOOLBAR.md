# Plan de Test (TDD) — Barre d'outils de formatage (`FormatToolbar`)

> Rédigé le 2026-09-10 (skill `plan_test`). Approche **boîte noire / TDD**.
> Jumeaux de référence : `PLAN_TESTS_NOTE_LIST.md` (conventions) et les **Groupes 6-8**
> de `note-editor.spec.ts` (mise en forme + image/vidéo) que ce composant **rapatrie**.
> Cadre : pivot « document riche unique » (`PLAN_PIVOT_DOCUMENT_RICHE.md`).

## 1. Objet testé

Un composant **barre d'outils** (`app-format-toolbar`) intégré à terme dans le `NoteEditor`.
Son rôle : **agir comme une fonction** — recevoir **une portion de texte** (ou une URL / un
fichier média) en entrée et **retourner le HTML** correspondant à l'action choisie (la « sortie »),
émise vers le parent.

**Cœur du composant** = des **méthodes pures** (`applyFormat`, `insertImage`, `insertVideo`) sans
effet de bord ni dépendance à la sélection du navigateur (donc **testables** sous jsdom,
contrairement à `document.execCommand` qui y est un no-op — cf. `PLAN_TESTS_NOTE_EDITOR.md` D3).

**Périmètre de ce lot** (validé avec l'utilisateur) :
- **Marques** : gras / italique / souligné → balises **sémantiques** `<strong>` / `<em>` / `<u>`.
- **Couleur** : `<span style="color:…">` — **style inline** (n'importe quelle couleur ; la palette
  ne peuple que les pastilles).
- **Taille** : `<span style="font-size:…">` — style inline, `BlockSize`
  (`small`/`normal`/`large`/`h1`/`h2`).
- **Listes** : liste **à puces** → `<ul><li>…</li></ul>` ; liste **numérotée** → `<ol><li>…</li></ol>`.
- **Image** : un bouton ouvre une **popup** permettant d'insérer une image **par lien** ou
  **depuis le PC** (fichier) → `<img src="…">`.
- **Vidéo incrustée** : un bouton ouvre une **popup**, insertion **par lien uniquement** →
  embed `<iframe>`.
- **Câblage DOM → parent** : boutons/popups qui **émettent** la sortie via un `@Output()`.

**Hors périmètre :**
- Capture réelle de la sélection (`window.getSelection`, `Range`) et **réinjection** dans le
  `contenteditable` : **intégration** au sein du `NoteEditor` (lot suivant). Ici, la portion est
  fournie en **entrée** (`@Input`), la sortie est **émise** (`@Output`).
- **Câblage `FileReader`** (fichier → data URL) et presse-papier : **intégration**, hors unitaire.
  On teste la **primitive** d'insertion à partir d'un data URL (D10), et le chemin **lien**
  entièrement.
- **Bascule/toggle** (retirer une marque déjà présente) : on **enrobe** toujours.
- **Échappement / désinfection** de l'entrée : enrobage tel quel ; désinfection au rendu
  (`DomSanitizer`, D3 du plan de pivot).
- Style visuel / position flottante de la barre au-delà de la présence des éléments.

## 2. Dépendances (abstraites) et doublures

Composant **quasi pur** :
- **Entrée** : la portion de texte (`@Input selectedText`) ; URL / data URL pour les médias.
- **Sortie** : le HTML transformé, **émis** via `@Output formatApplied` (collecté dans les tests).
- **Palette de couleurs** : `NOTE_COLOR_PALETTE` (`block-style.model.ts`) — pour les pastilles.

Aucune doublure de service / route / navigation nécessaire.

## 3. Contrat public (API du composant — figé par le TDD)

- **Méthodes pures** :
  - `applyFormat(text: string, action: FormatAction): string`
  - `insertImage(src: string): string`  → `<img src="{src}">` (lien ou data URL)
  - `insertVideo(url: string): string`  → embed `<iframe …>`
- **Action** (union discriminée) :
  - `{ type: 'bold' | 'italic' | 'underline' }`
  - `{ type: 'color'; color: string }`                ← hex libre
  - `{ type: 'size'; size: BlockSize }`
  - `{ type: 'list'; style: 'bullet' | 'numbered' }`
- **Entrée** : `@Input() selectedText: string` (défaut `''`) — doit porter le **HTML** de la
  sélection (pas le texte nu), pour permettre le **cumul** des mises en forme par imbrication (D13).
- **Sortie** : `@Output() formatApplied: EventEmitter<string>` — émet la sortie au clic d'un
  bouton (transformation) ou à la confirmation d'une popup (média).

### Correspondance taille → `font-size` (D4)

| `BlockSize` | `font-size`  |
|-------------|--------------|
| `small`     | `small`      |
| `normal`    | *(inchangé)* |
| `large`     | `large`      |
| `h2`        | `x-large`    |
| `h1`        | `xx-large`   |

## 4. Décisions de conception à figer (impactent les assertions)

- **D1 — Fonctions pures au cœur.** `applyFormat` / `insertImage` / `insertVideo` retournent une
  chaîne, sans toucher au DOM ni à une sélection ; objet principal des tests. *(à confirmer)*
- **D2 — Marques sémantiques.** `bold → <strong>`, `italic → <em>`, `underline → <u>`. *(à confirmer)*
- **D3 — Couleur = style inline.** `<span style="color:{c}">{t}</span>` pour toute couleur non vide. *(à confirmer)*
- **D4 — Taille = style inline.** `<span style="font-size:{v}">{t}</span>` (table §3) ;
  `normal` → **texte inchangé**. *(à confirmer)*
- **D5 — Listes.** puces → `<ul><li>{t}</li></ul>` ; numérotée → `<ol><li>{t}</li></ol>`. Un texte
  **multi-lignes** (`\n`) devient **un `<li>` par ligne**. *(à confirmer)*
- **D6 — Portion vide.** `applyFormat('', action)` → `''` (aucune balise). *(à confirmer)*
- **D7 — Contenu préservé.** Le texte d'entrée est réinséré **littéralement** entre les balises. *(à confirmer)*
- **D8 — Émission.** Cliquer un bouton (ou confirmer une popup) émet `formatApplied` avec la
  sortie de la méthode correspondante. *(à confirmer)*
- **D9 — Garde « aucune sélection ».** Pour les **transformations** (marques/couleur/taille/liste),
  si `selectedText` est vide, un clic **n'émet rien**. (Les médias ne dépendent pas de la sélection.) *(à confirmer)*
- **D10 — Image.** `.btn-image` ouvre une **popup** (`.image-popup`). Chemin **lien** : URL dans
  `.image-url-input` + `.btn-image-link` → émet `<img src="url">`. Chemin **fichier** : `.btn-image-file`
  (`input[type=file]`) ; le câblage `FileReader` est **intégration**, on teste la **primitive**
  `insertImage(dataURL)` → émet `<img src="data:…">`. *(à confirmer)*
- **D11 — Vidéo (lien seul).** `.btn-video` ouvre une **popup** (`.video-popup`) avec
  `.video-url-input` + `.btn-video-link` → émet un embed `<iframe>` pointant la vidéo.
  **Aucune** insertion de fichier vidéo (`.btn-video-file` absent). *(à confirmer)*
- **D12 — Popups conditionnelles.** Les popups sont rendues via `@if` : **absentes du DOM** quand
  fermées, présentes après clic sur le bouton déclencheur. *(à confirmer)*
- **D13 — Cumul par imbrication.** La barre enveloppe le **HTML sélectionné** tel quel : les mises
  en forme s'**empilent** sans écraser l'existant (ex. `<strong>x</strong>` + souligné →
  `<u><strong>x</strong></u>`). Pas de toggle (retirer une marque reste hors périmètre).
  L'intégration (note-editor) passe le HTML de la sélection en entrée. *(validé)*

## 5. Contrat DOM (sélecteurs ciblés par les tests)

| Sélecteur           | Élément                                              |
|---------------------|------------------------------------------------------|
| `.btn-bold`         | bouton gras                                          |
| `.btn-italic`       | bouton italique                                      |
| `.btn-underline`    | bouton souligné                                      |
| `.color-swatch`     | pastille de couleur (une par entrée de la palette)   |
| `.btn-size-small`   | bouton taille « petite »                             |
| `.btn-size-normal`  | bouton taille « normale »                            |
| `.btn-size-large`   | bouton taille « grande »                             |
| `.btn-size-h1`      | bouton taille « titre 1 »                            |
| `.btn-size-h2`      | bouton taille « titre 2 »                            |
| `.btn-list-bullet`  | bouton liste à puces                                 |
| `.btn-list-numbered`| bouton liste numérotée                               |
| `.btn-image`        | bouton ouvrant la popup image                        |
| `.image-popup`      | conteneur de la popup image (conditionnel)           |
| `.image-url-input`  | champ URL de l'image                                 |
| `.btn-image-link`   | valider l'insertion par lien                         |
| `.btn-image-file`   | `input[type=file]` d'insertion depuis le PC          |
| `.btn-video`        | bouton ouvrant la popup vidéo                        |
| `.video-popup`      | conteneur de la popup vidéo (conditionnel)           |
| `.video-url-input`  | champ URL de la vidéo                                |
| `.btn-video-link`   | valider l'insertion vidéo par lien                   |

> Les pastilles `.color-swatch` portent leur couleur (`[attr.data-color]` = hex, `[title]`).

## 6. Cas de test

### Groupe 1 — Marques sémantiques (fonction pure)
- **T1.1** `bold` → `<strong>{t}</strong>`. **T1.2** `italic` → `<em>{t}</em>`.
  **T1.3** `underline` → `<u>{t}</u>`.
- **T1.4** cumul : `applyFormat('<strong>Salut</strong>', underline)` → `<u><strong>Salut</strong></u>` (D13).

### Groupe 2 — Couleur (fonction pure)
- **T2.1** couleur palette (`#FF3B30`) → `<span style="color:#FF3B30">{t}</span>`.
- **T2.2** couleur hors palette (`#123456`) → appliquée aussi (aucune restriction).

### Groupe 3 — Taille (fonction pure)
- **T3.1** `h1` → `font-size:xx-large`. **T3.2** `h2` → `x-large`. **T3.3** `small` → `small`.
  **T3.4** `large` → `large`. **T3.5** `normal` → texte inchangé.

### Groupe 4 — Listes (fonction pure)
- **T4.1** puces (une ligne) → `<ul><li>{t}</li></ul>`.
- **T4.2** numérotée (une ligne) → `<ol><li>{t}</li></ol>`.
- **T4.3** multi-lignes → un `<li>` par ligne (`a\nb` → `<ul><li>a</li><li>b</li></ul>`).

### Groupe 5 — Cas limites (fonction pure)
- **T5.1** portion vide → `''`, quelle que soit l'action (D6).
- **T5.2** texte multi-mots préservé littéralement (D7).

### Groupe 6 — Barre d'outils → sortie émise (`@Output`, DOM)
- **T6.1** clic `.btn-bold` → émet `<strong>…</strong>`. **T6.2** italique → `<em>`.
  **T6.3** souligné → `<u>`.
- **T6.4** clic `.color-swatch` rouge → émet `<span style="color:#FF3B30">…`.
- **T6.5** la palette rend **8 pastilles** (`NOTE_COLOR_PALETTE.length`).
- **T6.6** `.btn-size-h1` → émet `font-size:xx-large` ; `.btn-size-small` → `font-size:small`.
- **T6.7** `.btn-list-bullet` → émet `<ul><li>…`.
- **T6.8** `selectedText` vide, clic `.btn-bold` → **aucune** émission (D9).
- **T6.9** `selectedText` = `<strong>Bonjour</strong>`, clic `.btn-underline` → émet
  `<u><strong>Bonjour</strong></u>` (cumul, D13).

### Groupe 7 — Insertion d'image (popup lien / fichier)
- **T7.1** `.image-popup` **absente** au départ ; clic `.btn-image` la fait **apparaître** (D12).
- **T7.2** par lien : URL dans `.image-url-input` + `.btn-image-link` → émet `<img …>` pointant l'URL.
- **T7.3** primitive `insertImage('data:image/png;base64,AAAA')` → émet `<img …>` avec le data URL (D10).
- **T7.4** la popup contient un `input[type=file]` `.btn-image-file`.

### Groupe 8 — Insertion de vidéo (popup lien seul)
- **T8.1** `.video-popup` absente au départ ; clic `.btn-video` la fait apparaître.
- **T8.2** par lien (YouTube) : URL dans `.video-url-input` + `.btn-video-link` → émet `<iframe …>`
  pointant la vidéo (contient l'identifiant).
- **T8.3** **aucun** champ fichier vidéo : `.btn-video-file` **absent** (D11).
- **T8.4** primitive `insertVideo('https://www.youtube.com/watch?v=abc123')` → émet `<iframe …>`.

## 7. Articulation avec `note-editor.spec.ts`

Ce composant **rapatrie** et rend vérifiables les Groupes 6 (mise en forme, ex-`execCommand`),
7 (image) et 8 (vidéo) de `note-editor.spec.ts`. Quand le `NoteEditor` adoptera la barre (lot
suivant, `dev_par_groupes`), ces groupes y deviendront **obsolètes** et seront remplacés par un
test d'intégration « la barre est présente et sa sortie est réinjectée dans `.editor-content` ».
**Ce lot ne modifie pas `note-editor.spec.ts`.**

## 8. Concrétisation & vérification

- Spec : `frontend/src/app/format-toolbar/format-toolbar.spec.ts` (**Vitest**).
- Import de `FormatToolbar` (cible à venir) et de `NOTE_COLOR_PALETTE` depuis `../core/models`.
- **Attendu TDD : rouge.** ⚠️ Piège builder : la cible absente → `TS2307` qui **bloque tout le
  bundle**. Le cas échéant, proposer (sans l'imposer) un **squelette minimal** pour un vrai rouge.
- Commande : `cd frontend && npx ng test --watch=false`.

## 9. Ordre d'implémentation TDD suggéré

1. Marques → 2. Couleur → 3. Taille → 4. Listes → 5. Cas limites →
6. Câblage DOM (`@Output`) → 7. Image (popup) → 8. Vidéo (popup).

À chaque cas : rouge → minimum de code → vert, puis refactor.
