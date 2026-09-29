# Plan de Test (TDD) — Undo/Redo dans `RichTextEditor` (Lot D — les deux boutons de la barre)

**Statut :** **validé le 2026-09-20** *(rédigé le 2026-09-20 ; décisions de test DD1–DD8 **figées**
§3 — arbitrage utilisateur du 2026-09-20 ; cas TD1–TD5 §4 sans ambiguïté, prêts pour `ecrire_tests`).* 

> **Approche :** boîte noire / TDD. Ce plan décrit le **comportement observable** du **Lot D** de la
> fonctionnalité Undo/Redo : l'ajout des **deux boutons** « Annuler » ↶ et « Rétablir » ↷ dans la
> barre de mise en forme (`.format-toolbar`) et leur **pilotage par les signaux** `canUndo()` /
> `canRedo()` déjà exposés par le composant (Lots B/C, livrés et verts). On monte le **vrai**
> composant (services `document-*` réels, comme le spec existant), on interroge le **markup** des
> boutons (présence, `title`/`aria-label`, icône, appartenance à un `toolbar-group` dédié), on
> observe l'attribut natif **`disabled`** qui reflète `!canUndo()` / `!canRedo()`, et on vérifie que
> le **clic** d'un bouton actif **pilote** `undo()` / `redo()` (et qu'un bouton inactif ne déclenche
> rien).
>
> **SPEC de référence :** [`FEATURE_UNDO_REDO.md`](FEATURE_UNDO_REDO.md) — **US1** (bouton annuler),
> **US2** (undo inactif tant qu'il n'y a rien à annuler), **US3** (bouton rétablir), **US4** (redo
> inactif tant qu'on n'a rien annulé), décision **D8** (deux boutons dans la barre, état
> actif/inactif).
> **Approche de dev :** [`APPROCHE_UNDO_REDO.md`](APPROCHE_UNDO_REDO.md) — décision **C5** (état
> inactif = `[disabled]` **natif**, distinct du `.active` des bascules ; `(mousedown)="$event.
> preventDefault()"` pour ne pas voler le focus) et **Lot D au §3** (markup proposé : un
> `toolbar-group` en tête, boutons `.btn-undo`/`.btn-redo`, `[disabled]="!canUndo()"`/
> `[disabled]="!canRedo()"`, `(click)="undo()"`/`(click)="redo()"`, `title`+`aria-label`, icônes
> ↶/↷, CSS `:disabled`).
>
> **Jumeaux existants (conventions à suivre) :**
> - **Spec du composant :** [`../../frontend/src/app/rich-text-editor/rich-text-editor.spec.ts`](../../frontend/src/app/rich-text-editor/rich-text-editor.spec.ts)
>   — montage `TestBed`, host attaché à `document.body`, helpers `setBlocks`/`selectInBlock`/`editorEl`/
>   `blockEl`/`last()`, capture `emitted`, doublure `ExternalLinkService`. **Modèle de test de bouton de
>   barre :** cas `TCD1.1` (présence `.btn-link` + `title`/`aria-label`) et `TCD1.2` (clic ouvre la
>   barre). Blocs `Undo/Redo (Lot B)` et `(Lot C)` **déjà verts** (signaux `canUndo()/canRedo()`,
>   `undo()`/`redo()`).
> - **Plans frères Undo/Redo :** [`PLAN_TESTS_RTE_UNDO_REDO.md`](PLAN_TESTS_RTE_UNDO_REDO.md) (Lot B —
>   §5 « Contrat DOM/API » renvoie explicitement les boutons `.btn-undo`/`.btn-redo` au **Lot D**) et
>   [`PLAN_TESTS_RTE_RELOAD_GUARD.md`](PLAN_TESTS_RTE_RELOAD_GUARD.md) (Lot C).
> - **Style « Contrat DOM » sur des boutons de barre :**
>   [`../URL_LINK/PLAN_TESTS_INSERTION_LIEN.md`](../URL_LINK/PLAN_TESTS_INSERTION_LIEN.md) et
>   [`../PLAN_TESTS_FORMAT_TOOLBAR.md`](../PLAN_TESTS_FORMAT_TOOLBAR.md).
>
> ⚠️ **Rappel builder** (mémoire projet) : `@angular/build:unit-test` (Vitest) compile **tout le
> bundle en une passe**. Le Lot D **n'ajoute aucune API** au composant (`canUndo/canRedo` signaux,
> `undo()/redo()` méthodes **existent déjà** — Lot B/C) : il ne **modifie que le template `.html`**
> (+ un peu de CSS). Il n'y a donc **pas** de risque `TS2339/TS2554` : les nouveaux cas ciblent des
> **sélecteurs DOM** et peuvent être écrits directement (rouge d'assertions sur du markup absent, pas
> de rouge de compilation). *(Aucune exécution ici — plan.)*

