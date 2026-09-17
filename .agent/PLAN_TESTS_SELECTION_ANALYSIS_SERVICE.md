# Plan de Test (TDD) — `SelectionAnalysisService` (analyse DOM de la sélection)

> **Approche :** boîte noire / TDD. Calqué sur `PLAN_TESTS_FORMATTING_SERVICE.md`.
> Fonctionnalité : `PLAN_SELECTION_ANALYSIS_SERVICE.md`.
>
> **Contexte (2026-09-13).** Le formatage passait par un `FormattingService` **pur**
> (`applyFormat(html)`) alimenté par `range.cloneContents()`, qui **perd les ancêtres** : une
> sélection **dans** un `<strong>` arrive comme texte nu → le bouton ne s'allume pas et recliquer
> réenveloppe au lieu de retirer. On introduit un service **d'analyse** DOM-aware et **en lecture
> seule** (`SelectionAnalysisService`) qui reconstruit le **HTML structurant** de la sélection
> (ancêtres inclus), détecte **tous** les styles actifs pour la toolbar, et désigne la **cible de
> remplacement**. La mutation reste dans le `FormattingService` pur (inchangé), orchestrée par le
> composant.
>
> **Réconciliation.** Ce plan **remplace** l'ancien `PLAN_TESTS_SELECTION_FORMAT_SERVICE.md`
> (supprimé) qui supposait un service *mutant* — design A. On retient le design **B** : analyse en
> lecture seule + mutation conservée dans le service pur + périmètre de détection élargi (marques,
> listes, couleur, taille).

## 1. Objet testé

Le service `SelectionAnalysisService` (`core/services/selection-analysis-service.ts`,
`@Injectable({ providedIn: 'root' })`). Pour un **élément éditeur** (`contenteditable`) et la
**sélection courante**, **sans muter le DOM**, il expose :

- `getStructuringHtml(editor)` — HTML structurant de la sélection, ancêtres de mise en forme
  reconstruits jusqu'à la borne éditeur ;
- `getActiveStyles(editor)` — `{ bold, italic, underline, bullet, numbered, color, size }` ;
- `getReplacementRange(editor, action)` — `Range` à remplacer à la réinsertion (courant / ancêtre).

## 2. Dépendances (abstraites) et doublures de test

- **Aucune doublure** : le service utilise les **vraies** API `window.getSelection()` / `Range` /
  DOM, **supportées par jsdom**. **Jamais** d'`execCommand`/`queryCommand*`.
- **Montage** : chaque test crée un `<div contenteditable>` attaché à `document.body`, pose un
  `innerHTML` connu, puis une **vraie sélection** via un helper `selectText(...)`. `afterEach`
  détache l'éditeur et vide la sélection (`selection.removeAllRanges()`).
- Le service est instancié directement (`new SelectionAnalysisService()`), comme
  `FormattingService` dans `formatting-service.spec.ts:24`.

### Helpers de test
- `mountEditor(html: string): HTMLElement` — crée/attache l'éditeur, pose `innerHTML`.
- `selectText(node: Node, start: number, end: number)` — pose un `Range` réel sur un nœud texte.
- `selectAllOf(el: Element)` — sélectionne tout le contenu d'un élément (`selectNodeContents`).
- `collapseIn(node, offset)` — sélection **repliée** (curseur seul) pour les gardes.

## 3. Décisions de conception à figer (impactent les assertions)

- **D1 — Lecture seule.** Aucun appel n'altère `editor.innerHTML` ; tout test le vérifie
  implicitement (assertions sur des valeurs de retour, pas sur des mutations). *(validé)*
- **D2 — Détection par ancêtre bornée** à l'éditeur (`closest(...)` arrêté à `editor`). *(validé)*
- **D3 — HTML structurant reconstruit** par ré-enveloppement des ancêtres, dans l'ordre. *(à confirmer)*
- **D4 — Cible** : ajout → `Range` courant ; désenrobage (marque couvrant **toute** la sélection)
  → `Range` sur l'ancêtre de marque. *(à confirmer)*
- **D5 — Balises/styles** : `strong`/`em`/`u` ; couleur = `color` inline d'un `<span>` ancêtre ;
  taille = `<h1>`/`<h2>` ou `font-size` inline ; liste = `<ul>`/`<ol>` ancêtre. *(validé)*
- **D6 — `ActiveStyles`** = forme exacte du signal `active` (`rich-text-editor.ts:62-78`) :
  neutre = `{ bold:false, italic:false, underline:false, bullet:false, numbered:false,
  color:'', size:'normal' }`. *(validé)*
- **D7 — Gardes** : pas de sélection / hors éditeur / repliée → `getStructuringHtml` = `''`,
  `getActiveStyles` = neutre, `getReplacementRange` = `null`. *(validé)*

## 4. Cas de test

### Groupe 1 — `getActiveStyles` : détection
- **T1.1** `<strong>Bonjour</strong>`, sélection « Bonjour » → `bold` **vrai**, reste neutre.
- **T1.2** `Bonjour` (texte nu) → état **neutre** (D6).
- **T1.3** `<strong><em>Bonjour</em></strong>`, sélection « Bonjour » → `bold` **et** `italic`
  **vrais** (gras ET italique imbriqués).
