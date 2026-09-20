# Revue de fonctionnalité — Annuler / Rétablir (Undo / Redo)

**Date :** 2026-09-20
**Statut :** validé le 2026-09-20 — **refactoring réalisé le 2026-09-20**.
**Périmètre :** les 4 lots A, B, C, D de la fonctionnalité Undo/Redo (livrée, suite 360/361 verte ;
seul rouge = `calendar.spec.ts`, préexistant, hors sujet).

**Suivi d'application (refactoring, 2026-09-20) :**
- **R2 → C1** *(appliqué le 2026-09-20)* — `this.run = null;` dans `EditHistory.reset()` + test verrou `T1.5` (`edit-history.spec.ts`).
- **R3 → C4/C5** *(appliqué le 2026-09-20)* — suppression des branches d'amorçage paresseux dans `commit`/`onInput` + du champ `historySeeded` (devenu write-only) + commentaire d'en-tête « no-ops » corrigé.
- **R4 → C7/C8** *(appliqué le 2026-09-20)* — doc `APPROCHE_UNDO_REDO.md` : formule de coalescing `>=` (D2, borne inclusive) + retrait de `seedHistory()` du diagramme et de la table.
- **R5 → C2/C6** *(appliqué le 2026-09-20)* — micro-nettoyages : double affectation `run.lastEditAt` supprimée ; `undo()/redo()` annulent le timer de pause en attente.
- **R1 → C3** *(reporté — limitation documentée le 2026-09-20)* — insertion image/vidéo non annulable : pas de correction code ; limitation « L2 » ajoutée dans `FEATURE_UNDO_REDO.md` (§ Limitations connues).

Suite après refactoring : **361 passés + seul `calendar.spec.ts` rouge** (préexistant), 0 `unhandled`.

**Références (sources de vérité) :**
- SPEC : [`FEATURE_UNDO_REDO.md`](FEATURE_UNDO_REDO.md) (US1–US6, D1–D8, H1–H3, L1)
- APPROCHE : [`APPROCHE_UNDO_REDO.md`](APPROCHE_UNDO_REDO.md) (C1–C5, Lots A→D, R1–R4)
- PLANS DE TEST : [`PLAN_TESTS_EDIT_HISTORY.md`](PLAN_TESTS_EDIT_HISTORY.md) (Lot A, D1–D8),
  [`PLAN_TESTS_RTE_UNDO_REDO.md`](PLAN_TESTS_RTE_UNDO_REDO.md) (Lot B, DB1–DB7),
  [`PLAN_TESTS_RTE_RELOAD_GUARD.md`](PLAN_TESTS_RTE_RELOAD_GUARD.md) (Lot C, DC1–DC7),
  [`PLAN_TESTS_RTE_TOOLBAR_UNDO_REDO.md`](PLAN_TESTS_RTE_TOOLBAR_UNDO_REDO.md) (Lot D, DD1–DD8)

**Fichiers d'implémentation revus (lus intégralement) :**
- Lot A — `frontend/src/app/core/services/edit-history.ts` (commit `d4db910`)
- Lot B — `frontend/src/app/rich-text-editor/rich-text-editor.ts` (commit `d4db910` + working tree)
- Lot C — `frontend/src/app/rich-text-editor/rich-text-editor.ts` (working tree, `effect`)
- Lot D — `frontend/src/app/rich-text-editor/rich-text-editor.html` + `rich-text-editor.css` (working tree)

*(Les `.spec.ts` — `edit-history.spec.ts`, `rich-text-editor.spec.ts` — ont été lus comme contrat de
comportement, pas audités comme cible de refactoring.)*
*(Bruit hors sujet : `frontend/package-lock.json` a changé pour ajouter `@capacitor/browser ^8.0.4`
— sans lien avec Undo/Redo, simplement signalé.)*

---

## 1. Synthèse

Le code livré est **globalement sain, fidèle au cadrage et bien documenté**. Points solides :