---

## 1. Objet testé

Le **markup des deux boutons** undo/redo dans `rich-text-editor.html` et leur **câblage
déclaratif** aux signaux/méthodes déjà livrés par le composant :

| Élément (template `.html`) | Statut | Rôle testé au Lot D |
|---|---|---|
| `<button class="btn-undo">` | NEW | présence, `title`/`aria-label` « Annuler », icône ↶, dans un `toolbar-group` dédié. |
| `<button class="btn-redo">` | NEW | présence, `title`/`aria-label` « Rétablir », icône ↷. |
| `[disabled]="!canUndo()"` sur `.btn-undo` | NEW | l'attribut natif `disabled` reflète l'absence de passé (US2). |
| `[disabled]="!canRedo()"` sur `.btn-redo` | NEW | l'attribut natif `disabled` reflète l'absence de futur (US4). |
| `(click)="undo()"` / `(click)="redo()"` | NEW | le clic d'un bouton **actif** pilote la méthode (US1/US3). |
| `(mousedown)="$event.preventDefault()"` | NEW | ne vole pas le focus de l'éditeur (C5, comme les autres boutons). |
| `toolbar-group` dédié (placement) | NEW | groupe des deux boutons, **en tête** de barre (H2/D8). |

**L'algèbre d'historique (Lot A), le câblage `commit`/`onInput`/`undo`/`redo`/`applyEntry`/signaux
(Lot B) et la garde d'echo/reset (Lot C) sont déjà testés et verts et ne sont PAS re-testés ici.**
Le Lot D teste uniquement que **le markup existe et pilote correctement** ces briques déjà en place.

### Périmètre validé (Lot D)

- **Présence** des deux boutons `.btn-undo` / `.btn-redo` dans la barre, avec `title` **et**
  `aria-label` explicites et l'icône attendue (US1/US3, D8).
- **Placement** : les deux boutons forment un `toolbar-group` **dédié** (H2/D8 : par défaut en tête —
  DD1).
- **État inactif natif** (`[disabled]`) **reflétant** `canUndo()` / `canRedo()` : disabled au
  chargement (rien à annuler/rétablir), actif dès qu'il y a un passé/futur, redisabled quand
  l'historique est remonté/le futur purgé (US2/US4).
- **Clic d'un bouton actif** pilote `undo()` / `redo()` (US1/US3) — vérifié par le **câblage**
  bouton→méthode (l'effet observable détaillé — modèle restauré, sélection, re-render — est couvert
  par le Lot B).
- **Clic sans effet quand le bouton est `disabled`** : un bouton inactif ne déclenche **aucune**
  action (US2/US4 : « un bouton inactif ne déclenche aucune action au clic »).
- **`(mousedown)` preventDefault** : le geste `mousedown` sur chaque bouton est annulé (ne vole pas
  le focus du `contenteditable` → la sélection restaurée par `applyEntry` reste dans l'éditeur — C5).

### Hors périmètre (rappel SPEC/APPROCHE + jumeaux)

- **Algèbre `EditHistory`** (pile/coalescing/bornage ~100) : **Lot A**, déjà vert.
- **Câblage du cycle** (`commit` empile, `onInput` coalescé, `undo/redo/applyEntry` = re-render +
  `setSelection` + `blocksChange.emit`, signaux `canUndo/canRedo`, timer de pause) : **Lot B**, déjà
  vert — l'**effet observable** de `undo()/redo()` (modèle/DOM/sélection restaurés) y est couvert ; le
  Lot D ne le re-teste pas, il vérifie seulement que le **bouton appelle la méthode**.
- **Garde d'echo R1 + reset par note** : **Lot C**, déjà vert.
- **Rendu CSS de l'état grisé** (`:disabled` → couleur/opacité calculée) : **hors assertions** — le
  **contrat** est l'attribut natif `disabled` (booléen, testable), pas le style calculé (peu fiable
  en jsdom). Voir DD5.
