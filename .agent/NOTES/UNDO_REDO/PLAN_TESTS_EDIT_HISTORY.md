# Plan de Test (TDD) — `EditHistory` (cœur d'historique undo/redo, pur, sans DOM)

**Statut :** validé le 2026-09-20 *(6 résolutions D1–D8 arbitrées par l'utilisateur — voir §3 et §7)*

> **Approche :** boîte noire / TDD. Ce plan décrit le **comportement observable attendu**
> **avant** toute implémentation. Il couvre **uniquement le Lot A** de la fonctionnalité
> Undo/Redo : la classe **pure** `EditHistory` (pile passé/futur + coalescing de frappe +
> bornage), **sans aucune dépendance Angular/DOM**. Les Lots B (câblage `RichTextEditor`),
> C (reset par note + garde d'echo) et D (boutons de barre) auront **leurs propres** plans.
>
> **SPEC de référence :** [`FEATURE_UNDO_REDO.md`](FEATURE_UNDO_REDO.md)
> (US1→US6, décisions D1–D8 figées le 2026-09-20).
> **Approche de dev :** [`APPROCHE_UNDO_REDO.md`](APPROCHE_UNDO_REDO.md)
> (choix C1–C5 figés, **Lot A** décrit §3 + conception `EditHistory` §1).
>
> **Jumeaux existants (conventions de spec de service pur) :**
> [`../PLAN_TESTS_SELECTION_ANALYSIS_SERVICE.md`](../PLAN_TESTS_SELECTION_ANALYSIS_SERVICE.md),
> et les specs `core/services/document-model.spec.ts`, `document-selection.spec.ts`.
>
> ⚠️ **Rappel builder :** `@angular/build:unit-test` (Vitest) **compile tout le bundle en une
> passe**. Pour une **nouvelle** classe `EditHistory` (`core/services/edit-history.ts`), créer
> le **squelette minimal** (méthodes qui `throw`) **avant** d'écrire le `.spec.ts`, puis
> rouge → vert → refactor. (Aucune exécution de test à cette étape — c'est un plan.)

---

## 1. Objet testé

La classe **pure** `EditHistory` (futur `core/services/edit-history.ts`, **NEW**), instanciée
**une par éditeur** (C1) — **pas** `providedIn:'root'`. Elle porte la logique d'historique
d'édition du **corps** de la note (le `DocModel`), **testable en isolation** sans `contenteditable`.

**API prévue** (approche §1 + §3 Lot A) :

| Membre | Rôle |
|---|---|
| `reset(entry)` | (ré)amorce l'historique sur un pas initial (rechargement de note, D7). |
| `push(entry)` | empile **une commande discrète** (marque, taille, liste, split/merge, média, lien). |
| `recordTyping(entry, now[, isBoundary])` | enregistre **une frappe** avec coalescing (D1/C3). |
| `undo()` | dépile vers le passé → renvoie le `HistoryEntry` à ré-appliquer, ou `null`. |
| `redo()` | re-dépile vers le futur → renvoie le `HistoryEntry`, ou `null`. |
| `canUndo()` | vrai s'il existe un passé (`index > 0`). |
| `canRedo()` | vrai s'il existe un futur (`index < entries.length - 1`). |
| `seal()` | ferme la salve de frappe en cours (la prochaine frappe ouvrira un nouveau pas). |
| `truncateFuture()` | supprime le futur (toute nouvelle action invalide le redo — US4). |
| `enforceLimit()` | éjecte les pas les plus anciens au-delà de la borne (~100, D6). |

**Types (à créer) :**
```
HistoryEntry = { model: DocModel, selection: ModelSelection | null }
TypingRun    = { lastEditAt: number, open: boolean }   // interne au coalescing
constante    = TYPING_COALESCE_PAUSE_MS = 500           // C3, figée (pas une fourchette)
```
- `DocModel` = `NoteBlock[]` **immuable**, importé de `core/models/document.model.ts`.
- `ModelSelection { from: ModelPoint, to: ModelPoint }`, importé de
  `core/services/document-selection.ts` (déjà existant).

**Invariants** (approche §3) : une fois amorcé, `0 <= index < entries.length` ;
`entries[index]` = **état courant** ; `canUndo = index > 0` ; `canRedo = index < length - 1`.

### Périmètre validé (Lot A)

- Empilement d'**un pas par commande** via `push`, et `canUndo/canRedo` corrects (US1/US2/US3/US4).
- **Coalescing de la saisie** via `recordTyping` : regroupement tant que `< 500 ms` **et** même
  mot ; **nouveau pas** sur pause `≥ 500 ms` **ou** frontière de mot (espace/ponctuation) (D1/C3).
- `undo`/`redo` **renvoient l'entrée** (`{model, selection}`) à ré-appliquer — modèle **et**
  sélection mémorisés par pas (D3). *(La ré-application DOM elle-même = Lot B, hors périmètre.)*
- **Bornage ~100 pas** (D6) : au-delà, éjection FIFO des plus anciens sans casser l'index courant.
- **Troncature du futur** : une commande (ou une frappe ouvrant un nouveau pas) **après un undo**
  rend le redo impossible (US4).
- `reset` **vide** l'historique (passé + futur) → `canUndo`/`canRedo` = `false` (US2/US4/US6).

### Hors périmètre (rappel SPEC + APPROCHE §3/§5)

- **Câblage `RichTextEditor`** : `commit`/`onInput`/`applyEntry`/`syncButtons`, conversion
  `SelectedRange → ModelSelection`, timer de pause (`armPauseTimer`) → **Lot B**.
- **Reset par note + garde d'echo** (`incoming === model()`, `effect`) → **Lot C** (test
  d'intégration R1). `EditHistory.reset` est testé ici **isolément**, pas son déclenchement.
- **Boutons de barre** (`[disabled]`, `.btn-undo`/`.btn-redo`, CSS) → **Lot D**.
- **Détection réelle de la frontière de mot** dans le DOM/`InputEvent` : hors périmètre ; ici la
  frontière est **fournie en entrée** à `recordTyping` (voir D5) pour garder la classe sans DOM.
- Restauration effective de la sélection dans le `contenteditable`, re-render, `blocksChange.emit`
  → Lot B (cycle `applyEntry`). Ici on vérifie seulement que l'entrée **renvoyée** porte la bonne
  paire `{model, selection}`.
- IME / collage / glisser-déposer, undo natif navigateur (L1), persistance (D7/H1).

---

## 2. Dépendances (abstraites) & doublures de test

- **Aucune doublure, aucun DOM.** `EditHistory` est **100 % pure** ; on l'instancie directement
  (`new EditHistory()`), exactement comme `DocumentModelService` dans `document-model.spec.ts:10`.
- **Horloge injectée par paramètre** (D4) : `recordTyping(entry, now, …)` reçoit le temps `now`
  (millisecondes) en **argument explicite**. Les tests passent des valeurs `now` contrôlées
  (`1000`, `1400`, `1600`, …) → **pas** de `vi.useFakeTimers`, pas d'attente réelle, aucune
  horloge globale à espionner. Le coalescing devient **déterministe et instantané** à tester.
- **Fixtures modèle** : de **faux `DocModel`** minimalistes suffisent — un `HistoryEntry` est une
  simple paire `{model, selection}` que `EditHistory` **transporte sans l'interpréter**. On peut
  donc utiliser des blocs texte réduits (`[{ id, kind:'text', text, marks:[] }]`) ou même des
  références distinctes servant de **sentinelles d'identité** (voir D7). Aucune algèbre
  `document-model` n'est exercée ici.
- **Sélections fixtures** : `ModelSelection` littéraux
  (`{ from:{blockId,offset}, to:{blockId,offset} }`) ou `null`.

> Aucune doublure ne fige de signature au-delà du strict nécessaire : le contrat émerge du TDD.

---

## 3. Décisions de conception figées (impactent les assertions)

> **Toutes tranchées** (arbitrage utilisateur du 2026-09-20). Elles structurent les assertions du
> §4 et le contrat d'API du §5. Récapitulées en §7.

- **D1 — Signature de `recordTyping` (frontière de mot).** `recordTyping(entry: HistoryEntry, now:
  number, isBoundary = false)` — la frontière de mot est un **3ᵉ argument booléen optionnel** ; le
  composant (seul à connaître le caractère saisi) le calcule et le transmet, la classe reste **sans
  DOM ni logique texte**. *(figé.)*

- **D2 — Seuil de coalescing (pause).** Une pause **`≥ 500 ms` scelle** le pas : la condition
  d'ouverture d'un nouveau pas est `now - run.lastEditAt >= TYPING_COALESCE_PAUSE_MS`. **Δ = 500 ms
  pile → nouveau pas** ; `Δ = 499 ms → regroupé`. *(figé.)*

- **D3 — Bornage : limite injectable, 100 strict, FIFO.** Constructeur
  `new EditHistory(limit = 100)`. L'historique conserve **au plus `limit` entrées** ; à la
  `limit + 1`ᵉ poussée, la **plus ancienne** est éjectée (`entries.shift()` + `index--`). Les tests
  du Groupe 5 **injectent une petite limite** (ex. `new EditHistory(3)`) pour éviter d'empiler 101
  pas. *(figé.)*

- **D4 — Visibilité.** `seal()` est **public** (requis par Lot B `onInput`) et **testé
  directement** (Groupe 4). `truncateFuture()` et `enforceLimit()` sont **internes** (non exportés),
  couverts **uniquement via le comportement observable** de `push`/`recordTyping` (Groupes 3 et 5) —
  jamais appelés depuis les tests. *(figé.)*

- **D5 — Sémantique de la frontière de mot dans la salve (C3).** Quand `isBoundary = true`, le
  caractère séparateur **étend d'abord le pas courant** (`entries[index] = entry`, valeur incluant
  l'espace/ponctuation) **puis scelle** (`run.open = false`). Donc « **mot + espace** » = **un seul**
  pas ; le **caractère non-séparateur suivant ouvre un nouveau** pas (même à Δ < 500 ms). *(figé.)*

- **D6 — Construction vide, `push` toléré à froid.** `EditHistory` se construit **vide** :
  `canUndo()` = `canRedo()` = `false` à la construction (sans `reset` préalable). Un premier
  `push`/`recordTyping` **sans `reset`** est **toléré** et amorce l'historique de façon cohérente
  (le premier pas devient l'état courant). `undo()`/`redo()` sur pile vide → `null`. *(figé.)*

- **D7 — Snapshot = référence, pas de clone (C2).** L'entrée mémorise la **référence** du `DocModel`
  (immuable) — **aucun deep-copy**. **Assertion clé :** `undo()`/`redo()` renvoient une entrée dont
  `.model` est **la référence identique** (`toBe`, pas seulement `toEqual`) à celle poussée. *(figé
  par C2.)*

- **D8 — `recordTyping` ré-utilise `push` pour ouvrir un pas.** Ouvrir une **nouvelle** salve appelle
  `push(entry)` (scelle l'ancien run, tronque le futur, borne) ; **prolonger** la salve fait
  `entries[index] = entry` (remplace **en place**, sans nouveau pas ni troncature). *(figé par
  l'algorithme §3.)*

---

## 4. Cas de test

> Groupes numérotés (`Groupe N`), cas `T N.k`. Un comportement observable par cas, en langage
> métier, relié aux user stories. `EditHistory` étant pure, les assertions portent sur les
> **valeurs de retour** (`undo`/`redo`/`canUndo`/`canRedo`) et les **transitions d'état** visibles
> à travers l'API — jamais sur des membres privés.

### Groupe 1 — Amorçage & `reset` (US2, US4, US6, D7/C4)
- **T1.1** À la **construction** (`new EditHistory()`), avant tout amorçage : `canUndo()` = `false`
  et `canRedo()` = `false` (D6).
- **T1.2** `reset(entry0)` pose un **pas initial** : `canUndo()` = `false`, `canRedo()` = `false`
  (passé **et** futur vides — US2/US4/US6).
- **T1.3** Après quelques `push`, un nouvel appel `reset(entryN)` **repurge tout** : `canUndo()` et
  `canRedo()` reviennent `false`, et un `undo()` immédiat renvoie `null` (l'historique est reparti
  de zéro — D7).
- **T1.4** `undo()`/`redo()` juste après `reset` (aucune action) → `null` chacun (no-op).

### Groupe 2 — Empilement d'une commande & disponibilité undo/redo (US1, US2, US3, US4)
- **T2.1** Après `reset(e0)` puis `push(e1)` : `canUndo()` = `true`, `canRedo()` = `false` (US1/US2).
- **T2.2** `undo()` renvoie l'entrée **précédente** `e0` ; ensuite `canUndo()` = `false` (au fond de
  la pile) et `canRedo()` = `true` (US1/US3).
- **T2.3** `redo()` après ce `undo` renvoie **`e1`** et rebranche `canUndo()` = `true`,
  `canRedo()` = `false` (US3).
- **T2.4** Trois commandes `push(e1..e3)` puis **trois** `undo` successifs renvoient `e2`, `e1`,
  `e0` dans cet ordre, puis un `undo` supplémentaire renvoie `null` (remontée action par action
  jusqu'à l'état initial — US1).
- **T2.5** Symétrique : après avoir remonté, **trois** `redo` renvoient `e1`, `e2`, `e3`, puis un
  `redo` de plus renvoie `null` (US3).
- **T2.6** **Identité du snapshot (D7/C2)** : l'entrée renvoyée par `undo()`/`redo()` est la
  **référence identique** (`toBe`) à celle passée à `push`/`reset` — modèle non cloné.
- **T2.7** **Sélection mémorisée (D3)** : `push({model, selection:S})` puis `undo`/`redo` restituent
  une entrée dont `.selection` est **exactement** `S` (y compris `null` quand aucune sélection).

### Groupe 3 — Troncature du futur (US4)
- **T3.1** `reset(e0)`, `push(e1)`, `push(e2)`, `undo()` (→ `canRedo` = `true`), puis `push(e3)` :
  `canRedo()` **redevient `false`** et un `redo()` renvoie `null` (une nouvelle commande vide le
  redo — US4).
- **T3.2** Après T3.1, `undo()` renvoie **`e1`** (et non `e2`) : `e3` a bien **remplacé** la branche
  future à partir du point courant (la pile est `e0, e1, e3`).
- **T3.3** **Frappe après undo** : `reset(e0)`, `push(e1)`, `undo()`, puis
  `recordTyping(eT, now, false)` (ouverture d'une salve) **tronque aussi le futur** → `canRedo()` =
  `false` (la frappe qui ouvre un pas invalide le redo, comme une commande — US4/D8).

### Groupe 4 — Coalescing de la saisie libre (D1, C3) — *cœur du Lot A*
> Le temps est **injecté** (`now`) ; les frontières de mot via `isBoundary` (D1/D5). Aucune attente
> réelle. Pas de repère ⇒ « un pas » se **mesure** par le nombre d'`undo` nécessaires pour revenir
> à `e0`.
- **T4.1 (regroupement < 500 ms, même mot)** `reset(e0)` ; `recordTyping(eA, 1000, false)`,
  `recordTyping(eB, 1200, false)`, `recordTyping(eC, 1400, false)` (frappes rapprochées, sans
  frontière) → **un seul** pas : `canUndo()` = `true` et **un** `undo()` ramène à `e0`
  (`canUndo()` = `false`). L'entrée courante avant undo porte le **dernier** snapshot `eC`
  (le pas est *étendu en place*, D8).
- **T4.2 (pause ≥ 500 ms scelle)** `recordTyping(eA, 1000, false)` puis `recordTyping(eB, 1600,
  false)` (Δ = 600 ms ≥ `TYPING_COALESCE_PAUSE_MS`) → **deux** pas : `undo()` renvoie une entrée
  `eA`, un second `undo()` ramène à `e0`.
- **T4.3 (seuil exact 500 ms = nouveau pas — D2)** `Δ = 500 ms` **pile** scelle : `recordTyping(eA,
  1000, false)` puis `recordTyping(eB, 1500, false)` (Δ = 500) → **deux** pas (borne **inclusive**,
  `now - lastEditAt >= 500`). Contrôle jumeau : `Δ = 499 ms` (`recordTyping(eB, 1499, false)`)
  **regroupe** → **un seul** pas.
- **T4.4 (frontière de mot scelle — D5)** `recordTyping(eMot, 1000, false)` puis
  `recordTyping(eEspace, 1100, true)` (espace, `isBoundary=true`, dans les 500 ms) : le séparateur
  **étend puis scelle** le pas courant ; la frappe suivante `recordTyping(eMot2, 1150, false)`
  ouvre un **nouveau** pas. Résultat : **deux** pas → deux `undo` pour revenir à `e0`, le premier
  `undo` renvoyant l'entrée « mot + espace » (`eEspace`).
- **T4.5 (frontière puis pas suivant même si < 500 ms)** Après un séparateur (`isBoundary=true`,
  `run.open=false`), la frappe suivante ouvre un nouveau pas **même à Δ < 500 ms** (la frontière
  prime sur le délai — C3).
- **T4.6 (première frappe après une commande)** `push(e1)` (commande) puis
  `recordTyping(eT, now, false)` : la frappe **scelle implicitement** et ouvre un **nouveau** pas
  distinct de la commande → deux `undo` séparent la frappe de la commande.
- **T4.7 (`seal()` explicite — D4)** `recordTyping(eA, 1000, false)`, `seal()`, puis
  `recordTyping(eB, 1100, false)` (Δ < 500 ms) → **deux** pas malgré le délai court : `seal()`
  ferme la salve, la frappe suivante ouvre un nouveau pas (sert le timer de pause du Lot B).
- **T4.8 (`undo` scelle la salve — approche §3)** Une salve ouverte (`recordTyping` sans frontière),
  puis `undo()` directement : `undo` appelle `seal()` d'abord, la salve **compte comme un pas
  entier** — l'`undo` ramène à l'état d'avant la salve (`e0`), pas au caractère précédent (D1).

### Groupe 5 — Bornage ~100 pas (US6, D6/D2)
> Utilise une **limite réduite injectable** si D3 le permet (ex. `new EditHistory(3)`) ; sinon,
> boucle de `limit + 1` push réels.
- **T5.1 (éjection FIFO au-delà de la borne)** Avec `limit = N`, `reset(e0)` puis `push` de `N`
  commandes de plus (total `N+1` entrées) → la **plus ancienne** (`e0`) est **éjectée** : le nombre
  maximal d'`undo` consécutifs plafonne à `N`, et remonter tout en haut ne redonne **jamais** `e0`.
- **T5.2 (l'index courant reste valide)** Après dépassement, `canRedo()` = `false` immédiatement
  après un `push` (on est au sommet), et l'entrée courante renvoyée par un `undo` est bien
  l'avant-dernière poussée (l'éjection FIFO ne décale pas le « présent »).
- **T5.3 (bornage pendant une salve de frappe)** `recordTyping` répété ouvrant plusieurs pas (via
  frontières/pauses) au-delà de la borne éjecte aussi les plus anciens, sans corrompre `canUndo()`.
  *(porté par l'appel interne `push` de `recordTyping` — D8.)*

### Groupe 6 — Cas limites & robustesse
- **T6.1** `undo()` sur historique **au fond** (déjà à `index = 0`) → `null`, `canUndo()` reste
  `false`, aucune exception.
- **T6.2** `redo()` sur historique **au sommet** (aucun futur) → `null`, `canRedo()` reste `false`.
- **T6.3** `seal()` appelé **sans salve ouverte** (`run == null`) → **no-op**, aucune exception,
  `canUndo`/`canRedo` inchangés (D4).
- **T6.4** **État à froid (D6)** : sur un `new EditHistory()` **sans `reset`**, `canUndo()` =
  `canRedo()` = `false`. Un premier `push(e1)` **à froid** est toléré et amorce l'historique de
  façon cohérente ; puisque `e1` devient le **seul** pas (aucun état antérieur mémorisé),
  `canUndo()` reste `false` et `undo()` renvoie `null`. *(Le passé n'apparaît qu'au 2ᵉ pas, ou
  après un `reset(e0)` initial qui fournit l'état de départ — cf. Groupe 2.)*
- **T6.5** `selection = null` transportée intacte : `undo`/`redo` renvoient `.selection === null`
  sans lever (frappe hors sélection résolue — cas accepté, approche §3 Lot B).

---

## 5. Contrat d'API (au lieu d'un « Contrat DOM »)

> `EditHistory` étant **pure et sans DOM**, la section « Contrat DOM » du gabarit **ne s'applique
> pas**. On fige à la place le **contrat d'API** que l'implémentation devra honorer (les tests s'y
> appuient) — signatures **minimales**, le détail émerge du TDD.

| Membre | Signature figée | Testé par |
|---|---|---|
| constructeur | `new EditHistory(limit = 100)` — limite injectable, défaut 100 (D3) | Groupe 5 |
| `reset` | `reset(entry: HistoryEntry): void` | Groupe 1 |
| `push` | `push(entry: HistoryEntry): void` | Groupes 2, 3, 5 |
| `recordTyping` | `recordTyping(entry, now: number, isBoundary = false): void` (D1) | Groupe 4 |
| `undo` | `undo(): HistoryEntry \| null` | Groupes 2, 3, 6 |
| `redo` | `redo(): HistoryEntry \| null` | Groupes 2, 3, 6 |
| `canUndo` | `canUndo(): boolean` | Groupes 1–5 |
| `canRedo` | `canRedo(): boolean` | Groupes 1–5 |
| `seal` | `seal(): void` *(publique — D4)* | Groupe 4 (T4.7), 6 (T6.3) |
| `truncateFuture` | interne — **non appelé** par les tests (couvert via `push`) *(D4)* | Groupe 3 |
| `enforceLimit` | interne — **non appelé** par les tests (couvert via `push`) *(D4)* | Groupe 5 |
| `HistoryEntry` | `{ model: DocModel; selection: ModelSelection \| null }` | tous |
| `TypingRun` | `{ lastEditAt: number; open: boolean }` (interne) | via Groupe 4 |
| `TYPING_COALESCE_PAUSE_MS` | `= 500` (constante nommée exportée) | Groupe 4 (T4.2/T4.3) |

**Imports de types** : `DocModel`, `NoteBlock` depuis `../models/document.model` ;
`ModelSelection`, `ModelPoint` depuis `./document-selection`.

---

## 6. Ordre d'implémentation TDD suggéré (rouge → vert → refactor)

1. **Groupe 1** — amorçage/`reset` + `canUndo`/`canRedo` neutres (socle de l'état).
2. **Groupe 2** — `push` + `undo`/`redo` + disponibilité (le cœur pile passé/futur).
3. **Groupe 3** — troncature du futur (US4) — dépend de 2.
4. **Groupe 4** — coalescing `recordTyping` + `seal` (D1/C3) — la partie la plus subtile.
5. **Groupe 5** — bornage `enforceLimit` (D6) — dépend de 2.
6. **Groupe 6** — cas limites/robustesse — transverse, en dernier.

---

## 7. Décisions figées (récapitulatif — arbitrage utilisateur du 2026-09-20)

> Les 6 points de cadrage sont **tranchés**. Le plan est **sans ambiguïté**, prêt pour `ecrire_tests`.

1. **D1 — signature `recordTyping`** : `recordTyping(entry, now, isBoundary = false)` — frontière de
   mot en **3ᵉ paramètre booléen optionnel**. ✅
2. **D2 — seuil de coalescing** : une pause **`≥ 500 ms` scelle** (Δ = 500 ms pile → nouveau pas ;
   inégalité **inclusive**). Fige T4.2/T4.3. ✅
3. **D3 — bornage** : **limite injectable au constructeur** (`new EditHistory(limit = 100)`), **100
   strict**, éjection **FIFO** du plus ancien pas ; Groupe 5 injecte une **petite limite** (ex. 3). ✅
4. **D4 — visibilité** : `seal()` **public** et testé directement ; `truncateFuture`/`enforceLimit`
   **internes**, couverts uniquement via le comportement observable. ✅
5. **D5 — frontière de mot (T4.4)** : le séparateur **étend puis scelle** le pas courant
   (« mot + espace » = **1 seul** pas) ; le caractère non-séparateur suivant ouvre un nouveau pas. ✅
6. **D6 — état à froid (T6.4)** : `EditHistory` se construit **vide** (`canUndo` = `false`) et
   **tolère** un premier `push`/`recordTyping` sans `reset` préalable. ✅

---

## Fichiers concernés

- **À créer (implémentation, hors de ce plan) :** `frontend/src/app/core/services/edit-history.ts`
  (squelette minimal `throw` **avant** le spec — rappel builder).
- **À créer (tests, par `ecrire_tests` après validation) :**
  `frontend/src/app/core/services/edit-history.spec.ts`.
- **Types réutilisés (inchangés) :** `frontend/src/app/core/models/document.model.ts`
  (`DocModel`, `NoteBlock`), `frontend/src/app/core/services/document-selection.ts`
  (`ModelSelection`, `ModelPoint`).
- **Lots suivants (hors périmètre) :** `rich-text-editor.ts` / `.html` / `.css` (Lots B, C, D).
