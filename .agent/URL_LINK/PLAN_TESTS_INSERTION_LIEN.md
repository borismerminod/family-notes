# Plan de Test (TDD) — Insertion d'un lien dans une note

> **Approche :** boîte noire / TDD. Ce plan décrit le **comportement observable attendu**
> avant toute implémentation. Il couvre l'ensemble de la fonctionnalité « insertion de lien »
> répartie sur **5 lots** (A→E) et **plusieurs `.spec.ts`**, regroupés ici en un plan global.
> Chaque section « cible » reste directement traduisible par le skill
> [`ecrire_tests`](../skill/ecrire_tests/SKILL.md), un `.spec.ts` par cible.
>
> **SPEC de référence :** [`URL_LINK/FEATURE_INSERTION_LIEN.md`](FEATURE_INSERTION_LIEN.md)
> (US1→US6). **Approche de dev :** [`URL_LINK/APPROCHE_INSERTION_LIEN.md`](APPROCHE_INSERTION_LIEN.md)
> (décisions §0 figées le 2026-09-18, lots A→E §3).
>
> **Jumeaux existants (conventions) :** [`PLAN_TESTS_DOCUMENT_MODEL.md`](../PLAN_TESTS_DOCUMENT_MODEL.md),
> [`PLAN_TESTS_DOCUMENT_RENDER.md`](../PLAN_TESTS_DOCUMENT_RENDER.md),
> [`PLAN_TESTS_DOCUMENT_PARSE.md`](../PLAN_TESTS_DOCUMENT_PARSE.md),
> [`PLAN_TESTS_RICH_TEXT_EDITOR.md`](../PLAN_TESTS_RICH_TEXT_EDITOR.md).
>
> ⚠️ **Rappel builder :** `@angular/build:unit-test` compile tout le bundle en une passe. Pour
> une **nouvelle** classe (ex. `ExternalLinkService`, `document-external-link.ts`), créer le
> **squelette minimal** (méthode qui `throw`) **avant** son spec, puis rouge → vert → refactor.

---

## 1. Objet testé

La pose, le rendu, la persistance et l'ouverture d'un **lien hypertexte** dans une note, réalisé
comme une **marque inline valuée** (`MarkType = 'link'`, URL portée par `Mark.value`) — jumelle de
`color`/`size` — et **non** comme un nouveau bloc. Cinq cibles de test :

| Cible (§) | Fichier sous test | Lot | US couvertes |
|---|---|---|---|
| A — Modèle & algèbre pure | `core/services/document-model.ts` (+ type `document.model.ts`) | A | US3, US6 |
| B1 — Rendu | `core/services/document-render.ts` | B | US4 |
| B2 — Parsing & sanitation | `core/services/document-parse.ts` | B | US2, US6 |
| B3 — Round-trip | `document-render.ts` ↔ `document-parse.ts` | B | US4 |
| C+D — Éditeur : bouton, barre 2 champs, insertion | `rich-text-editor.ts` / `.html` | C, D | US1, US2, US3 |
| E — Ouverture externe au tap | `core/services/external-link.ts` (**nouveau**) + `rich-text-editor` | E | US5 |

### Périmètre validé

- Déclaration de la marque `link` et sa commande pure `setLink` (pose / remplacement / toggle).
- Rendu `link → <a href …>` et parsing `<a> → marque link` avec **sanitation** des schémas.
- Round-trip `parse(render(m)) == m` avec `link` seul et cumulé aux autres marques.
- Bouton « lien » + barre d'insertion pleine largeur à **deux champs** (URL + libellé).
- Insertion du libellé au curseur, porteur de la marque, curseur replacé **hors** du lien.
- Ouverture de l'URL dans le navigateur externe (natif) ou repli web au tap.

### Hors périmètre (rappel SPEC + APPROCHE §5)

- **Édition** d'un lien posé via une UI dédiée ; bouton « retirer le lien » (le retrait passe par
  l'effacement du texte — **gratuit** via l'algèbre existante, cf. §A/US6).
- État « lien actif » dans la surbrillance de la barre d'outils (`ActiveState`) — **différé**.
- Auto-linkification, prévisualisation enrichie, liens internes (note/date), validation métier
  de l'URL distante.