- **Raccourcis clavier `Ctrl+Z`/`Ctrl+Y`** (D4) et **undo natif du navigateur** (L1) : **hors lot**,
  reportés — **aucun** cas de test de raccourci ici (DD8).
- **Historique du titre/catégorie** (D5), **persistance** (D7/H1) : hors périmètre.

---

## 2. Dépendances (abstraites) & doublures de test

- **Composant réel monté** via `TestBed`, **services `document-*` réels** (`providedIn:'root'`), host
  **attaché à `document.body`** — **strictement le montage du spec existant** (`rich-text-editor.
  spec.ts` L26–38). On **réutilise** ses helpers : `setBlocks(blocks)`, `selectInBlock(id,start,end)`,
  `editorEl()`, `blockEl(id)`, `last()` (dernier `blocksChange`), et le tableau `emitted`.
- **`ExternalLinkService`** : doublure espionnée déjà en place (inchangée, non sollicitée par le Lot D).
- **Nouveaux sélecteurs (helpers locaux) :** `undoBtn = () => host.querySelector<HTMLButtonElement>
  ('.btn-undo')` et `redoBtn = () => host.querySelector<HTMLButtonElement>('.btn-redo')`.
- **`fixture.detectChanges()` obligatoire avant lecture du `disabled`** : les commandes/undo/redo sont
  appelées **directement** sur `component` (comme au Lot B) ; les signaux `canUndo/canRedo` changent,
  mais le **binding `[disabled]`** n'est reflété dans le DOM **qu'après** un cycle de détection. Chaque
  cas qui lit `.disabled` **appelle `fixture.detectChanges()`** juste avant l'assertion.
