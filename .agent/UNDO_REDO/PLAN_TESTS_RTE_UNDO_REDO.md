# Plan de Test (TDD) — Undo/Redo dans `RichTextEditor` (Lot B — câblage composant)

**Statut :** **validé le 2026-09-20** *(4 arbitrages Q1–Q4 tranchés par l'utilisateur — voir §7 ;
décisions de test DB1–DB7 figées §3)*. Rédigé le 2026-09-20.

> **Approche :** boîte noire / TDD. Ce plan décrit le **comportement observable** du **Lot B** de
> la fonctionnalité Undo/Redo : le **câblage** de la classe pure `EditHistory` (Lot A, livré et
> vert) dans le composant `RichTextEditor`. On monte le **vrai** composant (services `document-*`
> réels, comme le spec existant), on pose `blocks`, on place une sélection, on déclenche une
> commande ou une frappe, et on observe les **signaux** `canUndo()`/`canRedo()`, les émissions
> `blocksChange`, le **DOM re-rendu** et la **sélection restaurée**.
>
> **SPEC de référence :** [`FEATURE_UNDO_REDO.md`](FEATURE_UNDO_REDO.md) (US1→US6, D1–D8).
> **Approche de dev :** [`APPROCHE_UNDO_REDO.md`](APPROCHE_UNDO_REDO.md) — **Lot B** décrit au §3
> (`commit` = point d'empilement, `onInput` = frappe coalescée, `undo/redo/applyEntry` = cycle
> re-render + `setSelection` + `blocksChange.emit` **sans ré-empiler**, signaux `canUndo/canRedo`
> + `syncButtons()`), points d'attention R1/R2 au §4.
>
> **Jumeaux existants (conventions à suivre) :**
> - **Spec modèle du composant :** [`../../frontend/src/app/rich-text-editor/rich-text-editor.spec.ts`](../../frontend/src/app/rich-text-editor/rich-text-editor.spec.ts)
>   — montage `TestBed`, host attaché à `document.body`, helpers `setBlocks`/`selectInBlock`/
>   `editorEl`/`blockEl`/`firstText`, capture `emitted` de `blocksChange`, doublure `ExternalLinkService`.
> - **Lot A (référence de comportement de l'historique) :**
>   [`edit-history.ts`](../../frontend/src/app/core/services/edit-history.ts) +
>   [`edit-history.spec.ts`](../../frontend/src/app/core/services/edit-history.spec.ts),
>   plan [`PLAN_TESTS_EDIT_HISTORY.md`](PLAN_TESTS_EDIT_HISTORY.md).
> - **Plan composant :** [`../PLAN_TESTS_RICH_TEXT_EDITOR.md`](../PLAN_TESTS_RICH_TEXT_EDITOR.md).
> - **Plan lien (câblage barre + insertion) :** [`../URL_LINK/PLAN_TESTS_INSERTION_LIEN.md`](../URL_LINK/PLAN_TESTS_INSERTION_LIEN.md).
>
> ⚠️ **Rappel builder** (mémoire projet + skill `plan_test`) : `@angular/build:unit-test` (Vitest)
> compile **tout le bundle en une passe**, `node` hors PATH (node bundlé LMStudio), `node_modules`
> root-owned (pas d'install). Le Lot B **modifie** un composant existant (pas de nouvelle cible à
> `throw`), mais un spec qui référence une **API non encore ajoutée** (`component.undo()`,
> `component.canUndo()`, `onInput($event)`) casse en `TS2339`/`TS2554` et **bloque toutes les
> suites** — donc squelette d'API minimal avant le rouge d'assertions. (Aucune exécution ici — plan.)

---

## 1. Objet testé

Le **câblage** de l'historique undo/redo dans `RichTextEditor`
(`frontend/src/app/rich-text-editor/rich-text-editor.ts` + `.html`). L'algèbre d'historique
elle-même (pile passé/futur, coalescing, bornage) est **déjà testée en isolation au Lot A** et
n'est **pas** re-testée ici : on teste que le composant **branche correctement** cette classe sur
son cycle d'édition existant.

**Delta à câbler (APPROCHE §3 Lot B) :**

| Membre (RichTextEditor) | Statut | Rôle testé au Lot B |
|---|---|---|
| `history = new EditHistory()` | NEW | possession, 1 instance / éditeur (C1). |
| `canUndo = signal(false)` / `canRedo = signal(false)` | NEW | **signaux publics** exposant l'état (pilotent les boutons du Lot D). |
| `commit(newModel, at)` | MOD | **point d'empilement** : après paint + setSelection, `history.push({model, selection})` puis `emit` + `syncButtons()`. |
| `onInput(event)` | MOD | frappe : parse (sans repaint, inchangé) + `history.recordTyping({model, sel}, now, isBoundary)` + (ré)arme le timer de pause + `syncButtons()`. |
| `undo()` / `redo()` | NEW | dépilent, appliquent l'entrée via `applyEntry` **sans ré-empiler**, puis `syncButtons()`. |
| `applyEntry(entry)` | NEW (privé) | **même cycle que commit** (paint + setSelection + `blocksChange.emit` + refreshActive) **sans** `history.push`. |
| `syncButtons()` | NEW (privé) | `canUndo.set(history.canUndo())` / `canRedo.set(history.canRedo())`. |
| timer de pause (`armPauseTimer`) + nettoyage `DestroyRef` | NEW | scelle la salve à 500 ms d'inactivité ; annulé à la destruction. |

### Périmètre validé (Lot B)

- Une **commande** (marque/couleur/taille/liste/split/merge/paste/média/lien — toutes via `commit`)
  rend `canUndo()` vrai ; `undo()` **restaure l'état précédent** (modèle **et** sélection) et
  **re-render** ; `redo()` rétablit (US1/US3/US5).
- Les **signaux** `canUndo()/canRedo()` reflètent l'état de l'historique après chaque opération
  (US2/US4) — testés **au niveau de l'API du composant** (les boutons `[disabled]` = **Lot D**).
- Une **nouvelle commande après un undo** vide le futur → `canRedo()` redevient faux (US4) —
  observable via le composant (le mécanisme lui-même est Lot A).
- La **saisie libre** (`onInput`) **alimente** l'historique : le composant fournit l'horloge et le
  drapeau de **frontière de mot** ; le timer de pause **scelle** la salve. Un `undo` après une
  salve de frappe retire **toute la salve** (US1, D1/D2).
- `undo()/redo()` passent par `applyEntry` = **le même cycle que `commit`** (re-render +
  `setSelection` + `blocksChange.emit`) mais **sans** ré-empiler (US5) : pas de boucle, pas de pas
  parasite.
- Nettoyage du timer de pause à la destruction du composant.

### Hors périmètre (rappel APPROCHE §3/§4 + SPEC)

- **Algèbre `EditHistory`** (pile, coalescing exact ms, bornage FIFO ~100) : **Lot A**, déjà vert.
  Ici on vérifie le **branchement**, pas les seuils (sauf un cas représentatif « salve → 1 undo »).
- **Reset par note + garde d'echo R1** (`incoming === model()` dans l'`effect`, réinit de
  l'historique au (re)chargement) : **Lot C** (test d'intégration dédié). Ici on **note** la
  dépendance (voir §7-Q3) et on **isole** les tests Lot B de l'echo (le parent de test ne renvoie
  **pas** `blocksChange` dans l'entrée `blocks`, cf. §2).