- **Lot A (`EditHistory`)** est une classe **pure exemplaire** : invariants clairement énoncés,
  algorithmes conformes à l'APPROCHE (pile passé/futur, `truncateFuture`, `enforceLimit` FIFO,
  coalescing par run), constante `TYPING_COALESCE_PAUSE_MS = 500` nommée et exportée (C3), snapshot
  par **référence** sans clone (C2/D7). Le seuil de pause respecte bien **D2 (`>= 500` scelle)** :
  `now - lastEditAt < 500` pour étendre (edit-history.ts:84).
- **Lot C (garde anti-echo)** est le point d'intégration critique (R1) et il est **correct** : garde
  par identité `incoming === untracked(this.model)` lue **avant** `model.set` (rich-text-editor.ts:237),
  branche reset annulant le timer + `reset` + `historySeeded = true` + `syncButtons` (243–252).
  L'usage de `untracked` est **justifié et bien commenté** (231–236) : le POURQUOI (éviter que
  `model` devienne dépendance de l'effect → reset parasite après `commit`) est explicite et suffisant.
- **Lot B** réutilise fidèlement le cycle `commit` (paint → setSelection → push → emit → refresh) et
  `applyEntry` = même cycle **sans** `history.push` (anti-boucle US5). Les seams `now` / `scheduleSeal`
  sont propres et le nettoyage (`DestroyRef`) couvre `selectionchange` **et** le timer de pause.
- **Lot D** respecte le contrat DOM (DD1–DD8) : `toolbar-group` dédié en tête, `.btn-undo`/`.btn-redo`,
  `[disabled]="!canUndo()/!canRedo()"`, `(mousedown) preventDefault`, `title === aria-label`, icônes
  ↶/↷, CSS `:disabled` grisé (rich-text-editor.css:52–58).

Les constats ci-dessous ne remettent pas en cause l'architecture ; deux d'entre eux (**C2, C3**) sont
toutefois des **écarts fonctionnels réels** au regard du plan, à corriger avant de clore.

---

## 2. Constats

### Lot A — `edit-history.ts`