- **Câblage clic→méthode (DD7)** : on pose un **espion léger** `vi.spyOn(component, 'undo')` /
  `vi.spyOn(component, 'redo')` **avant** le clic pour prouver que le bouton **appelle** la méthode —
  seul accès admis au-delà de la boîte noire pure, cohérent avec les espions légers admis aux Lots B/C
  (`recordTyping`/`seal`/`reset`). *(L'effet observable de la méthode est déjà couvert par le Lot B.)*
- **Isolation R1 (echo) :** comme le spec existant, `blocksChange` est **capté** dans `emitted` mais
  **jamais re-poussé** dans l'entrée `blocks` → pas de reset parasite (hérité du Lot B).

> Aucune doublure ne fige de signature au-delà du strict nécessaire ; le contrat émerge du TDD.

---

## 3. Décisions de conception à figer (impactent les assertions)

> Les décisions **produit** sont tranchées par la SPEC (D8) et l'APPROCHE (C5). Les décisions
> **de markup/test** propres au Lot D (DD1–DD8) sont **toutes figées** (arbitrage utilisateur du
> 2026-09-20, via le superviseur) — valeurs issues de FEATURE D8 / APPROCHE C5 §3. Le plan est
> **exécutable par `ecrire_tests` sans re-décision**.

- **DD1 — Placement du groupe = `toolbar-group` dédié en TÊTE de barre. FIGÉ.** Les deux boutons
  forment un **nouveau `toolbar-group`** placé **avant** le groupe des marques (premier enfant de
  `.format-toolbar`), conforme à H2 (« groupe dédié ») et à APPROCHE §3/C5 (« groupe dédié en tête »).
  *Assertion :* TD1.3 vérifie que `.btn-undo`/`.btn-redo` appartiennent au **premier** `.toolbar-group`
  (`:first-child`). *(figé.)*

- **DD2 — Icônes = ↶ (undo) / ↷ (redo) en contenu textuel du bouton. FIGÉ.** Caractères
  `↶` (U+21B6) et `↷` (U+21B7), comme le markup proposé APPROCHE §3. *Assertion :* TD1.1/TD1.2
  vérifient que `btn.textContent` contient le glyphe attendu. *(figé.)*

- **DD3 — Libellés `title`/`aria-label` = « Annuler » / « Rétablir ». FIGÉ.** Exactement les
  exemples des critères d'acceptation US1/US3, et `title === aria-label` (comme les boutons existants).
  *Assertion :* TD1.1/TD1.2. *(figé.)*

- **DD4 — Classes CSS des boutons = `.btn-undo` / `.btn-redo`. FIGÉ.** Sélecteurs figés par
  APPROCHE §3 et par le renvoi explicite du Lot B (§5). *Assertion :* tous les cas. C'est le
  **contrat DOM** partagé avec le Lot B. *(figé.)*

- **DD5 — État inactif = `[disabled]` natif (C5), testé via la propriété `disabled`, PAS via le
  style. FIGÉ.** `[disabled]="!canUndo()"` / `[disabled]="!canRedo()"`. Les tests assertent
  `btn.disabled === true|false` (booléen natif, déterministe). Le **grisé CSS** (`:disabled`) n'est
  **pas** asserté (rendu calculé peu fiable en jsdom). L'état `disabled` est **distinct** du `.active`
  des bascules : on ne teste **pas** de classe `.active` sur ces boutons. *(figé.)*

- **DD6 — `(mousedown)="$event.preventDefault()"` testé par un `mousedown` annulable. FIGÉ.** On
  dispatche un `MouseEvent('mousedown', {cancelable:true, bubbles:true})` sur chaque bouton et on
  vérifie `event.defaultPrevented === true` (non-régression du focus du `contenteditable`, C5).
  *Assertion :* TD5.1/TD5.2. *(figé.)*

- **DD7 — Câblage clic→méthode prouvé par espion léger `vi.spyOn(component,'undo'/'redo')`. FIGÉ.** Le
  clic d'un bouton **actif** est prouvé en vérifiant que `component.undo`/`redo` est **appelé une
  fois** ; l'effet observable (modèle/DOM/sélection) **n'est pas dupliqué** ici (déjà couvert par le
  Lot B). *Assertion :* TD3.1/TD3.2 et TD4.1/TD4.2 (espion **non** appelé quand disabled). Cohérent
  avec les espions légers admis aux Lots B/C. *(figé.)*

- **DD8 — Aucun test de raccourci clavier (D4/L1 hors lot). FIGÉ.** On **ne** teste **pas** `Ctrl+Z` /
  `Ctrl+Y` : ces raccourcis ne sont **pas** branchés dans cette version (D4) et l'undo natif n'est pas
  neutralisé (L1). *(figé.)*

---

## 4. Cas de test

> Groupes `Groupe N`, cas `TD N.k`, un comportement observable par cas, en langage métier, relié aux
> user stories. Assertions sur : **présence/attributs** des boutons (`querySelector`, `getAttribute`,
> `textContent`), propriété native **`disabled`** (après `fixture.detectChanges()`), **espion léger**
> `vi.spyOn(component,'undo'/'redo')` (câblage clic→méthode, DD7), et absence d'effet au clic disabled.

### Groupe 1 — Présence, libellés, icône & placement des deux boutons (US1, US3, D8)
- **TD1.1** Après `setBlocks([...])`, un bouton `.btn-undo` est **présent** avec `title` = « Annuler »,
  `aria-label` = « Annuler » et son `textContent` contient l'icône **↶** (US1, D8 — DD2/DD3).
- **TD1.2** De même, un bouton `.btn-redo` est **présent** avec `title` = « Rétablir », `aria-label` =
  « Rétablir » et son `textContent` contient l'icône **↷** (US3, D8 — DD2/DD3).
- **TD1.3** *(placement — DD1)* Les deux boutons appartiennent à un **`toolbar-group` dédié** placé
  **en tête** de `.format-toolbar` : `host.querySelector('.format-toolbar .toolbar-group:first-child')`
  contient `.btn-undo` **et** `.btn-redo` (H2/D8). *(retirer/adapter si DD1 change.)*

### Groupe 2 — L'attribut `disabled` reflète `canUndo()` / `canRedo()` (US2, US4)
- **TD2.1 (état initial : tout inactif)** Après `setBlocks([texte])`, **avant toute action** (et après
  `fixture.detectChanges()`) : `undoBtn().disabled === true` **et** `redoBtn().disabled === true`
  (rien à annuler ni à rétablir — US2/US4).
- **TD2.2 (une commande active undo, pas redo)** `setBlocks`, `selectInBlock`, `applyMark('bold')`,
  `detectChanges()` : `undoBtn().disabled === false` (il y a un passé — US2) et `redoBtn().disabled ===
  true` (pas de futur — US4).
- **TD2.3 (un undo active redo)** dans la foulée de TD2.2, `component.undo()`, `detectChanges()` :
  `redoBtn().disabled === false` (il y a un futur rétablissable — US4) et `undoBtn().disabled === true`
  (on est revenu au pas initial, plus rien à annuler — US2).
- **TD2.4 (une nouvelle action après un undo purge le futur → redo redevient inactif)** `applyMark`,
  `undo()` (⇒ redo actif), puis **une nouvelle commande** (`applyColor(c)`), `detectChanges()` :
  `redoBtn().disabled === true` (futur vidé — US4) et `undoBtn().disabled === false`. *(le mécanisme
  `truncateFuture` est Lot A/B ; ici on vérifie que le **bouton** suit bien le signal.)*

### Groupe 3 — Le clic d'un bouton actif pilote undo() / redo() (US1, US3)
- **TD3.1 (clic undo actif appelle undo())** `applyMark('bold')`, `detectChanges()` (⇒ `.btn-undo`
  actif) ; `vi.spyOn(component,'undo')` ; `undoBtn().click()` : `component.undo` a été appelé **une**
  fois (le bouton est bien câblé sur `(click)="undo()"` — US1). *(l'effet — modèle d'avant ré-émis,
  DOM re-rendu, sélection restaurée — est couvert par le Lot B, non re-testé ici.)*
- **TD3.2 (clic redo actif appelle redo())** `applyMark('bold')`, `component.undo()`, `detectChanges()`
  (⇒ `.btn-redo` actif) ; `vi.spyOn(component,'redo')` ; `redoBtn().click()` : `component.redo` a été
  appelé **une** fois (US3).

### Groupe 4 — Un bouton inactif ne déclenche aucune action au clic (US2, US4)
- **TD4.1 (clic undo disabled = no-op)** Au chargement (`.btn-undo` disabled — TD2.1) ; `vi.spyOn(
  component,'undo')` ; `undoBtn().click()`, `detectChanges()` : `component.undo` **n'a pas** été appelé
  et `emitted.length` est **inchangé** (un `<button disabled>` ne dispatche pas de `click` — US2 : « un
  bouton inactif ne déclenche aucune action au clic »).
- **TD4.2 (clic redo disabled = no-op)** Au chargement (`.btn-redo` disabled) ; `vi.spyOn(component,
  'redo')` ; `redoBtn().click()`, `detectChanges()` : `component.redo` **n'a pas** été appelé, aucune
  émission (US4).

### Groupe 5 — `(mousedown)` preventDefault : ne vole pas le focus (C5)
- **TD5.1** Un `mousedown` **annulable** dispatché sur `.btn-undo` est **preventDefault** :
  `event.defaultPrevented === true` (le focus du `contenteditable` n'est pas volé → la sélection
  restaurée par `applyEntry` reste dans l'éditeur — C5). *(DD6.)*
- **TD5.2** Idem sur `.btn-redo` : `mousedown` annulable → `defaultPrevented === true` (C5).

---

## 5. Contrat DOM / API (ciblés par les tests)

> Le Lot D fixe le **contrat de markup** que l'implémentation devra honorer (sélecteurs, attributs,
> bindings). Ce contrat est **partagé** avec le renvoi du Lot B (§5, « hors lot D »).

| Cible (sélecteur / attribut) | Type | Rôle / attendu au Lot D |
|---|---|---|
| `.btn-undo` | `<button type="button">` | bouton « annuler », présent dans la barre (US1). |
| `.btn-redo` | `<button type="button">` | bouton « rétablir », présent dans la barre (US3). |
| `.btn-undo[title]` / `[aria-label]` | attributs | tous deux = « Annuler » (DD3). |
| `.btn-redo[title]` / `[aria-label]` | attributs | tous deux = « Rétablir » (DD3). |
| `.btn-undo` `textContent` | contenu | contient l'icône ↶ (DD2). |
| `.btn-redo` `textContent` | contenu | contient l'icône ↷ (DD2). |
| `.format-toolbar .toolbar-group:first-child` | conteneur | `toolbar-group` **dédié en tête** contenant les 2 boutons (DD1). |
| `.btn-undo[disabled]` | propriété native | `= !canUndo()` : vrai au chargement, faux dès qu'il y a un passé (US2 — DD5). |
| `.btn-redo[disabled]` | propriété native | `= !canRedo()` : vrai par défaut, faux dès qu'on a annulé (US4 — DD5). |
| `(click)="undo()"` sur `.btn-undo` | binding | un clic (bouton actif) appelle `component.undo()` (US1 — DD7). |
| `(click)="redo()"` sur `.btn-redo` | binding | un clic (bouton actif) appelle `component.redo()` (US3 — DD7). |
| `(mousedown)="$event.preventDefault()"` | binding | `mousedown` annulé sur chaque bouton (C5 — DD6). |

**API du composant (déjà livrée, non modifiée) :** `component.canUndo()` / `component.canRedo()`
(signaux publics, Lot B), `component.undo()` / `component.redo()` (méthodes publiques, Lot B). Aucun
nouvel import de type nécessaire côté tests (sélecteurs DOM + `NoteBlock`/`TextBlock` déjà importés).

---

## 6. Ordre d'implémentation TDD suggéré (rouge → vert → refactor)

1. **Groupe 1** — présence + attributs + icône + placement (markup statique) : ajoute le
   `toolbar-group` dédié et les deux `<button>` (title/aria-label/icône).
2. **Groupe 2** — `[disabled]="!canUndo()"` / `[disabled]="!canRedo()"` : câble l'état inactif natif
   sur les signaux existants (le cœur US2/US4).
3. **Groupe 3** — `(click)="undo()"` / `(click)="redo()"` : câble le clic sur les méthodes existantes.
4. **Groupe 4** — clic disabled = no-op (découle de `[disabled]` + Groupe 3 ; valide US2/US4 côté clic).
5. **Groupe 5** — `(mousedown)="$event.preventDefault()"` (parité focus avec les autres boutons, C5).

> Rappel builder : le Lot D **n'ajoute aucune API** au composant (signaux/méthodes déjà présents) → il
> **ne modifie que `.html`** (+ CSS `:disabled`). Pas de risque `TS2339/TS2554` ; les cas ciblent des
> sélecteurs DOM et peuvent être écrits directement.

---

## Fichiers concernés

- **Sous test / à étendre :**
  `frontend/src/app/rich-text-editor/rich-text-editor.spec.ts` (nouveau bloc `Undo/Redo (Lot D —
  boutons de barre)`, cas TD1–TD5).
- **Implémentation (hors de ce plan, par la suite) :**
  `frontend/src/app/rich-text-editor/rich-text-editor.html` (nouveau `toolbar-group` en tête + boutons
  `.btn-undo`/`.btn-redo` avec `[disabled]`, `(click)`, `(mousedown)`, `title`/`aria-label`, icônes),
  `frontend/src/app/rich-text-editor/rich-text-editor.css` (style bouton de barre réutilisé + état
  `:disabled` grisé — non asserté, DD5).
- **Réutilisés (inchangés) :** `frontend/src/app/rich-text-editor/rich-text-editor.ts`
  (`canUndo`/`canRedo`/`undo`/`redo` — Lots B/C, verts),
  `frontend/src/app/core/services/edit-history.ts` (Lot A, vert).
- **Lots voisins (verts) :** Lot B ([`PLAN_TESTS_RTE_UNDO_REDO.md`](PLAN_TESTS_RTE_UNDO_REDO.md)),
  Lot C ([`PLAN_TESTS_RTE_RELOAD_GUARD.md`](PLAN_TESTS_RTE_RELOAD_GUARD.md)).