- La mécanique d'algèbre d'intervalles **générique** (`deleteRange`, `splitBlock`, `mergeBlocks`,
  `canonicalMarks`) : déjà couverte par `PLAN_TESTS_DOCUMENT_MODEL.md` ; ici on ne teste que le
  **delta `link`** (les cas US6 vérifient que `link` se comporte comme une marque valuée, pas
  l'algèbre elle-même).

---

## 2. Dépendances (abstraites) & doublures de test

- **Modèle document** (`DocumentModelService`) : service **pur**, instancié réellement
  (`new DocumentModelService()`), aucune doublure — cf. jumeau render.
- **Sélection** (`DocumentSelectionService`) : réelle, comme dans `rich-text-editor.spec.ts`
  (montage `contenteditable`, helper `selectInBlock(id, start, end)`).
- **Ouverture externe** (`ExternalLinkService`) : **espionnée** dans le spec de l'éditeur —
  on vérifie que `open(url)` est appelé avec la bonne URL **sans** réellement ouvrir de page.
- **Plateforme Capacitor** (`Capacitor.isNativePlatform`) et **`Browser.open`** (`@capacitor/browser`) :
  **doublés/espionnés** dans le spec de `ExternalLinkService` pour distinguer natif vs web.
- **`window.open`** : espionné (repli web).

> Aucune doublure ne fige de signature au-delà du strict nécessaire : le contrat émerge du TDD.

---

## 3. Décisions de conception à figer (impactent les assertions)

- **DL1 — Marque valuée** : `MarkType += 'link'` ; `Mark.value` = URL `http(s)`. Pas de nouveau
  bloc, pas de nouveau guard. *(figé — APPROCHE §0.1)*
- **DL2 — Ordre d'imbrication (`TYPE_ORDER`)** : `link` est la marque **la plus externe**. Dans un
  segment cumulant plusieurs marques, l'ordre de nesting devient
  `a ▸ strong ▸ em ▸ u ▸ span[color] ▸ span[font-size]`. Les **deux** copies de `TYPE_ORDER`
  (model + render) sont modifiées **à l'identique**. *(à confirmer — rang libre tant que les deux
  tables concordent ; « externe » retenu pour la lisibilité, APPROCHE §3 Lot A.2)*
- **DL3 — `setLink(block, from, to, url)`** : miroir de `setColor` (mécanique `setValueMark`) —
  remplace tout `link` déjà présent sur la plage puis pose le nouveau ; ré-appliquer la **même**
  URL sur une plage entièrement couverte le **retire** (toggle) ; deux URL différentes ne
  fusionnent jamais. Plage collapsée (`from == to`) → bloc normalisé **inchangé**. *(à confirmer)*
- **DL4 — Rendu `link`** : `<a href="URL" target="_blank" rel="noopener noreferrer">…</a>`,
  `URL` échappée via `escapeAttr` (`& < > "`). *(à confirmer — APPROCHE §3 Lot B)*
- **DL5 — Parsing `<a>`** : `href` lu via `getAttribute('href')`, passé à `sanitizeHttpUrl` ;
  URL valide → marque `{ type:'link', value:url }` sur `[start, end)` ; sinon **marque droppée,
  texte conservé** (`<a>` dégrafé). *(à confirmer)*
- **DL6 — `sanitizeHttpUrl(href)`** : n'accepte que les schémas **`http:` / `https:`** (via
  `new URL()` + test du protocole) ; `javascript:`, `data:`, `href` vide, `href` relatif non
  résolu → `''`. **Point unique de filtrage**, appelé à l'insertion, au parse et à l'ouverture.
  *(à confirmer — APPROCHE §0.4)*
- **DL7 — Insertion (`insertLinkFromUrl`)** : `url = sanitizeHttpUrl(trim(linkUrl()))` → **no-op**
  si vide/invalide ; `label = trim(linkLabel())`, repli `label = url` si vide ; le libellé est
  inséré au curseur porteur de la marque ; **curseur replacé après le lien** (borne exclue → la
  frappe suivante n'hérite pas du lien). Pas de curseur dans un bloc texte (bloc média sélectionné,
  doc vide, sélection multi-blocs) → **nouveau bloc texte** inséré à `insertionIndex` (cohérent
  médias). *(à confirmer — APPROCHE §3 Lot D)*
- **DL8 — `ExternalLinkService.open(url)`** : `sanitizeHttpUrl` d'abord (défense en profondeur,
  no-op si invalide) ; natif (`Capacitor.isNativePlatform()`) → `Browser.open({ url })` ; web →
  `window.open(url, '_blank', 'noopener')`. *(à confirmer)*
- **DL9 — Interception du tap (`onEditorClick`)** : si le clic vise (ou est contenu dans) un `<a>`
  porteur d'un `href` → `event.preventDefault()` puis `linkOpener.open(href)`. Ouvre **toujours**,
  que l'éditeur ait le focus ou non (écart US5 assumé, APPROCHE §0.3). Clic **hors** d'un `<a>` →
  aucune ouverture (édition normale). *(à confirmer)*
