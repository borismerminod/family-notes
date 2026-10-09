# Revue de code — `kanban-list.ts` et `kanban-service.ts`

**Date :** 2026-10-09
**Statut :** brouillon — à valider
**Périmètre demandé :** les deux fichiers
[`kanban-list/kanban-list.ts`](../../../frontend/src/app/kanban-list/kanban-list.ts) et
[`core/services/kanban-service.ts`](../../../frontend/src/app/core/services/kanban-service.ts).
Le gabarit, la feuille de style et `app.routes.ts` ne sont **pas** audités ; ils n'apparaissent
qu'en §« Constats adjacents » quand un constat sur les deux fichiers s'y prolonge.
**Références :** [`FEATURE_KANBAN_CRUD.md`](FEATURE_KANBAN_CRUD.md) ·
[`APPROCHE_KANBAN_CRUD.md`](APPROCHE_KANBAN_CRUD.md) ·
[`PLAN_TESTS_KANBAN_CRUD.md`](PLAN_TESTS_KANBAN_CRUD.md)
**Skill :** [`revue_fonctionnalite`](../../skill/revue_fonctionnalite/SKILL.md)
**Jumeaux de référence :** [`note-list.ts`](../../../frontend/src/app/note-list/note-list.ts),
[`notes-service.ts`](../../../frontend/src/app/core/services/notes-service.ts),
[`calendar-service.ts`](../../../frontend/src/app/core/services/calendar-service.ts)
**Filet lu comme contrat (non audité) :** `kanban-list.spec.ts` (groupes 6 à 11, pilotés par le
DOM), `kanban-service.spec.ts` (groupes 2 à 5 + T1.3).

**État du filet au 2026-10-09** (`ng test --watch=false`) : **450 tests verts / 452**, 0
`unhandled`. Les **2 échecs sont antérieurs et étrangers au kanban** — `calendar.spec.ts > should
create` (`NG0201: No provider found for ActivatedRoute`) et `category-selector.spec.ts >
should display the correct placeholder on initialization`. **Les deux suites kanban passent
intégralement** : le filet qui protégerait les refactorings ci-dessous est donc opérationnel, mais
la ligne de base n'est pas « tout vert » et il faudra la noter telle quelle avant d'appliquer
quoi que ce soit (étape 0 du skill [`appliquer_refactoring`](../../skill/appliquer_refactoring/SKILL.md)).

---

## Synthèse

**Les deux fichiers sont sains.** Aucun bug fonctionnel détecté à la lecture, aucune dérive par
rapport à la SPEC ni aux décisions `D-K#` révisées le 2026-10-07. Le refactoring nécessaire est
**faible et surtout cosmétique** : l'essentiel des constats porte sur des **commentaires devenus
faux** pendant le TDD, pas sur la structure.

Points remarquables, sains :

- **Le service ne porte plus de SQL de schéma** : `CREATE TABLE` vit dans
  `assets/migrations/schema_kanban.sql` et l'en-tête du service le dit explicitement
  ([`kanban-service.ts:5-9`](../../../frontend/src/app/core/services/kanban-service.ts:5)) —
  conforme à la convention projet (mémoire `db-migrations-in-sql-assets`).
- **Réutilisation maximale de l'existant** : `KanbanService` hérite de `SqliteService` (garde
  `ready`, `runQuery`, `persist`) et n'ajoute que ses quatre requêtes ; la page réutilise
  `ConfirmDialog` **sans le modifier**, comme prévu.
- **Méthodes courtes, une responsabilité chacune**, et validation du nom factorisée dans
  `requireName` ([`kanban-service.ts:99`](../../../frontend/src/app/core/services/kanban-service.ts:99)),
  appelée **avant** `runQuery` : un nom refusé n'ouvre aucune transaction (T3.4, T4.2).
- **Décisions respectées à la lettre** : `created_at` jamais exposée (D-K1), aucun contrôle
  d'unicité (D-K4), mise à jour de la liste **après** succès en base et retrait en place plutôt
  que rechargement (D-K7), aucune écriture au clic sur « + » (D-K11), routes `/kanban/new` et
  `/kanban/edit/:id` (D-K12).
