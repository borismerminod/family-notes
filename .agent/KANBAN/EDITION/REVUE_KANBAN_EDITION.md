# Revue de fonctionnalité — Kanban : écran d'édition d'un tableau

> **Date :** 2026-11-04 · **Statut :** **validé le 2026-11-04** — refactoring en cours (`R1`, `R3`, `R4`, `R5`, `R6` appliqués ; reste `R7`)
> **SPEC :** [`FEATURE_KANBAN_EDITION.md`](FEATURE_KANBAN_EDITION.md) (US1 → US5) ·
> **Approche :** [`APPROCHE_KANBAN_EDITION.md`](APPROCHE_KANBAN_EDITION.md) (`D-E1` → `D-E13`) ·
> **Plan de test :** [`PLAN_TESTS_KANBAN_EDITION.md`](PLAN_TESTS_KANBAN_EDITION.md)
> (`D1` → `D9`, cas `T1.x` → `T10.x`) ·
> **Maquette :** [`MAQUETTE_KANBAN_EDITOR.html`](MAQUETTE_KANBAN_EDITOR.html)
> **Docs de référence :** [`DIAGRAMME_CLASSES_KANBAN.md`](../../DIAGRAMME_CLASSES_KANBAN.md),
> [`REVUE_KANBAN_CRUD.md`](../CRUD/REVUE_KANBAN_CRUD.md) (`C11`, `C12`, `C14`)

**Périmètre revu** — les commits `f40806e` → `026ee4f` de la branche `kanban`, fichiers
d'**implémentation** seulement :

| Fichier | État |
|---|---|
| [`kanban-editor.ts`](../../../frontend/src/app/kanban-editor/kanban-editor.ts) | créé (226 l.) |
| [`kanban-editor.html`](../../../frontend/src/app/kanban-editor/kanban-editor.html) | créé (96 l.) |
| [`kanban-editor.css`](../../../frontend/src/app/kanban-editor/kanban-editor.css) | créé (285 l.) |
| [`kanban-service.ts`](../../../frontend/src/app/core/services/kanban-service.ts) | étendu (`getKanbanById`, +17 l.) |
| [`app.routes.ts`](../../../frontend/src/app/app.routes.ts) | étendu (2 routes + commentaire `C12`, +14 l.) |
| [`kanban-list.html`](../../../frontend/src/app/kanban-list/kanban-list.html) · [`kanban-list.css`](../../../frontend/src/app/kanban-list/kanban-list.css) | retouchés (icônes) — **hors périmètre annoncé**, cf. `C8` |

Les `.spec.ts` ont été **lus comme contrat de comportement** et ne sont pas l'objet de la revue,
sauf là où un cas du plan **manque** (`C1`).

**État de la suite au 2026-11-04** : `496 passés / 2 échoués` sur 22 fichiers. Les deux échecs
(`calendar.spec.ts > should create`, `category-selector.spec.ts > placeholder`) sont les échecs
**préexistants** de la branche, étrangers à ce lot — la suite saine est bien à 2 échecs.

---

## 1. Synthèse