- **DL10 — Migration** : **aucune**. Les notes existantes restent valides ; `Mark.value` existe
  déjà. *(figé)*

---

## 4. Cas de test

> Groupes numérotés par cible (`A`, `B1`, `B2`, `B3`, `CD`, `E`) puis par cas (`T…`). Un
> comportement observable par cas, en langage métier, relié aux user stories.

### §A — Modèle & `setLink` (`document-model.spec.ts`, étendu)

#### Groupe A1 — pose d'un lien
- **TA1.1** `setLink(block, from, to, url)` pose **une** marque `link` de valeur `url` sur exactement
  `[from, to)` (US3).
- **TA1.2** la marque `link` **cohabite** avec une marque existante (ex. `bold`) sur la même plage :
  le bloc canonique porte **les deux** marques, aucune n'écrase l'autre (US4 cumul).
- **TA1.3** `setLink` est **pur** : le bloc d'entrée n'est pas muté (`structuredClone` avant,
  `toEqual` après) ; offsets en UTF-16.

#### Groupe A2 — remplacement & toggle (DL3)
- **TA2.1** re-`setLink` avec une **URL différente** sur une plage déjà liée **remplace** l'URL
  (une seule marque `link`, nouvelle valeur ; les valeurs ne s'empilent pas).
- **TA2.2** re-`setLink` avec la **même URL** sur une plage entièrement couverte **retire** le lien
  (toggle off) → plus aucune marque `link`.
- **TA2.3** deux liens d'**URL différentes** adjacents ne fusionnent **pas** (clé `type:value`
  distincte) ; deux liens de **même URL** qui se touchent fusionnent en un seul intervalle.

#### Groupe A3 — plage limite
- **TA3.1** plage **collapsée** (`from == to`) → bloc normalisé **inchangé** (aucune marque `link`
  posée sur du vide).

#### Groupe A4 — retrait par effacement (US6, delta `link`)
- **TA4.1** `deleteRange` sur **tout** le texte d'un lien supprime la marque `link` (aucun résidu
  sur texte vide) (US6).
- **TA4.2** `deleteRange` sur **une partie** du texte d'un lien **conserve** la marque `link` sur la
  portion restante (US6), avec offsets rebasés.

### §B1 — Rendu `link` (`document-render.spec.ts`, étendu)

#### Groupe B1.1 — balise `<a>`
- **TB1.1** un run `link` (`value = 'https://ex.com'`) → `<a href="https://ex.com" target="_blank"
  rel="noopener noreferrer">…</a>` (DL4, US4).
- **TB1.2** l'URL est **échappée** dans l'attribut `href` (ex. `https://a.com/?x=1&y=2` →
  `href="https://a.com/?x=1&amp;y=2"`).
- **TB1.3** le **texte** du libellé reste échappé `& < >` à l'intérieur du `<a>`.

#### Groupe B1.2 — cumul & ordre (DL2)
- **TB1.4** `link` + `bold` sur le même segment → `<a …><strong>…</strong></a>` (`link` externe).
- **TB1.5** `link` + les 4 autres marques sur un segment → ordre complet
  `<a><strong><em><u><span[color]><span[font-size]>…` (nesting D7 + `link` externe).
- **TB1.6** deux liens **d'URL différentes** contigus → **deux** `<a>` distincts (pas de fusion).

### §B2 — Parsing & sanitation (`document-parse.spec.ts`, étendu)

#### Groupe B2.1 — `<a>` valide
- **TB2.1** `<a href="https://ex.com">clic</a>` → texte `clic` + marque `{type:'link',
  value:'https://ex.com'}` sur `[0,4)` (DL5).
- **TB2.2** `<a href="http://ex.com">x</a>` (schéma `http`) accepté.
- **TB2.3** `<a>` imbriqué avec `<strong>` (`<a href="…"><strong>x</strong></a>`) → texte `x`
  portant **deux** marques `link` + `bold`.

#### Groupe B2.2 — sanitation (DL6, US2/US6)
- **TB2.4** `<a href="javascript:alert(1)">x</a>` → marque **droppée**, texte `x` **conservé** sans
  lien.
- **TB2.5** `<a href="data:text/html,…">x</a>` → marque droppée, texte conservé.
- **TB2.6** `<a>` **sans** `href` (ou `href=""`) → marque droppée, texte conservé.
- **TB2.7** `<a href="/page/relative">x</a>` (relatif non résolu) → marque droppée, texte conservé.
- **TB2.8 (unité `sanitizeHttpUrl`)** — si testable directement : `https://ok` → `'https://ok'` ;
  `http://ok` → `'http://ok'` ; `javascript:…`, `data:…`, `''`, relatif → `''`. *(sinon couvert à
  travers le parse par TB2.4→2.7.)*

