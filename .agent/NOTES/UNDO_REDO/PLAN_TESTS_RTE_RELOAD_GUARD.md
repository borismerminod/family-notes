# Plan de Test (TDD) — Undo/Redo dans `RichTextEditor` (Lot C — garde anti-echo & reset par note)

**Statut :** **validé le 2026-09-20** *(rédigé le 2026-09-20 ; 5 arbitrages Q1–Q5 tranchés par
l'utilisateur — voir §7 ; décisions de test DC1–DC7 **figées** §3 ; cas TC1–TC4 sans ambiguïté, prêts
pour `ecrire_tests`).*

> **Approche :** boîte noire / TDD. Ce plan décrit le **comportement observable** du **Lot C** de la
> fonctionnalité Undo/Redo : la **garde anti-echo (R1)** et le **reset propre de l'historique au
> (re)chargement réel d'une note**. On monte le **vrai** composant (services `document-*` réels, comme le
> spec existant), on pose `blocks`, on déclenche une commande/frappe, puis on **réinjecte** dans l'input
> `blocks` soit **la même référence** que celle émise (echo) soit **une nouvelle référence** (rechargement),
> et on observe les **signaux** `canUndo()/canRedo()`, la possibilité d'`undo()`, et le contenu restauré.
>
> **SPEC de référence :** [`FEATURE_UNDO_REDO.md`](FEATURE_UNDO_REDO.md) (US6, D7 — historique
> réinitialisé par note, non persisté).
> **Approche de dev :** [`APPROCHE_UNDO_REDO.md`](APPROCHE_UNDO_REDO.md) — **décision C4** (garde par
> **identité de référence** `incoming === model()`), **Lot C** au §3 (l'`effect` de synchro
> `blocks()`→`model` réinitialise l'historique **uniquement** au vrai (re)chargement), **risque R1** au §4
> (« point d'intégration critique »).
> **Frontière amont (point de départ) :** [`PLAN_TESTS_RTE_UNDO_REDO.md`](PLAN_TESTS_RTE_UNDO_REDO.md)
> **§4 Groupe 7** (« Frontière avec Lot C ») + **§2 Isolation vis-à-vis de R1 (echo)** : le Lot B a
> **volontairement isolé** ses tests de l'echo (« le parent de test ne re-pousse **pas** `blocksChange`
> dans `blocks` ») et **renvoyé** ici le test de la garde et du seed « propre » au rechargement. On
> **reprend sa terminologie** (echo / (re)chargement réel / seed propre).
>
> **Jumeaux existants (conventions à suivre) :**
> - **Spec du composant :** [`../../frontend/src/app/rich-text-editor/rich-text-editor.spec.ts`](../../frontend/src/app/rich-text-editor/rich-text-editor.spec.ts)
>   — montage `TestBed`, host attaché à `document.body`, helpers `setBlocks`/`selectInBlock`/`editorEl`/
>   `blockEl`/`firstText`/`last()`, capture `emitted`, doublure `ExternalLinkService`, bloc `Undo/Redo
>   (Lot B)` déjà vert (TB1–TB6, helper `typeKey`, seams `now`/`scheduleSeal`).
> - **Lot A (algèbre de l'historique) :** [`edit-history.ts`](../../frontend/src/app/core/services/edit-history.ts)
>   (`reset` purge passé **et** futur — D7) + [`PLAN_TESTS_EDIT_HISTORY.md`](PLAN_TESTS_EDIT_HISTORY.md).

---

## 1. Objet testé

Le **point d'intégration critique R1** : dans `rich-text-editor.ts`, l'`effect` du constructeur
(actuellement L226–233) qui synchronise l'**input signal** `blocks()` → `model`. Le Lot C lui ajoute la
**garde d'identité C4** et le **reset par note** :

```
effect(() => {
  const incoming = this.blocks();
  const isEcho = (incoming === this.model());   // ⟵ NEW C4 : lu AVANT model.set
  this.model.set(incoming);
  const editor = this.editorEl();
  if (editor && document.activeElement !== editor) this.paint(editor, incoming);
  if (!isEcho) {                                 // ⟵ NEW : vrai (re)chargement de note
    this.cancelSeal?.();                         // ⟵ NEW (Q3-mineur) : ne pas sceller une salve de l'ancienne note
    this.history.reset({ model: incoming, selection: null });
    this.historySeeded = true;                   // ⟵ NEW (DC7/Q3) : amorçage EAGER, consomme le latch
    this.syncButtons();                          // ⟵ NEW : les 2 boutons repartent inactifs (US6)
  }
})
```

**Delta à câbler (APPROCHE §3 Lot C) :**

| Membre (`RichTextEditor`) | Statut | Rôle testé au Lot C |
|---|---|---|
| `effect` de synchro `blocks()`→`model` | MOD | **garde d'identité** `incoming === model()` : echo → ne rien faire ; sinon → `history.reset` + `syncButtons`. |
| `history.reset({model: incoming, selection: null})` | NEW (dans l'effect) | réamorce l'historique sur l'état de la note **rechargée** (pas initial neutre, D7). |
| `historySeeded` | MOD | le reset de l'effect **consomme** le latch → amorçage **eager** de la note rechargée (DC7/Q3). |
| `cancelSeal?.()` (branche reset) | réutilisé | annule un timer de scellage en attente pour ne pas sceller une salve de l'ancienne note (Q3-mineur). |
| `syncButtons()` (branche reset) | réutilisé | recopie `canUndo()/canRedo()` (= faux) dans les signaux après reset. |

### Périmètre validé (Lot C)

- **Echo n'efface pas l'historique** : après commande(s)/frappe, si le parent **réinjecte dans `blocks`
  la même référence** que celle émise (echo de `blocksChange`), `canUndo()` **reste vrai** et `undo()`
  **fonctionne toujours** (R1 couvert — l'historique **n'est pas** réinitialisé).
- **Vrai rechargement réinitialise** : si le parent pousse dans `blocks` une **nouvelle référence** (autre
  note / contenu rechargé), l'historique est **reset** → `canUndo()/canRedo()` repassent **faux**, et
  l'`undo()` **ne peut plus** remonter au contenu précédent (US6, D7).
- **Seed propre** : le nouvel **état de départ** après reset permet d'**annuler la 1ʳᵉ action** faite sur
  la note rechargée (elle ramène la note **telle que rechargée**) — cohérence avec l'amorçage (DB4 Lot B).
- **Premier chargement** (initial, Q2=inclus) : après le tout premier `setBlocks(...)`,
  `canUndo()/canRedo()` sont faux (rien à annuler), l'historique est amorcé (eager) sur la note chargée.

### Hors périmètre (rappel)

- **Algèbre `EditHistory`** (`reset`/`push`/`undo`/`canUndo`…) : **Lot A**, déjà vert — non re-testée.
- **Câblage `commit`/`onInput`/`undo`/`redo`/`applyEntry`/timer/coalescing** : **Lot B**, déjà vert — on
  ne le re-teste pas, on **réutilise** ses points d'entrée pour créer un historique **avant** l'echo/reload.
- **Les deux boutons de barre** (`.btn-undo`/`.btn-redo`, `[disabled]`, CSS `:disabled`, placement) :
  **Lot D**. Le Lot C teste les **signaux/API** et le comportement d'historique, pas le markup.
- **Persistance** de l'historique (D7/H1) : en mémoire uniquement — pas d'objet du test.
- Raccourcis clavier (D4), undo natif du contenteditable (L1) : hors lot.

---

## 2. Dépendances (abstraites) & doublures de test — **comment simuler echo vs rechargement**

- **Composant réel monté** via `TestBed`, **services `document-*` réels**, host **attaché à
  `document.body`** — **strictement le montage du spec existant**. On **réutilise** ses helpers
  (`setBlocks`, `selectInBlock`, `editorEl`, `blockEl`, `last()`, `emitted`) et, pour la frappe, le helper
  **`typeKey`** + les seams `now`/`scheduleSeal` déjà en place dans le bloc `Undo/Redo (Lot B)`.
- **`ExternalLinkService`** : doublure espionnée déjà en place (inchangée).
- **`EditHistory`** : **instance réelle** possédée par le composant. Contrat **boîte noire** : on observe
  à travers `canUndo()`, `canRedo()`, `undo()` et les émissions. **Q4=oui (figé) :** on ajoute un
  **espion léger** sur `component['history'].reset` (à l'image du Lot B — TB5.6/TB6.3 espionnent
  `recordTyping`/`seal`) pour **pincer la branche de garde** : `reset` **appelé** au rechargement (TC2.4),
  **pas appelé** à l'echo (TC1.2).

### Simuler l'echo — **le cœur du Lot C** *(à arbitrer Q1)*

Le cycle réel est : `commit`/`onInput`/`applyEntry` font `model.set(newModel)` **puis**
`blocksChange.emit(newModel)` (même référence). Le parent réinjecte cette référence dans `blocks`.
Comme `emit(newModel)` émet **exactement** `model()`, dans le test **`last()` === la référence portée par
`model()`**. On reproduit donc l'echo **fidèlement, sans nouveau seam**, en réinjectant `last()` :

```ts
function echoBack(): void {                    // simule le parent renvoyant l'emit dans blocks
  fixture.componentRef.setInput('blocks', last());  // MÊME référence que le dernier emit
  fixture.detectChanges();                     // rejoue l'effect → doit détecter incoming === model()
}
```

- **Pourquoi l'effect se redéclenche quand même** : au moment de l'echo, l'input `blocks` porte encore
  l'**ancienne** référence (celle du `setBlocks` initial). Le passer à `last()` (référence **différente
  de l'ancienne** mais **identique à `model()`**) **notifie** l'input → l'effect re-tourne → la garde
  `incoming === model()` est **vraie** → **pas de reset**. C'est exactement le mécanisme R1.

### Simuler le (re)chargement réel

`setBlocks(nouveauTableau)` avec un **tableau neuf** (autre note / contenu rechargé) : l'input `blocks`
change vers une référence **≠ `model()`** → l'effect détecte `incoming !== model()` → **reset**.

> **Isolation héritée du Lot B (rappel) :** hors des cas de ce plan, le parent de test ne re-pousse
> **jamais** `blocksChange` dans `blocks` — d'où l'absence de reset parasite dans les groupes Lot B.

---

## 3. Décisions de conception figées (impactent les assertions)

> Les 7 décisions ci-dessous sont **figées** par l'arbitrage du 2026-09-20 (Q1–Q5, §7). Elles
> structurent les cas TC1–TC4 (§4) et sont exécutables par `ecrire_tests` **sans re-décision**.

- **DC1 — Garde par identité de référence (C4), lue AVANT `model.set`.** `isEcho = (incoming ===
  model())` est capturé **avant** `this.model.set(incoming)`, sinon la comparaison serait toujours vraie.
  *(fige l'ordre des instructions de l'effect ; détail d'implémentation non testé en propre — Q5 : pas de
  cas dédié.)* *(figé.)*

- **DC2 — Echo ⇒ aucun reset, historique préservé.** Réinjecter `last()` dans `blocks` **ne réinitialise
  pas** l'historique : `canUndo()` **reste** dans l'état d'avant l'echo et `undo()` produit toujours le
  même effet. Observable en boîte noire (canUndo + undo, TC1.1/TC1.3) **et** par espion `reset` **non
  appelé** (TC1.2, Q4). *(figé.)*

- **DC3 — (Re)chargement réel ⇒ reset (passé + futur vidés).** `setBlocks(nouveauTableau)` (référence ≠
  `model()`) appelle `history.reset({model: incoming, selection: null})` puis `syncButtons()` :
  `canUndo() = canRedo() = false` et l'`undo()` est **sans effet** (ne remonte plus au contenu
  précédent). *(fige TC2.1–TC2.4.)* *(figé.)*

- **DC4 — Seed propre = état de la note rechargée.** Après reset, le **pas initial** porte le modèle
  **rechargé** (`incoming`) avec `selection: null`. La **1ʳᵉ action** sur la note rechargée est donc
  **annulable** et `undo()` ramène la note **telle que rechargée** (cohérent avec l'amorçage DB4 du Lot
  B). *(fige TC3.1.)* *(figé.)*

- **DC5 — `syncButtons()` dans la branche reset uniquement (echo : inchangé).** Le reset **doit**
  rafraîchir les signaux (sinon `canUndo()` resterait vrai malgré un historique vidé). Sur l'echo, l'état
  n'a pas bougé : `syncButtons()` y est **inutile** (sans effet observable). *(figé.)*

- **DC6 — `selection: null` au reset ⇒ pas de restauration de caret sur l'undo initial.** Un `undo()`
  vers le pas initial rechargé **repeint sans** restaurer la sélection (laissée au navigateur), conforme
  à `applyEntry` (Lot B) et à l'approche. *(note ; pas d'assertion de sélection sur le pas initial.)*
  *(figé.)*

- **DC7 — Le reset consomme le latch d'amorçage `historySeeded` (amorçage EAGER).** Le reset de l'effect
  met `historySeeded = true` **et annule un timer de scellage en attente** (`cancelSeal?.()`, pour ne pas
  sceller une salve de l'ancienne note) : la 1ʳᵉ action après rechargement **ne re-amorce pas** (pas de
  double seed — elle empile simplement sur le pas initial rechargé). **Interaction Lot B/C figée** : le
  premier `setBlocks(...)` amorce désormais l'historique **dans l'effect** (eager), là où le Lot B
  s'appuyait sur l'amorçage **paresseux à la 1ʳᵉ action** ; les cas Lot B **restent verts** (voir §7-Q3
  pour le traçage TB1.1/TB2.1/TB3.5 + l'ajustement du libellé de TB1.1). *(figé.)*

---

## 4. Cas de test

> Groupes `Groupe N`, cas `TC N.k`, un comportement observable par cas, en langage métier, relié aux
> user stories. Assertions sur : signaux `canUndo()/canRedo()`, `undo()` + `last()` (contenu restauré),
> `emitted.length` (absence d'émission parasite), et un **espion léger** `vi.spyOn(component['history'],
> 'reset')` (Q4 figé) — seul accès à un membre non public, pour pincer la branche de garde, aligné sur le
> Lot B (TB5.6/TB6.3).

### Groupe 1 — Echo : l'historique **survit** (R1, US6) — *cœur du Lot C*
- **TC1.1 (echo après une commande n'efface pas l'historique)** `setBlocks([texte])`, `selectInBlock`,
  `applyMark('bold')` (⇒ `canUndo()` vrai). Puis **`echoBack()`** (réinjecte `last()` = la même
  référence émise). **Attendu :** `canUndo()` **reste** `true` ; un `undo()` ré-émet le modèle **d'avant
  le gras** (`last()[0].marks` **vide**). *(la garde a bien reconnu l'echo — pas de reset.)*
- **TC1.2 (echo n'appelle pas `reset`)** même montée qu'en TC1.1 avec
  `vi.spyOn(component['history'], 'reset')` posé **après** le `setBlocks` initial ; après `echoBack()` :
  `reset` **n'a pas été appelé** (0 fois). *(pince la branche de garde côté echo — Q4.)*
- **TC1.3 (echo après une salve de frappe)** *(réutilise `typeKey` + seam `now`)* amorcer une salve
  (`typeKey` ×2–3, même mot), `canUndo()` vrai, puis `echoBack()` : `canUndo()` **reste** `true` et un
  `undo()` retire **toute la salve** (`last()[0].text` = texte d'avant la salve). *(la frappe passe aussi
  par `emit` → l'echo doit être neutralisé de la même façon.)*

### Groupe 2 — (Re)chargement réel : l'historique est **réinitialisé** (US6, D7)
- **TC2.1 (rechargement vide le passé & le futur)** `setBlocks([A])`, `applyMark('bold')` (⇒ `canUndo()`
  vrai). Puis `setBlocks([B])` (**nouvelle** référence, autre contenu). **Attendu :** `canUndo()` =
  `canRedo()` = `false`.
- **TC2.2 (l'undo ne remonte plus à l'ancienne note)** dans la foulée de TC2.1, `const n =
  emitted.length; component.undo();` : **sans effet** — `emitted.length` **inchangé** et le DOM affiche
  toujours `[B]` (aucun retour au contenu `[A]`). *(D7 : l'historique de l'ancienne note est perdu.)*
- **TC2.3 (rechargement après un undo purge aussi le futur)** `setBlocks([A])`, `applyMark('bold')`,
  `undo()` (⇒ `canRedo()` vrai), puis `setBlocks([B])` : `canRedo()` **redevient** `false` et un `redo()`
  est **sans effet** (`emitted.length` inchangé). *(reset purge passé **et** futur — D7.)*
- **TC2.4 (rechargement appelle `reset` une fois)** `vi.spyOn(component['history'], 'reset')` ;
  `setBlocks([B])` après un historique non vide ⇒ `reset` appelé **une** fois avec un pas dont le `model`
  est le contenu **rechargé** (`[B]`) et `selection: null`. *(pince la branche de garde côté rechargement
  — Q4.)*

### Groupe 3 — Seed propre : la note rechargée est **annulable dès sa 1ʳᵉ action** (DC4)
- **TC3.1** `setBlocks([A])`, une commande, puis `setBlocks([B texte])` (rechargement, historique reset).
  Sur la note `[B]` : `selectInBlock`, `applyMark('bold')` ⇒ `canUndo()` vrai ; `undo()` ramène **`[B]`
  tel que rechargé** (`last()[0].marks` vide, contenu = `[B]`), et `canUndo()` **redevient** `false` (on
  est au pas initial rechargé). *(le seed « propre » sert de fond d'annulation — cohérent DB4.)*

### Groupe 4 — Premier chargement (initial) — *(Q2 = inclus)*
- **TC4.1 (le tout premier `setBlocks` amorce sans passé)** au montage, **avant** tout `setBlocks` puis
  après un premier `setBlocks([A])` : `canUndo()` = `canRedo()` = `false` (rien à annuler ; l'historique
  est amorcé eager sur `[A]`). *(documente que le reset par note couvre aussi le premier rendu ; ancre le
  comportement initial en complément de TB1.1 du Lot B.)*

---

## 5. Contrat DOM / API (ciblés par les tests)

> Le Lot C ne touche **aucun markup** : il agit dans l'`effect`. Les cibles sont l'**API/les signaux** du
> composant et l'**input `blocks`** (via `setInput`).

| Cible | Type | Rôle / attendu au Lot C |
|---|---|---|
| `component.canUndo()` / `canRedo()` | signaux `boolean` (publics) | echo : **inchangés** ; rechargement : repassent **faux**. |
| `component.undo()` / `redo()` | méthodes publiques | echo : fonctionnent encore ; rechargement : **sans effet** (historique vidé). |
| input `blocks` (`setInput('blocks', …)`) | entrée du composant | **même référence** (= `last()`) ⇒ echo ; **nouvelle référence** ⇒ rechargement. |
| `blocksChange` / `emitted` / `last()` | sortie observée | `last()` = référence à réinjecter pour l'echo ; `emitted.length` prouve l'absence d'undo/redo parasite. |
| *(interne, Q4)* `component['history'].reset` | espion `vi.spyOn` | **non appelé** à l'echo (TC1.2) ; **appelé une fois** au rechargement (TC2.4). |

**Imports de types (tests) :** `NoteBlock`, `TextBlock` depuis `core/models/document.model` (déjà
importés par le spec). Aucun nouvel import requis pour la voie boîte noire.

---

## 6. Ordre d'implémentation TDD suggéré (rouge → vert → refactor)

1. **Groupe 2** (rechargement ⇒ reset) — introduit la branche `if (!isEcho) history.reset + syncButtons`
   dans l'effect ; cas les plus directs à passer au vert.
2. **Groupe 1** (echo ⇒ pas de reset) — introduit la **garde** `isEcho = incoming === model()` ; le cas
   qui **échouerait** sans garde (R1) → cœur de la valeur du lot.
3. **Groupe 3** (seed propre) — vérifie la cohérence reset ↔ amorçage (DC4/DC7).
4. **Groupe 4** (initial) — ancre le comportement au premier chargement (Q2 inclus).

> **Rappel builder (mémoire projet) :** `@angular/build:unit-test` (Vitest) compile **tout le bundle en
> une passe** ; `node` hors PATH (node bundlé LMStudio) ; `node_modules` root-owned (pas d'install). Le
> Lot C **ne modifie pas la signature publique** du composant (il agit dans l'effect) → **pas** de risque
> `TS2339/TS2554` : les nouveaux cas peuvent être écrits directement (rouge d'assertions, pas de TS).

---

## 7. Arbitrages figés (arbitrage utilisateur du 2026-09-20)

> Les 5 points de cadrage sont **tranchés**. Le plan est **sans ambiguïté**, prêt pour `ecrire_tests`.
> Ils structurent les décisions DC1–DC7 (§3) et les cas TC1–TC4 (§4).

- **Q1 — Simulation echo vs rechargement → FIGÉ : via l'input `blocks` uniquement.** Echo =
  `fixture.componentRef.setInput('blocks', last())` (**même référence** que l'emit, car
  `commit`/`onInput`/`applyEntry` émettent `newModel === model()`) + `detectChanges()` ; rechargement =
  `setBlocks(nouveauTableau)` (**nouvelle** référence). On s'appuie sur l'invariant **`last() ===
  model()`** (vrai par construction). Un **helper `echoBack()`** partagé réinjecte la référence émise.
  *(fige §2, DC1/DC2, TC1.1/TC1.3.)* ✅

- **Q2 — Cas du premier chargement (Groupe 4) → FIGÉ : inclus.** `TC4.1` documente le comportement
  initial (le reset par note couvre aussi le premier rendu : `canUndo()/canRedo()` faux après le tout
  premier `setBlocks`), en complément de TB1.1 du Lot B — peu coûteux (1 cas). *(fige le Groupe 4.)* ✅

- **Q3 — Amorçage `historySeeded` → FIGÉ : DC7 (amorçage EAGER au rechargement).** Le reset de l'effect
  pose `historySeeded = true` (et annule un `cancelSeal` en attente, cf. pièges), pour **éviter un double
  amorçage** avec le mécanisme paresseux du Lot B. Après Lot C, le premier `setBlocks(...)` **amorce
  l'historique dans l'effect** (eager), là où le Lot B s'appuyait sur l'amorçage **paresseux à la 1ʳᵉ
  action**. **Non-régression Lot B (tracée) :** TB1.1/TB2.1/TB3.5 **restent verts** — à la 1ʳᵉ action,
  `previousModel === modèle rechargé`, donc empiler sur le pas initial eager donne le **même** état
  observable que le seed paresseux. **Action liée figée :** ajuster le **libellé de TB1.1** (« historique
  à froid, pas encore amorcé ») pour rester conceptuellement exact sous les deux amorçages (paresseux Lot
  B / eager au (re)chargement Lot C). *(fige DC7 + l'ajustement TB1.1.)* ✅

- **Q4 — Espion léger sur `history.reset` → FIGÉ : oui.** On ajoute `TC1.2` (echo : `reset` **0 appel**)
  et `TC2.4` (rechargement : `reset` **1 appel**, pas dont `model` = contenu rechargé, `selection: null`)
  via `vi.spyOn(component['history'], 'reset')`, cohérent avec la façon dont le Lot B espionne
  `recordTyping`/`seal` (TB5.6/TB6.3). *(fige DC2/DC3, TC1.2, TC2.4.)* ✅

- **Q5 — Ordre `model()` avant `model.set` → FIGÉ : pas de cas dédié.** DC1 reste un **détail
  d'implémentation** (couvert **implicitement** par TC1.1/TC1.2 : sans cet ordre, l'echo ne serait jamais
  détecté et ces cas échoueraient). Rappel R4 (approche §4) : la garde **par référence** (et non par
  drapeau) est insensible à l'asynchronie du re-déclenchement de l'effect — robustesse recherchée. *(fige
  l'absence de cas Q5.)* ✅

**Pièges conservés (non bloquants, à respecter par `ecrire_tests`) :**
- **Effect flush :** `setBlocks`/`echoBack()` appellent `fixture.detectChanges()` qui **flush les
  effects** → reset/garde s'exécutent **synchroniquement** dans le test (déterministe). Si un cas
  n'utilise pas `setBlocks`, prévoir `fixture.detectChanges()` après `setInput`.
- **Reload pendant une salve ouverte (figé Q3) :** un rechargement alors qu'un timer de pause est armé —
  la branche reset **annule `cancelSeal?.()`** avant `history.reset`, pour ne pas sceller une salve de
  l'**ancienne** note (un `seal()` tardif retomberait de toute façon sur un historique sans run, mais on
  annule proprement). Testable en réutilisant le seam `scheduleSeal` du Lot B si besoin.
- **Garde `document.activeElement !== editor` (paint) :** inchangée par le Lot C ; le reset est
  **indépendant** du repaint (il s'exécute que l'éditeur soit focus ou non).

---

## Fichiers concernés

- **Sous test / à étendre :**
  `frontend/src/app/rich-text-editor/rich-text-editor.spec.ts` (nouveau bloc `Undo/Redo (Lot C — garde
  anti-echo & reset par note)`, cas TC1–TC4).
- **Implémentation (hors de ce plan, par la suite) :**
  `frontend/src/app/rich-text-editor/rich-text-editor.ts` (garde C4 dans l'`effect` du constructeur :
  `isEcho = incoming === model()` **lu avant `model.set`** ; branche reload → `cancelSeal?.()` +
  `history.reset` + `historySeeded = true` + `syncButtons`).
- **Ajustement Lot B (Q3) :** libellé de `TB1.1` dans `rich-text-editor.spec.ts` reformulé pour rester
  exact sous l'amorçage eager (aucune assertion modifiée).
- **Réutilisés (inchangés) :** `frontend/src/app/core/services/edit-history.ts` (Lot A, `reset` D7),
  `document.model.ts` (`DocModel`, `NoteBlock`, `TextBlock`).
- **Lots voisins :** Lot B (`PLAN_TESTS_RTE_UNDO_REDO.md`, vert), Lot D (boutons de barre, hors périmètre).