Le lot est **livré et conforme**. Les treize décisions de l'approche (`D-E1` → `D-E13`) et les neuf
du plan de test (`D1` → `D9`) se retrouvent toutes dans le code, y compris les deux révisions
tardives — `D-E4` (bloc « Tableau introuvable. » au lieu d'une redirection silencieuse) et `D3`
(deux boutons sur l'erreur de chargement). Le **contrat DOM du §7 du plan est honoré
intégralement**, sélecteur par sélecteur : c'était l'écart reproché à `kanban-list`, il ne se
reproduit pas ici.

Ce qui est franchement sain :

- **la détection de modification en attente est un état dérivé** (`computed`, `kanban-editor.ts:84`)
  et non un drapeau : il n'y a rien à remettre à zéro, exactement ce que `D-E3` demandait ;
- **le piège le plus facile à oublier est évité** : le nom de départ est rafraîchi *avant* l'appel
  au routeur (`kanban-editor.ts:121-123`), ce qui rend `E19` observable (`D5`) ;
- **aucune écriture à l'ouverture**, dans les deux modes, et aucune lecture en mode création
  (`ngOnInit`, `kanban-editor.ts:95-102`) : pas de tableau fantôme ;
- **`getKanbanById` passe par `runQuery`** comme les autres lectures, renvoie `null` sans lever, et
  ne duplique aucun SQL de schéma — la convention « migrations en `.sql`, jamais de SQL en TS »
  tient ;
- **les règles de code du projet sont respectées** : JSDoc en anglais sur chaque classe, attribut et
  fonction, **aucun commentaire dans un corps de fonction**, variables intermédiaires nommées
  (`nameToSave`, `trimmedName`, `saved`), aucun appel imbriqué, aucun code mort laissé par le TDD ;
- **l'accessibilité est au-dessus de l'existant** : le champ de nom a une étiquette `sr-only`
  (`kanban-editor.html:64`) que `note-editor.html` n'a pas, `role="alert"` sur le bandeau d'échec,
  libellé accessible sur le bouton de retour ;
- **le commentaire périmé de `app.routes.ts`** (`C12` du lot `CRUD`) est bien corrigé, et les deux
  routes sont déclarées avant `path: ''` et `path: '**'` (`C11` fermé).

Les points saillants ne sont donc **pas** dans le code de l'écran, mais autour : **la partie A du
plan de test n'a jamais été écrite** alors que son code est livré (`C1`, le seul constat réellement
bloquant), et **deux documents du dépôt ont pris du retard sur le code** (diagramme de classes,
périmètre annoncé de l'approche). S'y ajoute une dette de style déjà assumée par écrit (`C4`) et
trois nettoyages cosmétiques. La maquette a elle aussi pris du retard, mais son rattrapage a été
**écarté à la relecture** (`C2`, retiré le 2026-11-04).

---

## 2. Constats

### C1 — `getKanbanById` est livré sans aucun test *(bloquant — résolu par `R1` le 2026-11-04)*

**Emplacement :** [`kanban-service.ts:38-46`](../../../frontend/src/app/core/services/kanban-service.ts) ·
[`kanban-service.spec.ts:8-14`](../../../frontend/src/app/core/services/kanban-service.spec.ts) (interface `KanbanServiceContract`) ·
`kanban-service.spec.ts:196-215` (cas « base non préparée »)

La **partie A du plan** — groupe 1, cas `T1.1` (tableau renvoyé converti), `T1.2` (`null` quand
aucune ligne), `T1.3` (erreur relancée) — **n'est pas implémentée**. Trois faits le confirment :

1. `kanban-service.spec.ts` ne contient aucun `describe('getKanbanById')` ;
2. l'interface `KanbanServiceContract` du spec, qui fixe le contrat cible du service, **ne déclare
   pas** la méthode ;
3. le cas « base non préparée » existant (`T1.3` du plan **`CRUD`**, ligne 197) exerce
   `getAllKanbans`, `createKanban`, `renameKanban` et `deleteKanban` — **pas** `getKanbanById`.

**Impact —** conformité au plan **et** robustesse. La couverture réelle de la méthode est **nulle** :
le §6 du plan prévoit que l'écran **double** `KanbanService`, donc les 46 cas verts de
`kanban-editor.spec.ts` ne traversent jamais ce code. Une régression y passerait inaperçue :
renvoyer `undefined` au lieu de `null` (le bloc `.not-found` ne s'afficherait plus), exposer
`created_at`, ou avaler l'erreur de base au lieu de la relancer (l'écran ne montrerait plus son
état d'erreur). C'est le **filet manquant** du lot, et il porte sur la brique que l'approche
désignait comme « première brique, écrite en TDD avant tout code d'écran ».

---

### C2 — ~~La maquette est périmée sur deux écrans~~ *(retiré le 2026-11-04)*

**Constat retiré à la relecture**, à la demande de l'utilisateur : la maquette a rempli son office
en fixant le contrat DOM avant le plan de test, et la resynchroniser après coup n'apporte rien. Le
code livré et le `§7` du plan de test sont désormais la référence du contrat DOM, pas la maquette.

*Conséquence assumée :* `MAQUETTE_KANBAN_EDITOR.html` reste en l'état — écran 6 à un seul bouton,
aucun écran montrant le bloc `.not-found`, icônes en `material-icons`. **Elle n'est plus une source
de vérité** : le lot « listes et cartes » devra lire le code, et non la maquette, pour l'état actuel
de l'écran. La consigne « *L'écran 6 de la maquette est à mettre à jour* » du `D3` du plan de test
tombe avec ce retrait (cf. `R4`).

---

### C3 — Les diagrammes de classes ignorent le lot *(important — résolu par `R3` le 2026-11-04)*

**Emplacement :** [`DIAGRAMME_CLASSES_KANBAN.md:220`](../../DIAGRAMME_CLASSES_KANBAN.md) ·
[`APPROCHE_KANBAN_EDITION.md §1`](APPROCHE_KANBAN_EDITION.md)

`DIAGRAMME_CLASSES_KANBAN.md` ne connaît **ni** `KanbanEditor` **ni** `getKanbanById` : il porte
encore le constat `E4`, « *Pas de lecture unitaire : aucun `getKanbanById(id)` […] Absent du code,
donc absent du diagramme* ». Le code dit l'inverse depuis `8d099eb`.

Le diagramme de l'**approche** a le même retard d'un cran : il déclare `loadError`, `saveError` et
`goToList`, mais **ni `notFound` ni `onRetry`**, tous deux nés des révisions `D-E4` (2026-10-11)
et `D3`.

**Impact —** documentation et conformité : c'est le livrable attendu du skill `diagramme_classes`,
et le prochain agent qui lira le diagramme croira l'écran inexistant.

---

### C4 — Tokens et blocs d'état dupliqués entre quatre feuilles de style *(important)*

**Emplacement :** [`kanban-editor.css:11-39`](../../../frontend/src/app/kanban-editor/kanban-editor.css)
(palette), `:149-234` (spinner, `.empty`, `.btn-retry`, `@keyframes spin`), `:269-285` (machinerie
`.icon`) — mêmes blocs dans
[`kanban-list.css:163-234`](../../../frontend/src/app/kanban-list/kanban-list.css) et `:230-234`.

La palette (`--bg`, `--surface`, `--text`, `--text-2`, `--separator`, `--accent`, `--danger`,
`--radius`…) est **redéclarée dans quatre feuilles** : `note-list.css`, `note-editor.css`,
`kanban-list.css` et maintenant `kanban-editor.css`. S'y ajoutent, copiés à l'identique depuis
`kanban-list.css` : `.loading-overlay` + `.spinner` + `@keyframes spin`, le bloc `.empty` et sa
variante `.error-state .icon`, les boutons `.btn-retry`, et la machinerie de masque `.icon` avec
ses déclarations `--icon: url(...)`.

L'en-tête du fichier **assume le choix** (« *Tokens aligned on kanban-list.css / note-list.css
(redeclared, as they are not global)* ») : c'est une dette **connue**, pas un oubli. Le constat
porte sur le fait qu'elle vient de franchir le seuil de la quatrième copie.

**Impact —** duplication. Toute évolution de la palette, du spinner ou de l'état vide se fait
désormais en quatre endroits, sans aucun test pour signaler l'oubli d'un des quatre.

---

### C5 — `editing` est une seconde représentation de « mode édition » *(cosmétique — résolu par `R5` le 2026-11-04)*

**Emplacement :** [`kanban-editor.ts:57`](../../../frontend/src/app/kanban-editor/kanban-editor.ts)
(`editing`), `:87` (`kanbanId`), `:97` (l'un calculé depuis l'autre), `:209` (`writeKanban`)

Le même fait est porté deux fois : `editing` est un `signal<boolean>` **écrit une seule fois** à
partir de `kanbanId`, et jamais plus. Le gabarit lit `editing()` pour son titre, le code lit
`kanbanId` pour choisir entre création et renommage.

**Impact —** lisibilité, et risque de dérive silencieuse si l'un des deux venait à changer en cours
de vie de l'écran (ce que `D8` exclut aujourd'hui, mais que `§4` de l'approche signale déjà comme
« un piège si une future navigation interne apparaissait »).

---

### C6 — ~~`onSave` réécrit le nom affiché, ce que `D5` ne demande pas~~ *(constat **erroné**, corrigé le 2026-11-04)*

**Emplacement :** [`kanban-editor.ts:121`](../../../frontend/src/app/kanban-editor/kanban-editor.ts)

```
this.name.set(saved.name);
this.initialName.set(saved.name);
```

> ⚠️ **Ce constat était faux, et a été démenti en préparant `R6`.** Il est conservé ici — plutôt que
> supprimé — parce que l'erreur est instructive : elle montre une ligne qui *paraît* redondante et
> qu'un nettoyage « évident » aurait fait disparaître.

**Ce que le constat affirmait :** que la première ligne est sans effet sur `E19`, puisque
`hasPendingChanges` compare des valeurs **nettoyées** — poser `initialName` à `saved.name` suffirait
donc, y compris quand l'utilisateur a tapé `"  Courses  "`.

**Ce qui est vrai :** ce raisonnement **oublie le repli sur « Sans titre »** (`D-E2`). Si
l'utilisateur enregistre un champ **vide**, le service stocke « Sans titre » ; sans
`this.name.set(saved.name)`, le champ resterait `""` tandis que le nom de départ devient
« Sans titre » → `"" !== "Sans titre"` → **modification en attente fantôme**, et le bouton de
retour demanderait de confirmer une perte impossible. C'est une violation directe du critère d'`US4`
« *Après un enregistrement réussi, il n'y a plus de modification en attente* ».

**Vérifié le 2026-11-04**, pas déduit : la ligne retirée, la **suite reste verte** (499 / 2) — aucun
cas ne couvre ce chemin. Une sonde temporaire (mode édition, champ vidé, enregistrement réussi,
retour) **échoue** sans la ligne (`expected true to be false` sur `.confirm-backdrop`) et **passe**
avec. La sonde a ensuite été retirée.

**Impact —** aucun sur le code, qui était **correct**. Deux conséquences en revanche : la ligne
devait être **documentée** et non retirée (c'est ce qu'a fait `R6`), et le trou de couverture
qu'elle révèle est consigné en `C11`.

---

### C7 — Le littéral « Sans titre » vit à deux endroits *(cosmétique — résolu par `R6` le 2026-11-04)*

**Emplacement :** [`kanban-editor.ts:8`](../../../frontend/src/app/kanban-editor/kanban-editor.ts)
(`DEFAULT_NAME`) et [`kanban-editor.html:71`](../../../frontend/src/app/kanban-editor/kanban-editor.html)
(`placeholder="Sans titre"`)

La constante est correctement extraite côté classe, mais le gabarit retape la chaîne. `D-E2` lie
pourtant explicitement les deux usages (l'indication du champ **et** le repli à l'enregistrement
portent le même nom, et c'est le propos de la décision).

**Impact —** lisibilité, risque de divergence au premier changement de libellé.

---

### C8 — `KanbanList` a été modifié hors du périmètre annoncé *(cosmétique — résolu par `R4` le 2026-11-04)*

**Emplacement :** [`kanban-list.html:16`](../../../frontend/src/app/kanban-list/kanban-list.html)
et `:41` · [`kanban-list.css:166-234`](../../../frontend/src/app/kanban-list/kanban-list.css)

Le `§4` de l'approche annonce « **Aucune modification de `KanbanList`**, de `ConfirmDialog`, du
modèle `Kanban`, ni du schéma de la base ». Le lot a pourtant migré les icônes de la liste de
`material-icons` vers les masques SVG locaux.

Le geste est **justifié** : la police Material n'est chargée nulle part dans l'application
(`frontend/src/index.html` fait 13 lignes et ne la référence pas), donc ces `<span>` ne dessinaient
rien. Il est aussi **sans régression** : les tests de `kanban-list` sont restés verts, comme
l'anti-régression du plan l'exigeait. Mais la dérive n'est écrite **nulle part** — ni dans
l'approche, ni dans un commentaire.

**Impact —** conformité au plan : une dérive non documentée, bénigne mais invisible pour qui relira
l'approche comme source de vérité.

---

### C9 — Plus aucun cas ne protège le rafraîchissement de la date sur un enregistrement sans changement *(cosmétique — conséquence déjà assumée)*

**Emplacement :** [`PLAN_TESTS_KANBAN_EDITION.md`, groupe 6, note du 2026-11-03](PLAN_TESTS_KANBAN_EDITION.md) ·
[`kanban-editor.ts:115-128`](../../../frontend/src/app/kanban-editor/kanban-editor.ts)

Le plan le dit lui-même, et le dit bien : l'ancien `T6.4` a été retiré, et « *aucun cas ne garantit
plus qu'un enregistrement sans changement de nom rafraîchit la date de modification — une
implémentation qui court-circuiterait l'écriture quand `hasPendingChanges()` est faux ne serait
plus détectée* ».

**L'implémentation livrée est correcte** : `onSave` n'interroge jamais `hasPendingChanges`, donc le
renommage part toujours. Le constat ne porte donc que sur le **filet**, et il ne rouvre pas une
décision déjà prise : il la remet simplement sous les yeux, puisque `R6` ci-dessous touche
précisément à la frontière entre `kanbanId`, `editing` et `hasPendingChanges`.

**Impact —** robustesse de la couverture face à un refactoring futur.

---

### C10 — `scripts/README.md` est référencé par `AGENT.md` mais n'est pas versionné *(cosmétique — résolu par `R4` le 2026-11-04)*

**Emplacement :** [`AGENT.md:120`](../../AGENT.md) · `git status` : `?? scripts/README.md`

Le `§4` d'`AGENT.md` renvoie vers `scripts/README.md` pour la procédure
`npm run build` + `npx cap sync` après un changement de schéma. Le fichier existe sur le disque mais
est **non suivi par git**, alors que ses voisins `scripts/migration_check.sql` et
`scripts/seed_kanbans.sql` ont bien été commités sur cette branche.

**Impact —** documentation : le lien du point d'entrée du dépôt est mort pour tout nouveau clone.

---

### C11 — Le repli « Sans titre » n'est pas couvert côté « modification en attente » *(important — découvert le 2026-11-04)*

**Emplacement :** [`kanban-editor.ts:121`](../../../frontend/src/app/kanban-editor/kanban-editor.ts) ·
[`kanban-editor.spec.ts`, groupe 9](../../../frontend/src/app/kanban-editor/kanban-editor.spec.ts)

Découvert en vérifiant le filet de `R6` (cf. `C6`). Le critère d'`US4` « *Après un enregistrement
réussi, il n'y a plus de modification en attente* » est couvert par `T9.6`, mais **uniquement avec
un nom non vide** (« Travaux du garage »). Le chemin **champ vidé → enregistré sous « Sans titre »
→ retour** n'est couvert par **aucun cas**, alors que c'est précisément celui où le nom affiché et
le nom de départ divergent.

**Impact —** robustesse de la couverture. Mesuré, pas supposé : retirer
`this.name.set(saved.name)` laisse la suite **verte** tout en cassant un critère de la SPEC. C'est
le même genre de trou que `C1`, sur un invariant plus subtil.

**Refactoring associé :** aucun pour l'instant — ce serait l'ajout d'un cas `T9.9` au plan de test
(groupe 9), à décider (cf. `P6`). Le JSDoc d'`onSave` porte entre-temps un avertissement explicite
pour qu'un futur nettoyage ne retire pas la ligne.

---

## 3. Refactorings proposés

### R1 — Écrire la partie A du plan de test *(résout `C1`)* · **priorité 1 · effort faible** · **appliqué le 2026-11-04**

- **Objectif :** donner à `getKanbanById` le filet que le plan prévoyait, avant de clore le lot.
- **Transformation :** ajouter un `describe('getKanbanById')` à `kanban-service.spec.ts` couvrant
  `T1.1` (le tableau est renvoyé converti au modèle, `created_at` non exposée), `T1.2` (`null`
  quand aucune ligne ne porte l'identifiant) et `T1.3` (l'erreur de base est relancée) ; déclarer
  `getKanbanById(id): Promise<Kanban | null>` dans `KanbanServiceContract` ; étendre le cas
  « base non préparée » existant à cette quatrième lecture. **Sans toucher aux cas existants**
  (`D7`), et en assertant les **données renvoyées**, jamais la requête SQL (règle projet).
- **Fichiers touchés :** `core/services/kanban-service.spec.ts` **seul** — aucun code de production
  à changer, la méthode est déjà conforme à l'algorithme du lot A.
- **Risque de régression :** nul (ajout de tests). Seul risque : le montage partagé du spec, dont
  le `beforeEach` renvoie `{ values: [] }` par défaut — `T1.1` devra fournir sa propre ligne.
- **Filet :** les 17 cas existants de `kanban-service.spec.ts` doivent rester verts, et la suite
  complète rester à `2 failed`.
- **Réserve de méthode :** le code étant déjà écrit, ces trois cas sont des **tests de
  caractérisation**, pas du TDD. Les écrire quand même vaut mieux que de clore sans eux, mais il
  faut les lire avec cette réserve : ils figent le comportement observé, ils ne l'ont pas dicté.

**Réalisé le 2026-11-04** — `kanban-service.spec.ts` seul, **+56 lignes, aucune ligne de code de
production touchée** :

- `getKanbanById(id): Promise<Kanban | null>` ajouté à `KanbanServiceContract` ;
- nouveau `describe('getKanbanById (plan EDITION, partie A)')` portant `T1.1`, `T1.2` et `T1.3`,
  inséré après `getAllKanbans` — **aucun cas existant modifié** (`D7`) ;
- **suite : 499 verts / 2 échoués / 0 `unhandled`**, contre une ligne de base de 496 / 2 / 0. Les
  deux échecs sont les préexistants (`calendar`, `category-selector`) ; +3 cas, aucune régression.

*Les trois cas ont été vérifiés contre le faux vert*, en mutant temporairement l'implémentation puis
en la rétablissant (`git diff` vide après coup) : `T1.1` tombe si la ligne n'est plus convertie au
modèle, `T1.2` tombe sur un `undefined` au lieu de `null` — exactement la régression annoncée par
`C1` —, `T1.3` tombe si l'erreur est avalée (« *promise resolved "null" instead of rejecting* »).

*Deux écarts à signaler sur la transformation annoncée :*

1. **`T1.3` est auto-portant au lieu d'étendre le cas « base non préparée »**, comme la
   transformation le proposait : l'étendre aurait voulu dire **toucher un cas existant**, ce que
   `D7` interdit. Le cas couvre donc lui-même les deux branches de l'énoncé du plan — erreur de la
   base **et** préparation impossible — en remontant son propre `TestBed` pour la seconde.
2. **Collision de numérotation** entre les deux plans : le groupe 1 du plan `CRUD` (préparation de
   la table) porte aussi `T1.1` → `T1.3`, et son `T1.3` est déjà dans ce fichier, sous le `describe`
   « base non préparée ». Les deux `T1.3` cohabitent donc, distingués par leur chemin de `describe`.
   Un en-tête JSDoc au-dessus du nouveau groupe le dit explicitement. *À trancher :* faut-il le
   noter aussi dans les deux plans de test ? (cf. `P5`)

### R2 — ~~Remettre la maquette au niveau du code~~ *(retiré le 2026-11-04)*

Écarté avec `C2` : pas de valeur suffisante pour l'effort, la maquette ayant déjà servi à fixer le
contrat DOM. Rien à faire.

### R3 — Mettre les diagrammes de classes à jour *(résout `C3`)* · **priorité 2 · effort faible** · **appliqué le 2026-11-04**

- **Objectif :** que le diagramme décrive le code réel.
- **Transformation :** lancer le skill [`diagramme_classes`](../../skill/diagramme_classes/SKILL.md)
  sur le lot — ajout de `KanbanEditor` (avec `notFound` et `onRetry`, absents même du diagramme de
  l'approche) et de `getKanbanById` sur `KanbanService` ; retrait du constat `E4` devenu faux.
- **Fichiers touchés :** `.agent/DIAGRAMME_CLASSES_KANBAN.md`.
- **Risque / filet :** aucun — document.

**Réalisé le 2026-11-04** — le diagramme **existant a été complété**, sans scission en une nouvelle
section (`KanbanEditor` relève du même domaine et des mêmes dépendances, donc rien à soumettre) :

- `KanbanService` gagne `getKanbanById(id) Promise~Kanban ou null~` ;
- **nouvelle classe `KanbanEditor`** avec ses 10 signals (dont `notFound` et `hasPendingChanges`),
  ses 6 méthodes publiques (dont `onRetry`) et ses 3 privées — relevés sur le **code**, pas sur le
  diagramme *prévu* de l'approche, qui ignorait `notFound` et `onRetry` ;
- **5 relations ajoutées** (`KanbanEditor` → `KanbanService` / `Router` / `ActivatedRoute`,
  composition de `ConfirmDialog`, dépendance à `Kanban`) et `KanbanList ..> KanbanEditor` « ouvre
  par la route » en remplacement du lien annoté « routes absentes, écart E2 » ;
- **§2** : 6 lignes de lecture des relations ajoutées, 2 corrigées ; **§3** : le parcours de l'écran
  d'édition ; **§4** : 5 notes de conception du lot 3 ; **§5** : `E2`, `E3` et `E4` **fermés** avec
  leur état réel.

`E1` a été **revérifié et laissé ouvert** : `schema_kanban.sql` n'est référencé nulle part dans
`schema-migration.service.ts` (contrôlé le 2026-11-04). Ce lot n'y touchait pas.

> **Réserve de vérification :** l'étape 4 du skill demande de contrôler le **rendu** du diagramme.
> Je n'ai **pas pu le rendre visuellement** — le pane n'exécute pas les scripts d'un `file://`, et
> un serveur statique local a été refusé. Le contrôle s'est donc limité à du **statique** :
> accolades équilibrées (10 / 10), 10 classes déclarées, 18 relations bien formées, seuls `Router`
> et `ActivatedRoute` implicites (comme déjà avant), et **chaque construction ajoutée a un
> précédent** dans un diagramme qui se rend déjà (`Promise~Kanban ou null~` vient du diagramme de
> l'approche, `-string kanbanId?` est de la même forme que `-Promise~SQLiteDBConnection~ opening?`).
> **Un coup d'œil dans un aperçu Mermaid reste souhaitable.**

### R4 — Tracer les deux dérives *(résout `C8`, `C10`)* · **priorité 2 · effort très faible** · **appliqué le 2026-11-04**

- **Objectif :** que rien de ce qui a bougé ne reste hors des documents.
- **Transformation :** une ligne dans `APPROCHE_KANBAN_EDITION.md §4` disant que `KanbanList` a
  finalement été retouchée, et pourquoi (police Material chargée nulle part) ; `git add
  scripts/README.md` pour que le lien d'`AGENT.md:120` cesse d'être mort ; une ligne dans le `D3` du
  plan de test pour y biffer « *L'écran 6 de la maquette est à mettre à jour* », consigne tombée
  avec le retrait de `C2`, et y noter que la maquette n'est plus tenue à jour.
- **Fichiers touchés :** `.agent/KANBAN/EDITION/APPROCHE_KANBAN_EDITION.md`,
  `.agent/KANBAN/EDITION/PLAN_TESTS_KANBAN_EDITION.md`, `scripts/README.md` (mise sous suivi).
- **Risque / filet :** aucun.

**Réalisé le 2026-11-04** — les trois points :

1. **`APPROCHE §4`** : la phrase « Aucune modification de `KanbanList` » est corrigée, et une puce
   « Dérive assumée sur `KanbanList` » dit ce qui a bougé (icônes `material-icons` → masques SVG) et
   **pourquoi** (la police Material n'est chargée nulle part, ces `<span>` ne dessinaient rien), en
   renvoyant à `C8` ;
2. **`PLAN_TESTS` `D3`** : la consigne « L'écran 6 de la maquette est à mettre à jour » est biffée
   et datée *abandonnée le 2026-11-04*, avec la note que la maquette n'est plus tenue à jour et que
   la référence du contrat DOM est le `§7` du plan et le code ;
3. **`scripts/README.md`** est **mis sous suivi** (`git add`, statut `A`). Le commit reste le vôtre.

> **Remarque relevée en le lisant** *(hors périmètre de `R4`, non corrigée)* : ce README affirme que
> les quatre scripts d'assets « sont exécutés au démarrage par `SchemaMigrationService` ». C'est
> **faux pour `schema_kanban.sql`** — c'est exactement l'écart `E1` du diagramme de classes. Le
> document est donc versionné avec cette inexactitude ; une ligne suffirait à la lever.

### R5 — Sortir `editing` et unifier la source de « mode édition » *(résout `C5`)* · **priorité 3 · effort faible** · **appliqué le 2026-11-04**

- **Objectif :** un seul fait pour une seule vérité.
- **Transformation :** passer `kanbanId` en `signal<string | null>` privé et remplacer le signal
  `editing` par un `computed(() => this.kanbanId() !== null)` ; `writeKanban` lit alors le même
  signal que le gabarit. Variante plus légère si l'on préfère ne rien toucher au gabarit : garder
  `kanbanId` tel quel et faire de `editing` un simple accesseur.
- **Fichiers touchés :** `kanban-editor.ts` seul (le gabarit continue d'appeler `editing()`).
- **Risque de régression :** faible, mais réel sur le choix création/renommage.
- **Filet :** `T2.4` et `T3.3` (titre de l'écran), `T5.4` et `T6.2` (une seule écriture par mode),
  `T6.1` (renommage sur l'identifiant de la route). Déjà verts : à relancer après.

**Réalisé le 2026-11-04** — **variante lourde** retenue (le point `P3` n'ayant pas été tranché) :
elle est la seule à rendre `editing` réellement dérivé, et elle reste dans l'idiome de la base de
code, où tout l'état est en signals.

- `kanbanId` devient un **signal privé en lecture seule** (`signal<string | null>(null)`) ;
- `editing` devient un **`computed(() => this.kanbanId() !== null)`** : plus aucun `editing.set()` ;
- `ngOnInit` passe par une variable nommée `idFromRoute` et ne fait plus qu'**un** `set` ;
- `onRetry` et `writeKanban` lisent le signal via `idToReload` / `idToRename`.

**Comportement identique**, et le filet le confirme : **499 verts / 2 échoués / 0 `unhandled`**,
inchangé par rapport à l'entrée. Le diagramme de classes a été mis à jour en conséquence (`R3`
restait sinon faux sur ce membre).

### R6 — Les deux nettoyages de lisibilité *(résout `C7` ; `C6` démenti)* · **priorité 3 · effort très faible** · **appliqué le 2026-11-04**

- **Objectif :** ôter une ligne sans intention et un littéral dupliqué.
- **Transformation :** (a) retirer `this.name.set(saved.name)` de `onSave` — ou, si la
  normalisation du champ est voulue, le dire dans l'en-tête JSDoc d'`onSave` ; (b) exposer
  `DEFAULT_NAME` au gabarit (`readonly defaultName = DEFAULT_NAME`, `[placeholder]="defaultName"`)
  pour que `D-E2` n'ait plus qu'une seule chaîne.
- **Fichiers touchés :** `kanban-editor.ts`, `kanban-editor.html`.
- **Risque de régression :** très faible. Attention toutefois : `T2.1` asserte le `placeholder`,
  qui doit rester exactement « Sans titre ».
- **Filet :** `T2.1` (indication du champ), `T5.1`/`T5.2`/`T6.3` (nom transmis au service),
  `T7.2` (saisie conservée), `T9.6` (plus de modification en attente après succès).

**Réalisé le 2026-11-04 — avec un changement de plan sur (a) :**

- **(a) la ligne n'a PAS été retirée.** La vérification du filet, préalable exigé par le skill, a
  montré qu'elle **porte un comportement** : la retirer casse le critère d'`US4` dans le cas du
  repli « Sans titre », sans qu'aucun test le signale. Le constat `C6` est donc **erroné** et
  corrigé comme tel. C'est la variante « documenter l'intention » qui a été appliquée : le JSDoc
  d'`onSave` explique désormais pourquoi la ligne n'est pas une normalisation redondante, et
  **avertit de ne pas la supprimer**. Le trou de couverture est consigné en `C11`.
- **(b) le littéral est unifié** : `readonly defaultName = DEFAULT_NAME` exposé par la classe, et le
  gabarit passe de `placeholder="Sans titre"` à `[placeholder]="defaultName"`. `T2.1` lit la
  **propriété DOM** `placeholder`, que le binding renseigne — vérifié avant de toucher au gabarit.

**Filet : 499 verts / 2 échoués / 0 `unhandled`**, inchangé.

### R7 — Extraire les tokens et les blocs d'état partagés *(résout `C4`)* · **priorité 4 · effort moyen**

- **Objectif :** une seule déclaration de la palette et des états chargement / vide / erreur.
- **Transformation :** déplacer la palette et son bloc `@media (prefers-color-scheme: dark)` dans
  `src/styles.css` sous `:root`, et extraire dans une feuille partagée les blocs communs
  (`.loading-overlay` + `.spinner` + `@keyframes spin`, `.empty`, `.btn-retry`, la machinerie
  `.icon` et ses `--icon`). Les quatre feuilles de composant ne gardent alors que ce qui leur est
  propre.
- **Fichiers touchés :** `styles.css`, `kanban-editor.css`, `kanban-list.css`, `note-list.css`,
  `note-editor.css` — **donc deux écrans hors du lot `KANBAN`**.
- **Risque de régression :** **visuel et non couvert**. Aucun test n'asserte un style ; les specs ne
  ciblent que des sélecteurs, donc ils resteront verts même si l'écran devient illisible. Les
  styles de composant sont par ailleurs encapsulés (`:host`), ce qui change la spécificité quand on
  remonte une règle au global.
- **Filet :** aucun test ne couvre cet axe — c'est le point à peser. Le filet réel est un
  `ng build` suivi d'une inspection visuelle des quatre écrans, en thème clair **et** sombre.
- **Recommandation :** **ne pas l'embarquer dans ce lot.** Il touche `note-list` et `note-editor`,
  n'a pas de filet automatisé, et mérite son propre chantier « tokens de design » avec sa propre
  validation visuelle.

---

## 4. Priorisation

| Ordre | Refactoring | Pourquoi là |
|---|---|---|
| 1 | ~~**R1**~~ — partie A du plan de test | ✅ **Appliqué le 2026-11-04.** Le seul constat bloquant ; le trou de couverture du lot est fermé, et `R5` peut désormais s'appuyer dessus. |
| 2 | ~~**R3**, **R4**~~ | ✅ **Appliqués le 2026-11-04.** Documents : risque nul. Le diagramme décrit désormais le code livré, et les deux dérives sont tracées. |
| 3 | ~~**R5**, **R6**~~ | ✅ **Appliqués le 2026-11-04.** Premiers `R#` à toucher du code de production ; suite relancée après chacun, invariant tenu. `R6`(a) a été **révisé en cours de route** (cf. `C6`). |
| 4 | **R7** | Structurel, sans filet automatisé, et débordant du lot. À sortir en chantier séparé. |

**Explicitement hors périmètre / reporté :**

- **La maquette `MAQUETTE_KANBAN_EDITOR.html` n'est pas remise à jour** *(tranché le 2026-11-04)* :
  elle a servi à fixer le contrat DOM avant le plan de test, et ce rôle est terminé. Elle reste donc
  en retard sur l'écran livré, **sciemment** — à ne pas lire comme la référence de l'état actuel
  (cf. `C2` et `R2`, retirés).
- **`note-list` reste sur `material-icons`** (`note-list.html`, `note-list.css`), police chargée
  nulle part : ses icônes ne dessinent rien. Constat réel, mais antérieur à ce lot et étranger au
  Kanban — à traiter avec `R7` ou dans un lot « notes ».
- **`row: any` dans `mapRowToKanban`** (`kanban-service.ts:130`) : hérité du lot `CRUD`, cohérent
  avec `getAllKanbans` ; typer les lignes de la base est un chantier de service, pas de ce lot.
- **Bouton « retour » matériel d'Android** (`D-E6`) : la saisie reste perdable par ce geste. Trou
  **connu et accepté**, commun à cet écran et à l'éditeur de notes.
- **Lecture de la route par `snapshot`** (`D8`) : assumé, le parcours `/kanban/edit/a` →
  `/kanban/edit/b` sans repasser par la liste n'existe pas.
- **Internationalisation** des libellés français en dur : hors sujet à ce stade du projet.
- **Les deux échecs préexistants** (`calendar`, `category-selector`) : étrangers à ce lot.
- **Vérification à la main des deux routes** (lot E, hors plan de test) : reste à faire sur le
  téléphone. Rappel du piège : `frontend/android/app/src/main/assets/public/` ne bouge qu'au
  `npm run build` + `npx cap sync` — un `/kanban/edit/<id>` qui retombe sur « Mes Notes » est le
  symptôme d'un bundle périmé, pas d'un bug de l'écran.

---

## 5. Points à trancher

- **P1 —** Faut-il **réintroduire** le cas retiré le 2026-11-03 (« enregistrer sans avoir touché au
  nom demande quand même le renommage », `C9`) ? Il avait été jugé sans valeur suffisante ; `R5`
  touche justement la frontière entre `kanbanId`, `editing` et `hasPendingChanges`, ce qui en
  ferait un filet utile. Décision qui vous appartient : la revue ne rouvre pas d'elle-même un
  arbitrage déjà rendu.
- **P2 —** `R7` dans un chantier « tokens de design » séparé, comme recommandé, ou tout de suite au
  risque d'une régression visuelle non couverte ?
- **P3 —** `R5` : variante lourde (`kanbanId` en signal, `editing` en `computed`) ou variante légère
  (`editing` en simple accesseur, `kanbanId` inchangé) ?
- **P6 —** `C11` : faut-il ajouter au plan de test un cas `T9.9` « champ vidé puis enregistré sous
  « Sans titre » : le retour ne demande plus rien » ? La sonde qui l'a prouvé existe déjà, il n'y a
  qu'à la reprendre. Sans lui, un futur nettoyage peut retirer la ligne d'`onSave` sans rien casser
  de visible — seul le JSDoc l'en dissuade.
- **P5 —** La collision `T1.x` entre les plans `CRUD` et `EDITION` (cf. `R1`) mérite-t-elle une
  ligne dans les deux `PLAN_TESTS_*.md`, ou l'en-tête JSDoc posé dans le spec suffit-il ?
- **P4 —** Clôture du lot : enchaîner `documenter_sources` sur le code livré, ou considérer que les
  en-têtes JSDoc déjà en place suffisent ? À la lecture, la documentation du code est **complète et
  en anglais** — ce skill n'aurait probablement rien à ajouter.