- **Hygiène asynchrone** : toutes les méthodes `async` de la page avalent leur erreur
  (`try/catch`), donc aucun rejet non géré possible depuis le gabarit — et le bandeau d'erreur
  visible est bien l'écart assumé avec « Mes Notes », qui se contente de la console.
- **Conventions de commentaires respectées** : zéro commentaire dans le corps des fonctions,
  explication dans l'en-tête JSDoc (mémoire `no-inline-comments-in-function-bodies`).

---

## Constats

### C1 — En-tête de la page : suivi d'avancement TDD figé dans le code *(cosmétique)*

[`kanban-list.ts:19-20`](../../../frontend/src/app/kanban-list/kanban-list.ts:19) : « *Built test
group by test group against `PLAN_TESTS_KANBAN_CRUD.md`, part B. Done so far: groupes 6 to 11,
which closes part B.* » C'est un **état de chantier**, vrai au moment de la livraison, qui
deviendra faux dès le prochain lot (écran d'édition, listes, cartes). L'information utile
durablement est la **référence au plan**, pas le compteur de groupes.
**Impact :** lisibilité ; commentaire à péremption programmée.

### C2 — Commentaire contredit par le code juste en dessous *(cosmétique, mais trompeur)*

[`kanban-list.ts:120`](../../../frontend/src/app/kanban-list/kanban-list.ts:120) : « *A failure is
only logged for now; showing it on screen belongs to groupe 11.* » Le groupe 11 **est livré** :
deux lignes plus bas, le même JSDoc dit l'inverse (« *says so in the error banner* ») et
[`kanban-list.ts:143`](../../../frontend/src/app/kanban-list/kanban-list.ts:143) fait bien
`actionError.set(...)`. Le même paragraphe affirme donc une chose et son contraire.
**Impact :** lisibilité ; un lecteur pressé conclut que l'échec n'est pas affiché.

### C3 — Le compteur du bandeau supérieur annonce « Aucun tableau » pendant le chargement et en erreur *(important)*

[`kanban-list.ts:53-59`](../../../frontend/src/app/kanban-list/kanban-list.ts:53) : `countLabel`
ne regarde que `kanbans()`, qui vaut `[]` **avant** la réponse de la source et **après** un échec.
Le gabarit affiche ce libellé **hors** du `@if` d'état
([`kanban-list.html:4`](../../../frontend/src/app/kanban-list/kanban-list.html:4)), donc l'écran
dit « Aucun tableau » **sous le titre** alors qu'il montre le spinner, puis « Aucun tableau » à
côté de « Impossible de charger les tableaux. » — où le nombre réel est précisément **inconnu**.
**Impact :** robustesse / UX — un message faux affirmé avec aplomb ; c'est le seul constat visible
par l'utilisateur. Non couvert par le filet : T6.4 n'asserte le compteur qu'après un chargement
réussi, T7.2 ne l'asserte pas.

### C4 — Le bandeau d'erreur de suppression survit à un rechargement *(mineur)*

`actionError` n'est effacé que par `onDeleteKanban`
([`kanban-list.ts:111`](../../../frontend/src/app/kanban-list/kanban-list.ts:111)), pas par
`loadKanbans` ([`kanban-list.ts:153`](../../../frontend/src/app/kanban-list/kanban-list.ts:153)).
Après un échec de suppression, un clic sur « Réessayer » relance le chargement **en gardant** le
bandeau « Impossible de supprimer le tableau. » au-dessus d'une liste fraîchement rechargée. Le
plan demande que le bandeau soit « effacé au début de l'action suivante » (T11.1, APPROCHE §3
Lot 2) ; un rechargement **est** une action suivante.
**Impact :** conformité au plan (lecture stricte de T11.1) ; message orphelin à l'écran.

### C5 — `stopPropagation` : la page s'écarte de son jumeau et de la signature prévue *(cosmétique)*