### §B3 — Round-trip `parse(render(m)) == m`

#### Groupe B3.1 — stabilité
- **TB3.1** modèle avec **un** bloc portant un `link` seul → `parse(render(m))` **égal** au modèle
  normalisé (intervalle et valeur identiques) (US4 persistance/affichage).
- **TB3.2** modèle avec `link` **cumulé** à `bold` + `color` sur des plages qui se chevauchent →
  round-trip stable (verrouille la concordance des **deux** `TYPE_ORDER`, DL2).
- **TB3.3** l'URL rendue (`href="https://…"`) relue via `getAttribute` puis `sanitizeHttpUrl`
  renormalise à l'identique (pas de dérive de casse/encodage sur l'intervalle).

### §C+D — Éditeur : bouton, barre, insertion (`rich-text-editor.spec.ts`, étendu)

#### Groupe CD1 — ouvrir/fermer la barre (US1)
- **TCD1.1** un bouton « lien » (`.btn-link`) est présent dans le groupe des boutons médias, avec
  `title` et `aria-label` explicites.
- **TCD1.2** cliquer `.btn-link` ouvre la barre d'insertion (`.media-popup.link-popup`), en pleine
  largeur, avec **deux** champs (URL + libellé), un bouton « Insérer le lien » et une croix.
- **TCD1.3** cliquer la croix (`.btn-close-popup`) ferme la barre **sans rien insérer** et
  **réinitialise** les deux champs (`linkUrl`/`linkLabel` vidés) (US1).

#### Groupe CD2 — saisie & no-op (US2)
- **TCD2.1** « Insérer le lien » avec **URL vide** → **no-op** : rien n'est inséré, le modèle est
  inchangé (US2, parité insertion image URL vide).
- **TCD2.2** « Insérer le lien » avec une URL **au schéma refusé** (`javascript:…`) → **no-op**
  (sanitation en amont, DL7).
- **TCD2.3** **libellé vide** + URL valide → le texte affiché **retombe sur l'URL** (US2).
- **TCD2.4** URL et libellé entourés d'**espaces** → **trim** avant insertion (US2).

#### Groupe CD3 — insertion au curseur (US3)
- **TCD3.1** curseur dans un bloc texte, URL + libellé valides → le **libellé** est inséré à la
  position du curseur dans le bloc courant, porteur d'une marque `link` de valeur = URL (US3).
- **TCD3.2** le texte inséré est **rendu comme un lien** : un `a[href]` apparaît dans le bloc,
  distinct du texte normal (US3/US4).
- **TCD3.3** après insertion, la barre **se ferme** et ses champs sont **réinitialisés** (US3).
- **TCD3.4** le **curseur se replace après** le libellé inséré ; la frappe suivante **n'hérite pas**
  du lien (borne exclue de la marque) (US3).
- **TCD3.5** une **sélection non collapsée** dans le bloc est **remplacée** par le libellé lié
  (`deleteRange` puis insertion) (US3).
- **TCD3.6** **aucun curseur dans un bloc texte** (bloc média sélectionné / doc vide / sélection
  multi-blocs) → un **nouveau bloc texte** contenant le libellé lié est inséré à `insertionIndex`
  (cohérent médias) (US3, DL7).

### §E — Ouverture externe au tap

#### Groupe E1 — `ExternalLinkService` (`external-link.spec.ts`, **nouveau**)
- **TE1.1** en contexte **natif** (`isNativePlatform()` doublé à `true`), `open(url)` appelle
  `Browser.open({ url })` avec l'URL sanitée (US5).
- **TE1.2** en contexte **web** (`isNativePlatform()` à `false`), `open(url)` appelle
  `window.open(url, '_blank', 'noopener')` (repli, US5).
- **TE1.3** `open` avec une URL **invalide** (`javascript:…`, vide) → **no-op** : ni `Browser.open`
  ni `window.open` appelés (DL8, défense en profondeur).