- **Les deux boutons de barre** (`.btn-undo`/`.btn-redo`, `[disabled]`, `(mousedown)` preventDefault,
  CSS `:disabled`, icônes ↶/↷, placement) : **Lot D**. Le Lot B teste les **signaux/API** qui les
  piloteront, pas le markup.
- **Raccourcis clavier** (D4) et **undo natif** du contenteditable (L1) : non branchés (hors lot).
- **Détection fine IME / glisser-déposer / collage vs frappe** au-delà de « un pas par mot/pause ».
- **Persistance** de l'historique (D7/H1) : en mémoire uniquement.

---

## 2. Dépendances (abstraites) & doublures de test

- **Composant réel monté** via `TestBed`, **services `document-*` réels** (`providedIn:'root'`),
  host **attaché à `document.body`** pour disposer d'une **vraie sélection** jsdom — **strictement
  le montage du spec existant** (`rich-text-editor.spec.ts` L26–38). On **réutilise** ses helpers :
  `setBlocks(blocks)`, `selectInBlock(id, start, end)`, `editorEl()`, `blockEl(id)`, `firstText`,
  `last()` (dernier `blocksChange`), et le tableau `emitted`.
- **`ExternalLinkService`** : doublure espionnée déjà en place (inchangée).
- **`EditHistory`** : **instance réelle** possédée par le composant (pure, sans effet de bord DOM).
  Le contrat par défaut est **boîte noire** — on observe l'historique **à travers** `canUndo()`,
  `canRedo()`, `undo()`, `redo()` et les émissions, **sans** inspecter de membre privé. *(Q4 : un
  espion léger sur `component['history']` reste admis uniquement pour vérifier le **branchement** de
  la frappe — `recordTyping` reçoit les bons `now()`/`isBoundary` — en complément des cas boîte noire
  TB5.1–5.3.)*