[`kanban-list.ts:110`](../../../frontend/src/app/kanban-list/kanban-list.ts:110) prend l'événement
DOM en paramètre (`onDeleteKanban(kanban, event)`) et l'arrête **en dernière instruction**
([`:114`](../../../frontend/src/app/kanban-list/kanban-list.ts:114)). Deux écarts, sans
conséquence fonctionnelle :
- le jumeau fait l'inverse — `(click)="onDeleteNote(note); $event.stopPropagation()"`
  ([`note-list.html:53`](../../../frontend/src/app/note-list/note-list.html:53)) — et garde le
  composant ignorant du DOM ;
- l'APPROCHE prévoyait `onDeleteKanban(kanban)` (§1, diagramme de classes).

Placer l'arrêt en dernier est correct ici (aucun `return` anticipé ne le court-circuite), mais
l'ordre « j'arrête la propagation, puis je traite » se relit mieux et résiste à l'ajout d'un
garde.
**Impact :** cohérence avec le code voisin ; micro-couplage de la page au DOM.

### C6 — `KanbanList` est un quasi-clone de `NoteList` *(important — mais à différer)*

La mécanique « charger / spinner / erreur + Réessayer / mémoriser la cible / confirmer /
supprimer / retirer en place » est **identique** à
[`note-list.ts:88-166`](../../../frontend/src/app/note-list/note-list.ts:88) : mêmes cinq signaux,
même `confirmMessage` calculé, même `onDeleteConfirmed` au `filter` près. Seules diffèrent les
spécificités réelles (compteur, bandeau visible, carte cliquable vs `routerLink`, recherche et
couleur d'accent côté notes).
**Impact :** duplication structurelle — une correction de comportement devra être faite deux fois.
**Mais :** la **règle de trois** n'est pas atteinte (deux pages), le projet a déjà tranché dans ce
sens pour un cas analogue (`REVUE_INSERTION_LIEN.md`, C5), et l'abstraction toucherait `note-list`
— hors du périmètre demandé. À réévaluer quand une **troisième** page de liste apparaîtra.

### C7 — Constructeur vide `constructor() { super(); }` *(cosmétique — convention projet)*

[`kanban-service.ts:14-16`](../../../frontend/src/app/core/services/kanban-service.ts:14) : sans
paramètre ni instruction propre, ce constructeur est implicite en TypeScript, donc supprimable.
**Mais** il est présent **à l'identique** dans `notes-service.ts:27`, `calendar-service.ts:13` et
`categories.service.ts:9` : le retirer du seul `KanbanService` échangerait une redondance contre
une incohérence.
**Impact :** nul ; à traiter à l'échelle des quatre services, ou pas du tout.

### C8 — Lignes de base typées `any` *(cosmétique — convention projet)*

[`kanban-service.ts:27`](../../../frontend/src/app/core/services/kanban-service.ts:27) et
[`:113`](../../../frontend/src/app/core/services/kanban-service.ts:113) manipulent la ligne SQLite
en `any`. Un type local (`id`, `name`, `updated_at`) donnerait une vraie vérification au point de
conversion. **Mais** c'est exactement ce que font `notes-service.ts:167`,
`calendar-service.ts:23` et `categories.service.ts:21` : même remarque qu'en C7, le sujet est
**transversal**, pas kanban.
**Impact :** typage faible localisé au mapping ; sans risque réel (une seule requête produit ces
lignes, juste au-dessus).

### C9 — « Kanban introuvable » journalisé comme une erreur technique *(cosmétique)*

[`kanban-service.ts:70-72`](../../../frontend/src/app/core/services/kanban-service.ts:70) lève
l'erreur **dans** `runQuery`, qui la journalise en `console.error('Erreur lors du renommage du
kanban', …)` avant de la relancer. Or « le tableau a été supprimé entre-temps » est un **cas
métier attendu** (T4.3), pas une panne. À l'inverse, `requireName` lève **avant** `runQuery` et ne
journalise donc rien — deux refus voisins, deux traitements différents.
**Impact :** bruit dans la console ; asymétrie de traitement des refus. Aucun impact utilisateur.

### C10 — Les docs de cadrage décrivent encore `ensureSchema()` *(important — côté documentation)*

L'APPROCHE annonce une table créée « au démarrage du service » (D-K6) et fait figurer
`-ensureSchema()` dans le diagramme de classes (§1) ; le plan de test en tire T1.1 (création
idempotente) et T1.2 (sauvegarde après préparation). **La livraison a changé d'approche** — et en
mieux : le schéma est passé dans `assets/migrations/schema_kanban.sql`, exécuté par
`SchemaMigrationService`, conformément à la convention projet. Conséquences non répercutées :
`ensureSchema` n'existe pas, et **T1.1 / T1.2 n'ont pas de test** dans `kanban-service.spec.ts`
(seul T1.3 subsiste). Le **code a raison**, la **doc est en retard**.
**Impact :** conformité apparente au plan ; deux cas du plan de test semblent manquants alors
qu'ils ont changé de propriétaire.

### Constats adjacents *(hors des deux fichiers, mais ils les concernent)*

- **C11 — les routes que la page appelle n'existent pas encore** *(important — connu, lot 3)*.
  `onAddKanban` et `onOpenKanban` naviguent vers `/kanban/new` et `/kanban/edit/:id`
  ([`kanban-list.ts:85`](../../../frontend/src/app/kanban-list/kanban-list.ts:85) et
  [`:94`](../../../frontend/src/app/kanban-list/kanban-list.ts:94)) ; `app.routes.ts` ne déclare
  que `kanban`. Aujourd'hui, dans l'application réelle, « + » et un clic sur une carte tombent
  donc sur `path: '**'` et **renvoient l'utilisateur sur « Mes Notes »**. C'est la conséquence
  assumée du découpage (l'écran d'édition est le lot 3), et les tests de la page restent
  légitimement verts puisqu'ils espionnent le routeur. À garder en tête : ce n'est pas un défaut
  des deux fichiers, mais le lot n'est pas démontrable à la main sans le lot 3.
- **C12 — commentaire périmé dans `app.routes.ts`** *(cosmétique)* : « *pas de route de création,
  la saisie du nom se fait en popup (D-K2)* » (`app.routes.ts:27`) décrit la version **initiale**
  de D-K2, révisée le 2026-10-07 : il n'y a plus de popup de saisie.
- **C13 — en-tête périmé de la feuille de style** *(cosmétique)* : `kanban-list.css:6-9` annonce
  un état « minimal, limité au groupe 6 », les états vide et erreur, le bouton flottant et les
  popups « viendront avec les groupes qui les exigent ». Ils sont tous livrés.
- **C14 — le service n'a pas de lecture unitaire** *(informatif)* : pas de `getKanbanById(id)`,
  dont l'écran d'édition (lot 3) aura besoin pour `/kanban/edit/:id`. Ce n'est **pas** un manque
  de ce lot (rien ici n'en a l'usage) — simple note de traçabilité pour le lot suivant, à écrire
  en TDD et non « au passage » d'un refactoring.

---

## Refactorings proposés

### R1 ← C2 — Retirer la phrase contredite par le code *(quick win, risque nul)*

Supprimer « *A failure is only logged for now; showing it on screen belongs to groupe 11.* »
([`kanban-list.ts:120`](../../../frontend/src/app/kanban-list/kanban-list.ts:120)) ; le reste du
JSDoc décrit déjà le comportement réel.
**Fichier :** `kanban-list.ts`. **Filet :** aucun (commentaire). **Priorité :** haute.
**Effort :** ~1 min.

### R2 ← C1 — Remplacer le suivi d'avancement par une référence stable *(quick win, risque nul)*

Dans l'en-tête de classe, garder la référence au plan de test et retirer le compteur de groupes
(« *Done so far: groupes 6 to 11…* »,
[`kanban-list.ts:19-20`](../../../frontend/src/app/kanban-list/kanban-list.ts:19)). L'avancement
se lit dans les docs `.agent` et l'historique Git, pas dans l'en-tête d'un composant.
**Fichier :** `kanban-list.ts`. **Filet :** aucun. **Priorité :** haute. **Effort :** ~2 min.

### R3 ← C3 — Ne montrer le compteur que lorsqu'il dit vrai *(correctif de finition)*

Deux options, à trancher (voir §Points à trancher) :
- **(a) côté gabarit** — entourer `<p class="count">` d'un `@if (!isLoading() && !loadError())`
  ([`kanban-list.html:4`](../../../frontend/src/app/kanban-list/kanban-list.html:4)) ; le signal
  calculé reste inchangé ;
- **(b) côté composant** — faire renvoyer `''` à `countLabel` dans ces deux états
  ([`kanban-list.ts:53`](../../../frontend/src/app/kanban-list/kanban-list.ts:53)), le gabarit
  n'affichant le paragraphe que si le libellé est non vide.

**Fichiers :** `kanban-list.ts` et/ou `.html`. **Risque de régression :** faible.
**Filet :** T6.4 (le compteur après chargement réussi, cas inchangé) et T7.2 (état d'erreur) —
**les deux restent verts sans retouche** : T6.4 n'asserte le compteur qu'après succès, et T7.2
vérifie l'absence du message « vide », pas celle du compteur. Le nouveau comportement (compteur
absent pendant le chargement et en erreur) **n'est en revanche asserté par personne** : si on veut
le figer, c'est un cas à ajouter en TDD via `ecrire_tests`, pas une assertion à glisser ici.
**Priorité :** haute (seul constat visible à l'écran). **Effort :** ~10 min.

### R4 ← C4 — Effacer le bandeau d'action au début d'un rechargement *(quick win, risque faible)*

Ajouter `this.actionError.set('')` en tête de `loadKanbans`
([`kanban-list.ts:153`](../../../frontend/src/app/kanban-list/kanban-list.ts:153)), à côté des
remises à zéro déjà présentes, et compléter le JSDoc.
**Fichier :** `kanban-list.ts`. **Filet :** T11.1 et T10.5 restent verts (ils passent par la
suppression, pas par le rechargement) ; T7.3 (« Réessayer ») ne regarde pas le bandeau. Là encore,
le comportement **ajouté** n'est couvert par aucun cas : à figer par un test dédié si on le juge
contractuel.
**Priorité :** moyenne. **Effort :** ~5 min.

### R5 ← C5 — Aligner l'arrêt de la propagation sur `note-list` *(cosmétique, risque faible)*

Déplacer `stopPropagation` dans le gabarit —
`(click)="onDeleteKanban(kanban); $event.stopPropagation()"` — et ramener la signature à
`onDeleteKanban(kanban)`, celle du diagramme de classes. Variante minimale si l'on préfère garder
l'événement dans le composant : remonter `event.stopPropagation()` en **première** instruction.
**Fichiers :** `kanban-list.ts`, `kanban-list.html`. **Risque :** faible — c'est le point de
vigilance n°1 de l'APPROCHE §4, à ne pas casser.
**Filet :** **solide** — T10.6 asserte explicitement que la corbeille n'ouvre pas l'écran
d'édition, et T10.1/T10.2 passent par un vrai clic DOM sur `.btn-danger` ; aucun test n'appelle
`onDeleteKanban` directement, donc changer sa signature **ne touche aucun `.spec.ts`**.
**Priorité :** basse. **Effort :** ~5 min.

### R6 ← C10 — Remettre les docs de cadrage au niveau du code livré *(documentation, risque nul)*

Dans `APPROCHE_KANBAN_CRUD.md` : réviser D-K6 et retirer `ensureSchema()` du diagramme §1 au
profit de `SchemaMigrationService` + `assets/migrations/schema_kanban.sql` (en datant la révision,
comme les autres `D-K#`). Dans `PLAN_TESTS_KANBAN_CRUD.md` : marquer T1.1 et T1.2 comme
transférées au plan de test de `SchemaMigrationService`, T1.3 restant au service.
**Fichiers :** les deux `.md` (aucun code). **Filet :** sans objet. **Priorité :** haute (c'est ce
qui fausse aujourd'hui la lecture de la conformité). **Effort :** ~15 min.

### R7 ← C12, C13 — Nettoyer les deux commentaires périmés voisins *(quick win, risque nul)*

Corriger `app.routes.ts:27` (plus de popup de saisie depuis D-K2 révisée) et l'en-tête de
`kanban-list.css:6-9` (tous les états annoncés « à venir » sont livrés). **Hors des deux fichiers
demandés** : à inclure ou non selon le périmètre souhaité.
**Filet :** aucun (commentaires). **Priorité :** basse. **Effort :** ~5 min.

### R8 ← C6 — *(reporté)* Factoriser le socle « page de liste supprimable »

Extraire la mécanique commune `KanbanList` / `NoteList` (chargement + confirmation de
suppression) dans une base ou un helper partagé.
**Fichiers :** `kanban-list.ts`, `note-list.ts`, + nouveau fichier. **Risque :** moyen — touche une
page **hors périmètre** et déjà livrée. **Filet :** `kanban-list.spec.ts` (groupes 6-11) et
`note-list.spec.ts`, tous deux pilotés par le DOM, donc robustes à une réorganisation interne.
**Recommandation : ne pas le faire maintenant.** Deux occurrences ne justifient pas
l'abstraction ; la troisième page de liste la justifiera, et elle arrivera peut-être avec les
listes/cartes du kanban.

---

## Priorisation conseillée

| Ordre | `R#` | Pourquoi d'abord | Risque |
|---|---|---|---|
| 1 | **R1**, **R2** | Commentaires faux ou périssables, zéro impact comportemental | nul |
| 2 | **R6** | Tant que la doc parle d'`ensureSchema`, toute revue ultérieure repart d'une fausse piste | nul (docs) |
| 3 | **R3** | Seul constat **visible** par l'utilisateur | faible |
| 4 | **R4** | Lecture stricte de T11.1 | faible |
| 5 | **R5** | Cohérence avec `note-list` ; filet solide (T10.6) | faible |
| 6 | **R7** | Dépend du périmètre accepté (hors des deux fichiers) | nul |
| — | **R8** | **Reporté** : règle de trois non atteinte | moyen |

**Explicitement hors périmètre :** C7 (constructeur vide) et C8 (`row: any`) — réels mais
**transversaux aux quatre services** ; les traiter ici créerait une incohérence locale. À reprendre
comme chantier « hygiène des services SQLite », ou à laisser tels quels. C9 est un ajustement de
journalisation qui touche `SqliteService` ou la frontière d'erreur du service : à ne faire que si
le bruit console gêne. C14 (`getKanbanById`) est un **ajout de fonctionnalité** pour le lot 3, pas
un refactoring : il se traite en TDD via `dev_par_groupes`.

**Rappel de méthode :** R3 et R4 **ajoutent** un comportement observable (un libellé qui disparaît,
un bandeau qui s'efface). Au sens strict du skill `appliquer_refactoring`, ce ne sont donc pas des
refactorings purs : si l'on veut les figer, le cas de test s'écrit **avant** (via `ecrire_tests`).
R1, R2, R5, R6 et R7, eux, sont à comportement rigoureusement identique.

---

## Points à trancher

1. **R3 — gabarit ou composant ?** Option (a) garde `countLabel` pur et met la condition
   d'affichage là où vivent déjà les états (`@if` du gabarit) ; option (b) centralise la règle dans
   le composant, testable sans DOM. *Recommandation : (a)* — c'est le gabarit qui décide déjà quoi
   montrer dans chaque état.
2. **R3/R4 — figer ou non le nouveau comportement par un test ?** Ces deux finitions sont
   aujourd'hui dans l'angle mort du plan. Les asserter les rend contractuelles ; les laisser nues
   permet de les ajuster à l'usage.
3. **R7 — élargit-on le périmètre** aux deux commentaires périmés voisins (`app.routes.ts`,
   `kanban-list.css`), ou s'en tient-on strictement aux deux fichiers demandés ?
4. **C7/C8 — ouvre-t-on un chantier « hygiène des services SQLite »** (constructeurs vides, lignes
   `any`) sur les quatre services d'un coup ? Sinon, ces deux constats sont à classer *accepté en
   l'état*.
5. **D-K8 (libellé de date relatif)** reste une **option non tranchée** de l'APPROCHE. La page
   affiche aujourd'hui `date:'shortDate'`, strictement comme « Mes Notes » — donc conforme au
   choix par défaut. Rien à refactorer tant que l'option n'est pas retenue.