**C1 — `reset()` ne remet pas `this.run` à `null` (écart APPROCHE + bug latent de coalescing).**
`edit-history.ts:64-67`. L'APPROCHE §3 spécifie explicitement `reset(entry) → entries=[entry]; index=0;
run = null`. L'implémentation omet `run = null`. `push()` le fait (l.71), pas `reset()`.
- **Impact (robustesse / conformité au plan).** Après un `reset` appelé alors qu'une salve de frappe
  est **ouverte** (`run.open = true`), le run de l'**ancienne** note survit. Scénario réel : Lot C
  réinitialise l'historique dans l'`effect` en appelant `this.cancelSeal?.()` (qui annule le *timer
  composant*, **pas** `history.run`) puis `history.reset(...)` — le run reste ouvert. La 1ʳᵉ frappe
  dans la note rechargée, si elle survient à moins de 500 ms de la dernière frappe de la note
  précédente, **étend le pas initial en place** (`entries[index] = entry`, l.86) au lieu d'empiler :
  le pas d'ouverture « propre » (DC4) est écrasé et cette frappe devient non annulable.
- **Non couvert par les tests** : tous les cas `reset` du Lot A (T1.2/T1.3/T1.4) resettent **avant**
  toute frappe, ou `push` (qui met `run=null`) précède le reset — le scénario reset-sur-run-ouvert
  n'existe dans aucun test. Le commentaire DC7 du plan Lot C suppose d'ailleurs à tort « un `seal()`
  tardif retomberait sur un historique sans run ».
- **Gravité : important** (probabilité réelle faible — dépend d'un enchaînement < 500 ms — mais c'est
  une déviation nette du plan et un invariant fragilisé).

**C2 — Double affectation de `run.lastEditAt` dans `recordTyping`.** `edit-history.ts:89` puis `:91`.
La branche `else` crée `this.run = { lastEditAt: now, open: true }` (l.89) puis la ligne 91
(`this.run!.lastEditAt = now;`) réécrit la même valeur. Redondant.
- **Impact : lisibilité** (aucun effet fonctionnel).
- **Gravité : cosmétique.**

### Lot B — `rich-text-editor.ts`

**C3 — L'insertion image/vidéo (`insertBlock`) court-circuite `commit`/l'historique.**
`rich-text-editor.ts:744-754`. `insertImageFromUrl`, `onImageFile` et `insertVideoFromUrl`
convergent vers `insertBlock`, qui fait son propre `model.set` + `paint` + `blocksChange.emit`
**sans** passer par `commit` ni `history.push`, et sans amorçage. Or la SPEC (US1, « insertion
image/vidéo/lien », périmètre inclus) et l'APPROCHE §2 (« insertion image/vidéo/lien y convergent
… → un pas propre ») exigent que ces insertions soient **annulables**.
- **Impact (conformité au plan / robustesse — US1/US5).** Insérer une image ou une vidéo n'ajoute
  **aucun pas** d'historique ; le bouton *annuler* ne défait pas l'insertion, et l'état émis diverge
  de l'historique (un `undo` ultérieur ne « voit » jamais ce média comme une étape discrète →
  incohérence affichage/modèle). L'insertion de **lien** (`insertLinkFromUrl`, via `commit`) et le
  **collage** (`insertBlocksAtSelection`, via `commit`) sont, eux, corrects.
- **Gravité : important** (fonctionnalité annoncée manquante pour 2 des commandes du périmètre).

**C4 — Amorçage paresseux (DB4/Q3) devenu du code mort en pratique depuis le Lot C.**
`rich-text-editor.ts:281-284` (`onInput`) et `:513-516` (`commit`). Ces branches
`if (!this.historySeeded) { history.reset(previousModel); historySeeded = true; }` implémentent le
seed « paresseux à la 1ʳᵉ action » du Lot B. Depuis le Lot C, l'`effect` du constructeur s'exécute au
premier passage (même au montage : `blocks()` initial `[]` ≠ `model()` initial `[]`, références
distinctes → `isEcho = false`) et pose `historySeeded = true` **avant** toute action utilisateur
(l.243-251). Les gardes `!this.historySeeded` de `commit`/`onInput` ne sont donc jamais vraies dans un
composant monté.
- **Impact (lisibilité / code mort du TDD).** Branches inertes conservées, avec des commentaires
  (« Lazy seeding DB4/Q3 ») qui les présentent comme actives — trompeur pour un lecteur. Non nuisible
  fonctionnellement (le seed eager du Lot C produit le même état observable, cf. traçage Q3).
- **Gravité : cosmétique** (mais à trancher : filet défensif documenté vs suppression — voir §5).

**C5 — Commentaire d'en-tête périmé « intentionally no-ops » (déjà signalé).**
`rich-text-editor.ts:102-106`. Le bloc `NOTE Lot B` affirme que « the bodies below are intentionally
no-ops » et que la logique undo/redo « is implemented in the next step » — alors que `undo`, `redo`,
`applyEntry`, `commit` (push), `onInput` (recordTyping), `syncButtons`, `armPauseTimer` sont **tous
pleinement implémentés** juste en dessous.
- **Impact : lisibilité** (commentaire mensonger, vestige de l'étape rouge du TDD).
- **Gravité : cosmétique.**

**C6 — `undo()`/`redo()` n'annulent pas le timer de pause en attente.** `rich-text-editor.ts:152-168`.
Après une frappe (timer armé via `armPauseTimer`), un clic *annuler* appelle `history.undo()` (qui
`seal()` le run) mais laisse le timer composant armé ; à l'échéance il exécute `history.seal()`
(no-op) + `syncButtons()` (re-sync sans changement).
- **Impact : robustesse mineure** (aucune corruption observée ; simple exécution superflue).
- **Gravité : cosmétique.**

### Lot C — `rich-text-editor.ts` (effect)

Aucun constat propre : la garde d'echo (C4/DC1), la branche reset (DC3), l'ordre de lecture avant
`model.set` (DC1) et l'usage commenté de `untracked` (R4) sont conformes. Le seul angle mort est
**C1** (le `reset` du Lot A appelé ici ne referme pas le run — cause racine côté Lot A).

### Lot D — `rich-text-editor.html` / `.css`

Aucun constat. Markup et CSS conformes à DD1–DD8 et à C5 de l'APPROCHE.

### Écart de documentation (transverse)

**C7 — Formule de coalescing divergente entre APPROCHE et PLAN_TESTS/impl.**
`APPROCHE_UNDO_REDO.md:235` définit `coalesceExpiré(now) = now - run.lastEditAt > TYPING_COALESCE_PAUSE_MS`
(strict `>`, donc 500 ms pile = regroupé), tandis que `PLAN_TESTS_EDIT_HISTORY.md` D2 et
l'implémentation (edit-history.ts:84, `< 500` pour étendre) appliquent la borne **inclusive** (500 ms
pile = nouveau pas). L'implémentation est **correcte** vis-à-vis de la décision figée D2 ; c'est
l'APPROCHE qui est périmée.
- **Impact : conformité documentaire** (aucun impact code).
- **Gravité : cosmétique.**

**C8 — Diagramme de classes APPROCHE non aligné avec l'implémentation.**
`APPROCHE_UNDO_REDO.md:80` liste une méthode `RichTextEditor.seedHistory(model)` ; l'implémentation
n'a pas cette méthode et gère l'amorçage via le latch `historySeeded` + `reset` inline (C1 de C4
ci-dessus). Écart assumé, mais le diagramme mériterait mise à jour (cf. §7 de l'APPROCHE qui prévoit
d'intégrer `EditHistory` dans `DIAGRAMME_CLASSES_NOTES.md`).
- **Gravité : cosmétique.**

---

## 3. Refactorings proposés

**R1 → C3 — Faire passer l'insertion image/vidéo par l'historique.**
*(REPORTÉ — limitation connue, hors clôture de ce lot — arbitrage utilisateur 2026-09-20)*
- **Décision :** **pas de correction code dans ce lot.** L'insertion image/vidéo non annulable est
  **acceptée comme limitation connue** de cette version.
- **Action liée (doc, à l'étape refactoring/doc) :** documenter la limitation — ajouter une ligne
  type **« L2 — insertion image/vidéo non annulable dans cette version »** dans
  `FEATURE_UNDO_REDO.md` (§ Limitations connues) et/ou dans le périmètre « Hors périmètre (reporté) ».
  *(Signalé ici comme action liée ; non traité dans la présente revue.)*
- **Transformation (conservée pour mémoire, si repris plus tard) :** router `insertBlock` par le point
  d'empilement — soit `commit(newModel, at)` avec un `SelectedRange` pertinent, soit un
  `history.push({model, selection})` + `syncButtons()` symétrique de `commit` après son `emit`, en
  vérifiant l'interaction avec le seed eager (Lot C) pour ne pas créer de double pas.
- **Fichiers (si repris) :** `rich-text-editor.ts` + `rich-text-editor.spec.ts` (cas média/undo à créer).

**R2 → C1 — `reset()` referme le run.** *(validé — à appliquer ; priorité 1)*
- **Objectif :** conformité APPROCHE §3 + fermeture de l'invariant (pas de coalescing inter-note).
- **Transformation :** ajouter `this.run = null;` dans `EditHistory.reset` (edit-history.ts:64-67).
- **Fichiers :** `edit-history.ts`.
- **Risque :** très faible. **Filet :** ajouter à `edit-history.spec.ts` un cas « `recordTyping`
  (run ouvert) puis `reset` puis `recordTyping` à Δ < 500 ms → **nouveau** pas » (verrouille le fix).
- **Effort :** faible.

**R3 → C4 + C5 — Supprimer le code mort du TDD + corriger les commentaires.**
*(validé — à appliquer — arbitrage utilisateur 2026-09-20)*
- **Objectif :** lisibilité, supprimer le trompeur et l'inerte.
- **Décision :** **suppression du code mort validée.**
- **Transformation :** (a) **retirer** les branches `if (!this.historySeeded) { history.reset(...);
  historySeeded = true; }` de `commit` (l.513-516) et `onInput` (l.281-284) — le Lot C garantit le
  seed eager (l.243-251) ; ajuster les commentaires qui les décrivent comme « lazy seeding DB4/Q3 » ;
  (b) réécrire/supprimer le bloc d'en-tête « intentionally no-ops » (l.102-106).
  *(Le champ `historySeeded` reste nécessaire tant qu'il est lu/écrit par l'effect du Lot C ; à
  l'application, vérifier s'il conserve un rôle une fois les branches retirées.)*
- **Fichiers :** `rich-text-editor.ts`.
- **Risque :** faible (le seed eager du Lot C produit le même état observable — traçage Q3).
  **Filet :** suite composant existante (TB1–TB6, TC1–TC4).
- **Effort :** faible.

**R4 → C7 + C8 — Réaligner la documentation APPROCHE.** *(quick win, doc)*
- **Objectif :** cohérence des sources de vérité.
- **Transformation :** corriger la formule §235 en borne inclusive (`>=`), et mettre à jour le diagramme
  (retirer `seedHistory`, refléter `historySeeded` + garde d'echo). Idéalement propager dans
  `DIAGRAMME_CLASSES_NOTES.md` §5 comme prévu par l'APPROCHE §7.
- **Fichiers :** `.agent/UNDO_REDO/APPROCHE_UNDO_REDO.md`, `.agent/DIAGRAMME_CLASSES_NOTES.md`.
- **Risque :** nul (docs). **Effort :** faible.

**R5 → C2 + C6 — Micro-nettoyages.** *(optionnel)*
- **Transformation :** (a) retirer la double affectation `run.lastEditAt` (edit-history.ts:91) ;
  (b) faire annuler le timer de pause (`this.cancelSeal?.()`) en tête de `undo()`/`redo()`.
- **Fichiers :** `edit-history.ts`, `rich-text-editor.ts`.
- **Risque :** faible. **Filet :** suites existantes. **Effort :** faible.

---

## 4. Backlog de refactoring retenu (validé — ordre d'application)

> Arbitrages tranchés le 2026-09-20. Ordre pour l'étape `appliquer_refactoring` :

1. **R2 → C1** — `this.run = null;` dans `EditHistory.reset()` **+ test verrou** (`edit-history.spec.ts`).
   *Validé — priorité 1 (ferme un invariant, quick win).*
2. **R3 → C4/C5** — suppression des branches d'amorçage paresseux (`!historySeeded` dans `commit` et
   `onInput`) + correction du commentaire d'en-tête « no-ops » périmé. *Validé.*
3. **R4 → C7/C8** — réalignement doc : formule de coalescing `>=` dans l'APPROCHE, diagramme
   (`historySeeded`/garde d'echo, retrait de `seedHistory`). *Validé (doc).*
4. **R5 → C2/C6** — micro-nettoyages (double affectation `lastEditAt` ; annulation du timer de pause
   dans `undo()/redo()`). *Optionnel, opportuniste.*

**R1 → C3 — REPORTÉ (limitation connue, hors clôture).** Insertion image/vidéo non annulable :
pas de correction code ; **action liée** = documenter la limitation (« L2 » dans
`FEATURE_UNDO_REDO.md` § Limitations connues / périmètre), à faire à l'étape refactoring/doc.

**Hors périmètre / reporté (rappel SPEC, ne pas traiter ici) :** raccourcis clavier Ctrl+Z/Y (D4),
neutralisation de l'undo natif (L1), persistance de l'historique (D7/H1), historique titre/catégorie
(D5), coalescence fine IME/DnD.

---

## 5. Arbitrages tranchés (2026-09-20)

- **C3/R1 — REPORTÉ.** L'insertion image/vidéo non annulable est **acceptée comme limitation connue**
  de cette version (pas de code dans ce lot). Action liée : la documenter (« L2 »).
- **C4/R3 — SUPPRESSION validée.** Retirer les branches d'amorçage paresseux (code mort depuis le seed
  eager du Lot C) et corriger les commentaires associés.

---

*Revue validée le 2026-09-20 — prête pour l'étape `appliquer_refactoring`. Aucun fichier de code ni de
test n'a été modifié par la revue.*