- **Horloge injectée (seam `now`) — figé (Q2/DB3).** Le composant reçoit une **horloge injectable**
  `now: () => number` (défaut `Date.now`), **cohérente avec l'injection de `now` du Lot A**. Les
  tests fournissent une horloge contrôlée (compteur/valeurs fixes `1000`, `1200`, `1600`, …) →
  coalescing **déterministe et instantané**, **sans** `vi.useFakeTimers` ni attente réelle. Le
  **timer de pause** (500 ms d'inactivité → `seal()`) s'appuie sur la même horloge/ordonnanceur
  injectable, de sorte qu'un test « avance le temps » de façon déterministe pour vérifier le
  scellement par pause (TB5.3) et le nettoyage à la destruction (TB6.3). Seam exposé au montage
  (ex. injection Angular ou setter sur l'instance) — le détail de câblage émerge du TDD, la
  **signature `now: () => number` est le contrat**.
- **Isolation vis-à-vis de R1 (echo) :** comme dans le spec existant, `blocksChange` est **capté**
  dans `emitted` mais **jamais re-poussé** dans l'entrée `blocks` par le test. L'`effect` de synchro
  ne se redéclenche donc pas sur nos propres émissions → les tests Lot B ne dépendent pas de la
  garde d'echo (Lot C). *(Le (re)chargement réel se simule via `setBlocks`, cf. §7-Q3.)*

> Aucune doublure ne fige de signature au-delà du strict nécessaire ; le contrat émerge du TDD.

---

## 3. Décisions de conception à figer (impactent les assertions)

> Les décisions produit sont déjà tranchées par la SPEC (D1–D8) et l'APPROCHE (C1–C5). Les
> décisions **de test / de câblage** propres au Lot B (DB1–DB7 ci-dessous) sont **toutes figées**,
> les 4 points de cadrage ayant été arbitrés le 2026-09-20 (récapitulés en §7).

- **DB1 — Signaux publics `canUndo()`/`canRedo()`, testés via l'instance.** Le Lot B expose
  `canUndo`/`canRedo` (signaux). Les tests les lisent **directement sur `component`** (pas via le
  DOM : les boutons sont Lot D). Après chaque opération (`commit`, `onInput`, `undo`, `redo`,
  seed), `syncButtons()` recopie l'état de `EditHistory` dans les signaux. *(figé.)*

- **DB2 — `undo()/redo()` publics, `applyEntry` privé = cycle de `commit` sans push.** `undo()` et
  `redo()` sont appelés **directement** sur `component` (le clic bouton = Lot D). `applyEntry`
  **repeint**, **restaure la sélection** (`selection.setSelection`) et **émet** `blocksChange`,
  **sans** `history.push` (US5). **Assertion clé anti-boucle :** un `undo` suivi d'un `redo` doit
  ramener **exactement** au modèle post-commande **et** laisser `canRedo()=false` (aucun pas
  parasite créé par la ré-application). *(figé par APPROCHE §3.4.)*

- **DB3 — `onInput(event)` : le composant calcule `now` (horloge injectée) et `isBoundary`, délègue
  à `recordTyping` — figé (Q1/Q2).** Le template passe l'événement : `(input)="onInput($event)"`
  (**petite MOD** du HTML). `onInput` lit le **dernier caractère saisi** via `InputEvent.data` pour
  dériver `isBoundary` (séparateur espace/ponctuation, liste C3), fournit `now` via l'**horloge
  injectée** (seam `now`, cf. §2), et appelle
  `history.recordTyping({model: parse(innerHTML), selection: domToModel(editor)}, now(), isBoundary)`.
  `onInput` **ne repeint pas** (inchangé : pas de saut de curseur, R2).
  - **Compat spec existant (figé) :** un `data` **absent ou nul** (`event?.data == null`, cas du
    `T6.1` actuel qui dispatche `new Event('input')`, ou d'une suppression) est traité comme une
    **frappe non-frontière** (`isBoundary=false`) : la frappe est **enregistrée normalement**, sans
    crash. `T6.1` reste **vert sans modification**. *(figé.)*

- **DB4 — Amorçage paresseux de l'historique à la 1ʳᵉ action — figé (Q3, option (a)).** `commit`
  (et la **1ʳᵉ frappe** via `onInput`) **amorcent** l'historique quand il est **à froid** : avant
  d'empiler l'état résultant, on pose d'abord l'état **de départ de la note** (le modèle
  **précédent** l'action) comme **pas initial** (`history.reset({model: modèlePrécédent, selection:
  …})` puis `push`/`recordTyping`). Ainsi un `undo` de la **toute première** action ramène la note
  **telle qu'ouverte** (US1). Le seed « propre » **au (re)chargement** de note (dans l'`effect`,
  avec la garde anti-echo R1) reste du ressort du **Lot C** ; mais le **comportement d'amorçage à la
  1ʳᵉ action** est **testé ici** (TB1.1, TB2.1, TB3.1). *(figé.)*

- **DB5 — Émissions `blocksChange` comptées.** Une **commande** émet **une** fois (comme
  aujourd'hui) ; un `undo`/`redo` émet **une** fois le modèle restauré ; une **frappe** émet une
  fois (inchangé). Les assertions portent sur `last()` (dernier modèle émis) et, quand pertinent,
  sur le **nombre** d'émissions (`emitted.length`) pour prouver l'absence d'émission parasite.
  *(figé.)*

- **DB6 — Sélection restaurée lue via `document-selection`.** Après `undo`/`redo`, la sélection
  restaurée est vérifiée exactement comme `TCD3.4` du plan lien : `TestBed.inject(
  DocumentSelectionService).domToModel(editorEl())` **égale** la `ModelSelection` mémorisée par le
  pas. La conversion `SelectedRange {blockId,from,to} → ModelSelection {from:{blockId,offset:from},
  to:{blockId,offset:to}}` est faite par `commit` au moment de l'empilement. *(figé.)*

- **DB7 — Nettoyage du timer — figé.** Le timer de pause est enregistré dans le
  `DestroyRef.onDestroy` existant ; après `fixture.destroy()`, une échéance de timer ne doit **pas**
  rappeler `seal()` (pas d'accès à un composant détruit). L'horloge/timer étant **injecté** (Q2), le
  test avance le temps de façon déterministe et vérifie l'absence de rappel (TB6.3). *(figé.)*

---

## 4. Cas de test

> Groupes `Groupe N`, cas `TB N.k`, un comportement observable par cas, en langage métier, relié
> aux user stories. Assertions sur : signaux `canUndo()/canRedo()`, `blocksChange` (`last()`,
> `emitted.length`), **DOM re-rendu** (`editorEl().innerHTML`, `blockEl`), **sélection restaurée**
> (`domToModel`). On **n'inspecte aucun** membre privé de `EditHistory` (Lot A s'en charge).

### Groupe 1 — État initial des signaux (US2, US4)
- **TB1.1** Après `setBlocks([...])` (note chargée), **avant toute action** : `component.canUndo()`
  = `false` et `component.canRedo()` = `false` (historique **à froid**, pas encore amorcé — DB4 :
  l'amorçage n'a lieu qu'à la 1ʳᵉ action ; rien à annuler/rétablir — US2/US4).
- **TB1.2** Sur un document **vide** (`setBlocks([])`) : `canUndo()` = `canRedo()` = `false`.

### Groupe 2 — Une commande empile un pas & pilote les signaux (US1, US2)
> Toute commande passe par `commit` : on teste avec **une** commande représentative (gras) ; les
> autres (couleur/taille/liste/split/merge/paste/média/lien) partagent le même chemin `commit`.
- **TB2.1** `setBlocks([texte])`, `selectInBlock`, `applyMark('bold')` : `canUndo()` devient
  `true`, `canRedo()` reste `false` (une action annulable a eu lieu — US1/US2).
- **TB2.2** La commande **émet** `blocksChange` avec le modèle **transformé** (parité comportement
  actuel : `last()[0].marks` contient le gras) — l'ajout de l'historique **ne casse pas** l'émission.
- **TB2.3** Deux commandes successives (ex. `applyMark('bold')` puis `applyColor(c)`) : `canUndo()`
  reste `true` ; l'historique a **deux** pas annulables (vérifié en Groupe 3 par deux `undo`).
- **TB2.4** *(représentatif d'un autre point d'entrée `commit`)* une **scission** (`onKeydown
  Enter`) rend aussi `canUndo()` vrai (confirme que tous les points d'entrée `commit` empilent).

### Groupe 3 — `undo()` restaure modèle + sélection + re-render, sans ré-empiler (US1, US5)
- **TB3.1** Après une commande gras, `component.undo()` : `blocksChange` **ré-émet** le modèle
  **d'avant** la commande (`last()[0].marks` **vide**) et `editorEl().innerHTML` est **re-rendu**
  en conséquence (le `<strong>` a disparu du DOM) — cohérence affichage/modèle (US5).
- **TB3.2** Après `undo`, `canUndo()` = `false` (au fond) et `canRedo()` = `true` (US1/US4).
- **TB3.3** **Sélection restaurée (D3)** : après `undo`, `domToModel(editorEl())` égale la
  `ModelSelection` mémorisée pour l'état restauré (curseur/plage remis là où il était).
- **TB3.4** **Pas de ré-empilement (anti-boucle US5)** : après `undo`, `component.redo()` ramène
  **exactement** au modèle post-commande (`last()[0].marks` re-contient le gras) **et** laisse
  `canRedo()` = `false`, `canUndo()` = `true` — `applyEntry` n'a créé **aucun** pas parasite.
- **TB3.5** **Plusieurs undo** (Groupe 2 TB2.3) : deux `undo` successifs remontent action par action
  jusqu'à l'état initial ; un `undo` de plus est **sans effet** (`canUndo()` déjà faux, aucune
  émission supplémentaire : `emitted.length` inchangé).

### Groupe 4 — `redo()` rétablit (US3, US4)
- **TB4.1** Commande → `undo` → `redo` : `redo` **ré-applique** la commande (modèle post-commande
  ré-émis + DOM re-rendu avec le `<strong>`), `canRedo()` = `false`, `canUndo()` = `true` (US3).
- **TB4.2** **Sélection rétablie** au `redo` (D3) : `domToModel` égale la sélection du pas rétabli.
- **TB4.3** **Purge du futur par une nouvelle action (US4)** : commande A → `undo` (→ `canRedo()`
  vrai) → **commande B** : `canRedo()` **redevient** `false` et un `redo()` est **sans effet**
  (le futur a été vidé — US4). *(le mécanisme `truncateFuture` est Lot A ; ici on vérifie que le
  composant le **déclenche** via `commit`.)*

### Groupe 5 — Saisie libre alimentée dans l'historique (US1, D1/D2) — *point sensible*
> Utilise l'**horloge injectée** (seam `now`, DB3/Q2) : les tests fournissent des valeurs `now`
> contrôlées (`1000`, `1200`, `1600`, …) → coalescing **déterministe et instantané**, sans fake
> timers. Objectif (Q4) : vérifier le **branchement** (le composant fournit `now()` et `isBoundary`,
> le timer de pause scelle) **et 2–3 cas de bout en bout** représentatifs — **sans** re-tester
> l'exhaustivité des seuils (déjà couverte par le Lot A).
- **TB5.1 (une salve = un pas)** Amorcer, puis simuler **plusieurs `input` rapprochés** dans le
  même mot (même fenêtre < 500 ms, sans séparateur) : `canUndo()` = `true`, puis **un seul**
  `undo()` ré-émet le modèle **d'avant la salve** et re-rend (la salve entière retirée — US1/D1).
- **TB5.2 (frontière de mot ouvre un nouveau pas)** Simuler « mot », puis un `input` dont
  `event.data` est un **séparateur** (espace), puis « mot2 » : deux `undo` séparent « mot2 » de
  « mot + espace » (le composant a bien transmis `isBoundary=true` sur le séparateur — D1/C3).
- **TB5.3 (pause scelle via le timer)** Simuler une frappe, laisser **s'écouler la pause** (≥ 500 ms
  simulés) de sorte que le **timer** appelle `seal()`, puis une nouvelle frappe : deux `undo`
  distincts (la pause a coupé la salve — D2). `syncButtons()` est aussi rafraîchi à l'échéance.
- **TB5.4 (frappe après une commande = pas distinct)** Commande gras, puis une frappe : `undo`
  retire d'abord la frappe, un second `undo` retire la commande (la frappe scelle implicitement la
  commande précédente et ouvre un nouveau pas — D8, via `recordTyping`→`push`).
- **TB5.5 (undo pendant une salve ouverte)** Frappe(s) formant une salve **non close**, puis `undo`
  **directement** (sans attendre la pause) : `undo` ramène à l'état **d'avant la salve** (le
  `EditHistory.undo` scelle d'abord — Lot A), pas au caractère précédent — l'intégration respecte
  la granularité D1.

### Groupe 6 — Cohérence du cycle & absence d'effet de bord (US5)
- **TB6.1** `undo`/`redo` réutilisent le **même paint** que `commit` : après `undo`, `editorEl()
  .innerHTML` **égale** le rendu qu'aurait produit `commit` pour ce modèle (chaque bloc porte son
  `data-block-id`) — pas de désynchronisation DOM/modèle (US5).
- **TB6.2** `undo`/`redo` **hors de tout historique utile** (aucune action faite) sont **sans
  effet** : aucune émission `blocksChange`, aucun changement de DOM, aucune exception (robustesse).
- **TB6.3** L'horloge/timer étant **injecté** (DB3/DB7), un test arme une salve puis `fixture.
  destroy()` : l'échéance d'un timer de pause en attente **ne rappelle pas** `seal()`/`syncButtons()`
  (timer nettoyé au `DestroyRef`), aucune exception (« composant détruit »).

### Groupe 7 — Frontière avec Lot C (documentée, **non testée à fond ici**)
> **Ne pas** tester la garde d'echo R1 dans ce lot (test d'intégration dédié = Lot C). On **note**
> seulement l'hypothèse d'isolation (le parent de test ne re-pousse pas `blocksChange` dans
> `blocks`) et le point de seed DB4. Le comportement « (re)chargement d'une note **réinitialise**
> l'historique (les deux boutons repartent inactifs) » et « l'echo de notre propre `emit` ne
> réinitialise **pas** » relève de [`PLAN_TESTS_...` Lot C] — **à écrire séparément**.

---

## 5. Contrat DOM / API (ciblés par les tests)

> Le Lot B teste surtout l'**API du composant** (les boutons `.btn-undo`/`.btn-redo` sont **Lot D**).
> Le contrat DOM se limite à ce qui est déjà honoré + la petite MOD du binding `input`.

| Cible | Type | Rôle / attendu au Lot B |
|---|---|---|
| `component.canUndo()` | signal `boolean` (public) | vrai s'il existe un passé annulable (pilote `.btn-undo` en Lot D). |
| `component.canRedo()` | signal `boolean` (public) | vrai s'il existe un futur rétablissable (pilote `.btn-redo`). |
| `component.undo()` | méthode publique | dépile→`applyEntry` (re-render + setSelection + emit), sans ré-empiler ; puis `syncButtons()`. |
| `component.redo()` | méthode publique | symétrique. |
| `.editor-content` | `contenteditable` | `(input)="onInput($event)"` — **MOD** : le handler reçoit l'`InputEvent` (lecture `data` pour la frontière). Réutilisé pour paint/selection. |
| `.editor-content [data-block-id]` | DOM re-rendu | après `undo`/`redo`, reflète **exactement** le modèle restauré (paint via `document-render`, `withBlockIds:true`). |
| *(hors lot D)* `.btn-undo` / `.btn-redo` | boutons barre | **non** testés ici : `[disabled]="!canUndo()"`, `(mousedown) preventDefault`, `(click)="undo()/redo()"` → **Lot D**. |

**Imports de types (tests) :** `NoteBlock`, `TextBlock` depuis `core/models/document.model` ;
`ModelSelection`, `DocumentSelectionService` depuis `core/services/document-selection` ;
`EditHistory` depuis `core/services/edit-history` ; le seam d'horloge (`now: () => number`) est
fourni au composant par les tests (valeurs `now` contrôlées, §2/DB3).

---

## 6. Ordre d'implémentation TDD suggéré (rouge → vert → refactor)

1. **Groupe 1** — signaux initiaux `canUndo/canRedo` + `syncButtons` (socle d'état).
2. **Groupe 2** — `commit` empile un pas (dépend du seed DB4 tranché).
3. **Groupe 3** — `undo` + `applyEntry` (re-render + selection + emit, anti-boucle).
4. **Groupe 4** — `redo` + purge du futur.
5. **Groupe 5** — frappe/coalescing (horloge injectée, §7-Q2) — la partie la plus subtile.
6. **Groupe 6** — cohérence du cycle + nettoyage timer.

> Rappel builder : ajouter l'**API minimale** (`canUndo`/`canRedo` signaux, `undo`/`redo`,
> `onInput($event)`) au composant **avant** d'écrire le spec, sinon `TS` casse toutes les suites.

---

## 7. Arbitrages figés (arbitrage utilisateur du 2026-09-20)

> Les 4 points de cadrage sont **tranchés**. Le plan est **sans ambiguïté**, prêt pour `ecrire_tests`.
> Ils structurent les décisions de test DB1–DB7 (§3) et les cas TB1–TB6 (§4).

- **Q1 — Frappe & frontière de mot → FIGÉ.** Template `(input)="onInput($event)"` ; le handler lit
  `InputEvent.data` (dernier caractère saisi) et le teste contre la liste C3
  (espace/tab/ponctuation) pour dériver `isBoundary`. Un `data` **absent ou nul** = **frappe
  non-frontière** (`isBoundary=false`), enregistrée **normalement sans crash** → le `T6.1` existant
  (dispatch `new Event('input')` sans `.data`) **reste vert sans modification**. *(fige DB3, TB5.2,
  la MOD du template.)* ✅

- **Q2 — Coalescing temporel → FIGÉ : horloge injectée.** Seam `now: () => number` (défaut
  `Date.now`) sur le composant, **cohérent avec l'injection de `now` du Lot A** ; le timer de pause
  s'appuie sur la même horloge/ordonnanceur injectable. Les tests fournissent des `now` contrôlés →
  coalescing **déterministe et instantané**, **sans** `vi.useFakeTimers`. *(fige DB3/DB7, tout le
  Groupe 5, TB6.3.)* ✅

- **Q3 — Amorçage de l'historique → FIGÉ : option (a), amorçage paresseux.** `commit` **et** la 1ʳᵉ
  frappe (`onInput`) **amorcent** l'historique à froid en posant d'abord l'état **de départ** de la
  note (pas initial) avant d'empiler l'action → `undo` de la **toute première** action ramène la
  note **telle qu'ouverte**. Lot B **autonome et testable seul** ; le seed « propre » au
  (re)chargement + la garde anti-echo R1 restent **Lot C**. *(fige DB4, TB1.1, TB2.1, TB3.1.)* ✅

- **Q4 — Re-test du coalescing au niveau composant → FIGÉ : branchement + 2–3 cas de bout en bout.**
  On vérifie le **branchement** (le composant transmet `now()`/`isBoundary` à `recordTyping`, le
  timer scelle) **et 2–3 cas observables** en boîte noire (TB5.1 salve = 1 pas, TB5.2 frontière,
  TB5.3 pause). L'exhaustivité fine des seuils (500 ms strict, FIFO ~100) **reste couverte par le
  Lot A**, non dupliquée ici. *(fige la portée du Groupe 5.)* ✅

---

## Fichiers concernés

- **Sous test / à étendre :**
  `frontend/src/app/rich-text-editor/rich-text-editor.spec.ts` (nouveaux groupes Undo/Redo Lot B).
- **Implémentation (hors de ce plan, par la suite) :**
  `frontend/src/app/rich-text-editor/rich-text-editor.ts` (câblage `commit`/`onInput`/`undo`/`redo`/
  `applyEntry`/`syncButtons`/timer + seam d'horloge selon Q2), `rich-text-editor.html`
  (`(input)="onInput($event)"`).
- **Réutilisés (inchangés) :** `frontend/src/app/core/services/edit-history.ts` (Lot A, vert),
  `document-selection.ts` (`ModelSelection`, `setSelection`, `domToModel`),
  `document.model.ts` (`DocModel`, `NoteBlock`, `TextBlock`).
- **Lots suivants (hors périmètre) :** Lot C (`effect` + garde d'echo R1 + reset par note),
  Lot D (`.btn-undo`/`.btn-redo` + `[disabled]` + CSS).