#### Groupe E2 — interception du tap (`rich-text-editor.spec.ts`, étendu)
- **TE2.1** un clic sur un `a[href]` de la zone d'édition déclenche `linkOpener.open(href)` avec la
  bonne URL, et **`preventDefault`** est appelé (le `<a>` natif n'agit pas) (US5).
- **TE2.2** l'ouverture se produit **que l'éditeur ait le focus ou non** (écart US5 assumé,
  DL9/APPROCHE §0.3).
- **TE2.3** un clic **hors** d'un `<a>` (texte normal) → `linkOpener.open` **n'est pas** appelé
  (édition normale préservée) (DL9).

---

## 5. Contrat DOM (sélecteurs ciblés par les tests)

> Fixe le contrat que l'implémentation (Lot C) devra honorer. Calqué sur la barre vidéo existante
> (`.media-popup.video-popup`), avec **un champ de plus**.

| Sélecteur | Rôle | Attributs attendus |
|---|---|---|
| `.btn-link` | bouton d'ouverture de la barre lien (groupe médias) | `type="button"`, `title` + `aria-label` « Insérer un lien », `(mousedown)="$event.preventDefault()"` |
| `.media-popup.link-popup` | barre d'insertion pleine largeur | `role="dialog"`, `aria-label="Insérer un lien"` |
| `.link-url-input` | champ URL | `placeholder="Lien (https://…)"`, lié à `linkUrl()` |
| `.link-label-input` | champ libellé | `placeholder="Texte à afficher"`, lié à `linkLabel()` |
| `.btn-link-insert` | valider l'insertion | libellé « Insérer le lien », `(click)="insertLinkFromUrl()"` |
| `.btn-close-popup` | fermer la barre (réutilisé) | `aria-label="Fermer"`, `(click)="closeLinkPopup()"` |
| `.editor-content` | zone d'édition | `(click)="onEditorClick($event)"` (interception du tap) |
| `.editor-content a[href]` | lien rendu dans la note | issu de `tagFor('link')` (DL4) |

---

## 6. Ordre d'implémentation TDD suggéré

Aligné sur le découpage APPROCHE §5 (chaque lot : rouge → vert → refactor) :

1. **§A** — type `'link'` + `setLink` + `TYPE_ORDER` (socle pur, testable en isolation).
2. **§B1** — rendu `<a>` (dépend de A).
3. **§B2** — parsing `<a>` + `sanitizeHttpUrl` (dépend du type).
4. **§B3** — round-trip (verrouille la concordance des deux `TYPE_ORDER`).
5. **§C+D** — bouton + barre 2 champs + `insertLinkFromUrl` (câble l'UI sur l'insertion).
6. **§E** — `ExternalLinkService` (natif/web) puis `onEditorClick` (interception du tap).

---

## 7. Points à valider avant d'écrire les `.spec.ts`

1. **DL2** — rang exact de `link` dans `TYPE_ORDER` (externe retenu) : confirmer que les deux copies
   (model + render) seront modifiées ensemble ; l'assertion porte sur l'**ordre** `<a>…</a>`, pas
   sur la valeur numérique.
2. **DL3** — `setLink` réutilise-t-il `setValueMark` (aujourd'hui typé `'color' | 'size'`) ? Si oui,
   élargir le type au niveau service ; sinon, commande dédiée. N'impacte pas les assertions
   (comportement identique).
3. **DL6/TB2.8** — `sanitizeHttpUrl` testé **en unité** (si exporté/atteignable) ou **à travers** le
   parse (TB2.4→2.7). Trancher la visibilité avant d'écrire le spec.
4. **§E** — dépendance `@capacitor/browser` (v8, alignée `core`) : le squelette
   `ExternalLinkService` doit exister (méthode qui `throw`) **avant** son spec (rappel builder). La
   version/`cap sync` relèvent de l'implémentation, pas du test.
5. **TE2.x** — stratégie de simulation du tap : `a[href]` réel rendu dans `.editor-content`,
   `dispatchEvent(new MouseEvent('click', { bubbles:true }))` sur le `<a>` ; `ExternalLinkService`
   fourni en **doublure espionnée** via `TestBed`.

---

## Fichiers concernés

- **Sous test / à étendre :**
  - `frontend/src/app/core/services/document-model.spec.ts` (§A)
  - `frontend/src/app/core/services/document-render.spec.ts` (§B1)
  - `frontend/src/app/core/services/document-parse.spec.ts` (§B2, §B3)
  - `frontend/src/app/rich-text-editor/rich-text-editor.spec.ts` (§C+D, §E2)
- **À créer :**
  - `frontend/src/app/core/services/external-link.spec.ts` (§E1) + squelette
    `frontend/src/app/core/services/external-link.ts`.
- **Modèle / services impactés (implémentation, hors de ce plan) :**
  `core/models/document.model.ts`, `core/services/document-model.ts`, `document-render.ts`,
  `document-parse.ts`, `rich-text-editor.ts` / `.html` / `.css`, `package.json`.