- **T1.4** `<u>Note</u>` → `underline` vrai, `bold`/`italic` faux.
- **T1.5** `<span style="color:#e11d48">X</span>` → `color` = `'#e11d48'` (ou couleur normalisée).
- **T1.6a** `<h1>Titre</h1>` → `size` = `'h1'` ; **T1.6b** `<h2>…</h2>` → `'h2'`.
- **T1.6c** `<span style="font-size:small">x</span>` → `size` = `'small'` ; **T1.6d** `large`.
- **T1.7a** `<ul><li>a</li></ul>`, sélection « a » → `bullet` vrai ; **T1.7b** `<ol>` → `numbered`.
- **T1.8** Style détecté quel que soit l'ancêtre intermédiaire (ex. sélection dans
  `<strong><span style="color:red">x</span></strong>` → `bold` vrai **et** `color` = red).

### Groupe 2 — `getStructuringHtml` : reconstruction des ancêtres
- **T2.1** `<strong>Bonjour</strong>`, sélection entière → `'<strong>Bonjour</strong>'` (et **non**
  `'Bonjour'`) — cœur du correctif.
- **T2.2** `<strong><em>Bonjour</em></strong>` → `'<strong><em>Bonjour</em></strong>'`
  (ancêtres imbriqués reconstruits dans l'ordre extérieur → intérieur).
- **T2.3** Texte nu sélectionné → renvoie le texte tel quel (aucun enrobage ajouté).
- **T2.4** Sélection **partielle** d'un nœud texte dans `<strong>abcdef</strong>` (« cd ») →
  `'<strong>cd</strong>'` (l'ancêtre gras est reconstruit autour de la portion).
- **T2.5** Garde D7 (pas de sélection / hors éditeur / repliée) → `''`.

### Groupe 3 — `getReplacementRange` : cible de réinsertion
- **T3.1** Style **absent**, action d'ajout (ex. `{type:'bold'}` sur texte nu) → renvoie un
  `Range` équivalent au `Range` **courant** (mêmes bornes).
- **T3.2** Marque **présente couvrant toute** la sélection (`<strong>Bonjour</strong>`, tout
  sélectionné, action `{type:'bold'}`) → renvoie un `Range` positionné sur l'**ancêtre**
  `<strong>` (bornes = `selectNode(strong)`).
- **T3.3** Marque **débordante** (sélection partielle d'un `<strong>` plus long) → **hors
  périmètre du désenrobage** : documente le comportement retenu (renvoie le `Range` courant,
  traité comme un ajout) — voir §5.
- **T3.4** Garde D7 → `null`.

### Groupe 4 — Gardes (D7), transverses
- **T4.1** Aucune sélection (`selection.removeAllRanges()`) → `''` / neutre / `null`.
- **T4.2** Sélection **hors** de l'éditeur (sur un autre élément du `body`) → `''` / neutre / `null`.
- **T4.3** Sélection **repliée** (curseur seul) → `''` / neutre / `null`.
- **T4.4** **Lecture seule** : après n'importe quel appel, `editor.innerHTML` est **inchangé** (D1).

## 5. Hors périmètre (explicite)

- **Désenrobage partiel** (marque qui déborde la sélection : découpage de l'ancêtre) → lot
  ultérieur. La **détection** (Groupe 1) fonctionne quand même ; T3.3 ne fait que **documenter**
  le comportement transitoire, pas le tester comme une fonctionnalité de retrait.
- **Frappe curseur-replié** (« marque armée ») → lot ultérieur (couvert par les gardes ici).
- **Toggle off des listes** côté mutation (le service pur ne fait qu'envelopper) → seule la
  **détection** de liste est testée.
- Rendu rich text réel et surbrillance visuelle → **vérification navigateur**, pas jsdom (Groupe 4
  d'intégration du plan de fonctionnalité).

## 6. Ordre d'implémentation TDD suggéré

1. **Groupe 1** (`getActiveStyles` — débloque la surbrillance / reconnaissance) →
2. **Groupe 2** (`getStructuringHtml` — nourrit correctement le service pur) →
3. **Groupe 3** (`getReplacementRange` — permet la réinsertion au bon endroit) →
4. **Groupe 4** (gardes + lecture seule).

## 7. Points à valider avant d'écrire le `.spec.ts`

1. **Normalisation couleur** : compare-t-on la couleur brute (`'#e11d48'`) ou la valeur
   re-sérialisée par le DOM (`el.style.color`, souvent `rgb(...)`) ? Figer pour T1.5.
2. **Signature `getReplacementRange`** : reçoit-il la `FormatAction` complète (pour distinguer
   ajout vs désenrobage) — hypothèse retenue ici — ou seulement la marque ?
3. **Comportement T3.3** (marque débordante) : renvoyer le `Range` courant (ajout) est-il le
   repli voulu tant que le désenrobage partiel n'est pas implémenté ?
4. **Égalité de `Range`** dans les assertions : comparer `startContainer`/`startOffset`/
   `endContainer`/`endOffset` (pas d'égalité d'objet) — convention à acter pour les Groupes 3.

## Fichiers concernés

- **Créer** : `frontend/src/app/core/services/selection-analysis-service.spec.ts`.
- **Sous test** : `frontend/src/app/core/services/selection-analysis-service.ts` (créé à
  l'implémentation, cf. `PLAN_SELECTION_ANALYSIS_SERVICE.md`).
