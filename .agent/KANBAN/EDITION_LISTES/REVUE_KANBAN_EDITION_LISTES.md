# Revue de fonctionnalité — Kanban : les listes (colonnes) d'un tableau

> **Date :** 2026-11-11 · **Statut :** **validée le 2026-11-11** — *refactoring réalisé le
> 2026-11-11* : `R1` → `R8` appliqués, `R9` reporté, étape 0 (`build` + `cap sync`) jouée, reste
> la vérification **sur l'appareil**.
> **SPEC :** [`FEATURE_KANBAN_EDITION_LISTES.md`](FEATURE_KANBAN_EDITION_LISTES.md) (US1 → US7) ·
> **Approche :** [`APPROCHE_KANBAN_EDITION_LISTES.md`](APPROCHE_KANBAN_EDITION_LISTES.md)
> (`D-L1` → `D-L24`, lots `A` → `K`) ·
> **Plan de test :** [`PLAN_TESTS_KANBAN_EDITION_LISTES.md`](PLAN_TESTS_KANBAN_EDITION_LISTES.md)
> (effets `E11` → `E59`, cas `T1.1` → `T12.13`)
> **Docs de référence :** [`DIAGRAMME_CLASSES_KANBAN.md`](../../DIAGRAMME_CLASSES_KANBAN.md),
> [`REVUE_KANBAN_EDITION.md`](../EDITION/REVUE_KANBAN_EDITION.md) (constat `E1`, refermé par ce lot),
> [`REVUE_KANBAN_CRUD.md`](../CRUD/REVUE_KANBAN_CRUD.md)

**Périmètre revu** — les commits `03b83e0` → `ea442b9` de la branche `kanban`, fichiers
d'**implémentation** seulement :

| Fichier | État |
|---|---|
| [`kanban-column.model.ts`](../../../frontend/src/app/core/models/kanban-column.model.ts) | créé (37 l.) |
| [`kanban-save-result.model.ts`](../../../frontend/src/app/core/models/kanban-save-result.model.ts) | créé (30 l.) |
| [`kanban.model.ts`](../../../frontend/src/app/core/models/kanban.model.ts) · [`index.ts`](../../../frontend/src/app/core/models/index.ts) | étendus (`columns?`, +2 exports) |
| [`schema_kanban_columns.sql`](../../../frontend/public/assets/migrations/schema_kanban_columns.sql) | créé (47 l.) |
| [`kanban-column-service.ts`](../../../frontend/src/app/core/services/kanban-column-service.ts) | créé (157 l.) |
| [`kanban-service.ts`](../../../frontend/src/app/core/services/kanban-service.ts) | étendu (+86 / −4 l.) |
| [`schema-migration.service.ts`](../../../frontend/src/app/core/services/schema-migration.service.ts) | étendu (+87 / −16 l.) |
| [`database.service.ts`](../../../frontend/src/app/core/services/database.service.ts) | étendu (+23 / −2 l., le pragma) |
| [`kanban-column.ts`](../../../frontend/src/app/kanban-column/kanban-column.ts) · [`.html`](../../../frontend/src/app/kanban-column/kanban-column.html) · [`.css`](../../../frontend/src/app/kanban-column/kanban-column.css) | créés (86 / 57 / 155 l.) |
| [`kanban-editor.ts`](../../../frontend/src/app/kanban-editor/kanban-editor.ts) · [`.html`](../../../frontend/src/app/kanban-editor/kanban-editor.html) · [`.css`](../../../frontend/src/app/kanban-editor/kanban-editor.css) | étendus (+283 / +100 / +126 l.) |
| `family_notesSQLite.db` (seed binaire) | regénéré (65 → 77 ko) — **contredit `D-L15`**, cf. `C12` |

Les `.spec.ts` ont été **lus comme contrat de comportement** et ne sont pas l'objet de la revue,
sauf là où ils documentent une décision que le plan devrait porter (`C11`). `scripts/*.sql` et
`scripts/README.md` sont de l'outillage de vérification à la main : mentionnés, pas audités.

**État de la suite au 2026-11-11** : `594 passés / 2 échoués` sur 24 fichiers. Les deux échecs
(`calendar.spec.ts > should create`, `category-selector.spec.ts > placeholder`) sont les échecs
**préexistants** de la branche, étrangers à ce lot — la suite saine est bien à 2 échecs. Les 93 cas
du plan sont verts.

---

## 1. Synthèse

**Le lot est livré et conforme.** Les vingt-quatre décisions de l'approche se retrouvent dans le
code, y compris les deux tardives — `D-L24` (le demi-succès est un **résultat**, pas une exception)
et `D-L14` (pragma posé avec `transaction = false` explicite). Le piège le plus facile à rater du
lot est traité : `onSave` retient l'identifiant du tableau **avant** de regarder si les colonnes ont
suivi ([`kanban-editor.ts:200`](../../../frontend/src/app/kanban-editor/kanban-editor.ts#L200)), ce
qui est exactement ce qui empêche un ré-essai de créer un second tableau (`D-L13`, `E51`).

Ce qui est franchement sain :

- **les responsabilités sont là où l'approche les a mises** : `KanbanColumnService` est le seul
  propriétaire de `kanban_columns`, `KanbanService` n'y écrit aucun SQL et porte l'assemblage,
  l'écran n'injecte que `KanbanService` et n'orchestre aucune séquence d'écritures (`D-L9`) ;
- **le composant colonne est réellement présentationnel** (`D-L23`) : aucun service, aucun routeur,
  il émet le nom **tel qu'il a été tapé** et une *demande* de retrait — les règles de nom et la
  popup restent en un seul endroit, l'éditeur
  ([`kanban-column.ts:67-85`](../../../frontend/src/app/kanban-column/kanban-column.ts#L67)) ;
- **l'upsert est un vrai `UPDATE`** (`ON CONFLICT(id) DO UPDATE`,
  [`kanban-column-service.ts:73-78`](../../../frontend/src/app/core/services/kanban-column-service.ts#L73)),
  et la suppression des absentes passe **après** : les identifiants survivent, ce qui est tout ce
  que le lot « cartes » attend de celui-ci (`D-L10`) ;
- **`hasPendingChanges` reste un état dérivé** étendu aux colonnes, comparé sur les noms nettoyés et
  sans la position
  ([`kanban-editor.ts:138-141`, `434-448`](../../../frontend/src/app/kanban-editor/kanban-editor.ts#L434)) :
  rien à remettre à zéro, et revalider le même nom ne crée pas de modification fantôme ;
- **le socle est refermé** : `migrate()` a perdu son court-circuit et chaque étape porte sa garde
  (`E1` de `REVUE_KANBAN_EDITION.md` est clos), le pragma est posé **hors transaction et avant** la
  migration, et le SQL de schéma n'existe qu'en `.sql` dans les assets ;
- **les règles de code du projet sont respectées** : JSDoc en anglais sur chaque classe, attribut et
  fonction des fichiers créés, **aucun commentaire dans un corps de fonction** (vérifié sur les
  quatre `.ts` du lot), variables intermédiaires nommées, aucun appel imbriqué, aucun code mort
  laissé par le TDD **en TypeScript** — la feuille de style, elle, en a gardé (`C1`, `C6`) ;
- **l'accessibilité est au niveau de ce que l'approche demandait** : chacune des trois commandes
  répétées porte un libellé qui **désigne sa liste**, les deux champs de saisie ont une étiquette
  `sr-only`, les boutons de déplacement sont **désactivés et non masqués**, et la popup nomme la
  liste visée.

Les douze constats ci-dessous ne remettent rien de cela en cause. Un seul est **bloquant**, et ce
n'est pas un défaut de code : c'est l'étape de propagation vers l'APK que l'approche annonçait
obligatoire et qui n'a pas été jouée (`C12`). Trois sont **importants** et se corrigent en quelques
lignes (`C1`, `C2`, `C3`), un touche à ce que l'utilisateur lit (`C4`), le reste est cosmétique ou
documentaire.

---

## 2. Constats

### C1 — `.column-slot` est déclaré deux fois, avec deux mises en page contradictoires — *important* — **résolu le 2026-11-11 (`R1`)**

**Emplacement :** [`kanban-editor.css:266-273` et `279-286`](../../../frontend/src/app/kanban-editor/kanban-editor.css#L266)

Le premier bloc est le reliquat de la mise en page abandonnée — les flèches **à côté** de la liste
(`gap: 6px`, `align-items: stretch`, direction par défaut `row`) — et le second est celle qui a été
retenue, les flèches **sous** la liste (`flex-direction: column`, `width: min(calc(100vw - 48px), 280px)`).
Les deux commentaires d'en-tête disent d'ailleurs l'un « *around it* », l'autre « *under it* ».

Ce n'est pas qu'un bloc mort : le second ne redéclare **ni** `min-width: max-content` **ni**
`align-items`, qui survivent donc du premier. Et `min-width` l'emporte sur `width` en CSS : une
liste au nom long étire son emplacement **au-delà des 280 px** voulus, parce que le nom est en
`white-space: nowrap`
([`kanban-column.css:72`](../../../frontend/src/app/kanban-column/kanban-column.css#L72)) et
contribue donc sa largeur entière au `max-content`.

**Impact :** code mort **avec effet de bord actif** — la largeur d'une liste n'est pas celle que la
règle retenue annonce. Aucun test ne couvre le CSS, donc rien ne le dira.

### C2 — Un nom de colonne vide échoue en silence, et le JSDoc affirme le contraire — *important* — **résolu le 2026-11-11 (`R3`)**

**Emplacements :**
[`kanban-column-service.ts:50-53`](../../../frontend/src/app/core/services/kanban-column-service.ts#L50) ·
[`kanban-service.ts:161` et `168-175`](../../../frontend/src/app/core/services/kanban-service.ts#L161)

La vérification des noms est faite **avant** d'entrer dans `runQuery` — ce qui tient bien la
promesse « rien n'est écrit avant que tous les noms soient validés » (`E17`, `T2.7`, `T2.8`), mais
place l'exception **hors** de l'enrobage qui journalise. Or `saveColumnsOf` l'attrape à l'aveugle
(`catch { return { kanban, columnsSaved: false }; }`), et son JSDoc affirme : « *The underlying
error is not lost, `runQuery` having logged it before it got here* ». C'est vrai de toutes les
erreurs de base, et **faux de celle-là** : elle ne passe par aucun `console.error`, et l'utilisateur
voit un bandeau d'échec sans qu'aucune trace n'existe nulle part.

Le chemin n'est pas atteignable aujourd'hui — l'éditeur replie tout nom vide sur « Sans titre »
(`D-L17`) — et c'est précisément pourquoi il restera invisible le jour où il le deviendra. Le
`.spec.ts` de `KanbanService` double entièrement `KanbanColumnService`
(`saveColumnsForKanban.mockRejectedValue(…)`), donc aucun cas n'emprunte ce chemin.

**Impact :** robustesse (échec silencieux) et **documentation fausse** sur la seule garantie que
`D-L24` donne en échange de l'atomicité abandonnée.

### C3 — L'ajout d'une liste ne renumérote pas les positions — *important* — **résolu le 2026-11-11 (`R2`)**

**Emplacement :** [`kanban-editor.ts:238-249`](../../../frontend/src/app/kanban-editor/kanban-editor.ts#L238)

L'ajout pose `position: columnsShown.length` au lieu de passer par `reindexColumns`, contrairement
au retrait ([`:330`](../../../frontend/src/app/kanban-editor/kanban-editor.ts#L330)) et au
déplacement ([`:469`](../../../frontend/src/app/kanban-editor/kanban-editor.ts#L469)). Le lot `G` de
l'approche demande pourtant la renumérotation à l'ajout aussi, et par la même fonction.

Cela ne marche que si la composition reçue est **déjà contiguë depuis 0**. Elle ne l'est pas
forcément : `loadKanban` reprend les positions de la base telles quelles
([`:399-401`](../../../frontend/src/app/kanban-editor/kanban-editor.ts#L399)), et `D-L13` **assume**
qu'un enregistrement interrompu laisse la base dans un état intermédiaire. Une composition lue en
`[0, 2]` plus un ajout donne deux colonnes en position `2` ; les deux lignes sont écrites ainsi, et
l'ordre à la réouverture devient celui que le moteur décide, aucune contrainte d'unicité ne portant
sur `(kanban_id, position)` (`D-L6`).

`T10.3` est vert parce qu'il part de `THREE_COLUMNS`, dont les positions sont `0, 1, 2`.

**Impact :** conformité au lot `G`, et robustesse sur le seul état que `D-L13` autorise la base à
prendre. Correction : une ligne.

### C4 — Le même message annonce deux échecs opposés — *important* — **résolu le 2026-11-11 (`R4`)**

**Emplacements :** [`kanban-editor.ts:17`, `203` et `215`](../../../frontend/src/app/kanban-editor/kanban-editor.ts#L17)

`SAVE_FAILED_MESSAGE` — « *Impossible d'enregistrer le tableau.* » — est affiché dans les deux cas :
l'échec dur, où rien n'a été écrit, **et** le demi-succès, où le tableau **est** enregistré et où
seules ses listes n'ont pas suivi. Dans le second, le message dit à l'utilisateur l'inverse de ce
qui s'est passé, pendant que le titre de la barre passe de « Nouveau tableau » à « Modifier le
tableau » — conséquence que `D-L24` et le lot `K` avaient vue venir en la décrivant comme
« *à ne pas prendre pour un bug* ». Les deux signaux se contredisent donc à l'écran.

**Impact :** justesse de la seule chose que l'utilisateur voit d'un état que `US7` a pris la peine
de documenter comme assumé.

### C5 — Les deux `ConfirmDialog` ne sont distinguables par aucun sélecteur — *cosmétique* — **résolu le 2026-11-11 (`R5`)**

**Emplacement :** [`kanban-editor.html:171-186`](../../../frontend/src/app/kanban-editor/kanban-editor.html#L171)

Le §4 de l'approche le demandait explicitement : « *le contrat DOM du plan de test devra les
distinguer par un sélecteur, sans quoi les cas de retrait et les cas d'abandon se marcheront
dessus* ». Les deux instances sont posées sans classe ni attribut qui les sépare, et le `.spec.ts`
s'en sort avec `.confirm-backdrop` et `.confirm-card .btn-confirm` en `querySelector` — le
**premier** trouvé. Cela fonctionne seulement parce que les deux popups ne sont jamais ouvertes en
même temps, et rien dans l'écran ne le garantit : le bouton « Retour » de la barre reste focalisable
derrière le fond de la popup (ni piège de focus, ni `inert`), donc un `Tab` puis `Entrée` ouvre la
seconde par-dessus la première.

**Impact :** fragilité des tests (ils dépendent de l'exclusivité, pas d'un sélecteur) et empilement
possible des deux popups au clavier. Deux classes suffisent à fermer les deux.

### C6 — Le dimensionnement d'une colonne est écrit deux fois, et la version du composant est morte — *cosmétique* — **résolu le 2026-11-11 (`R6`)**

**Emplacements :**
[`kanban-column.css:22-23`](../../../frontend/src/app/kanban-column/kanban-column.css#L22) ·
[`kanban-editor.css:288-292`](../../../frontend/src/app/kanban-editor/kanban-editor.css#L288)

Le composant se dimensionne lui-même (`flex: 0 0 72vw; max-width: 280px` sur son `:host`), et
l'éditeur annule les deux (`flex: 1 1 auto; max-width: none`) pour reposer la largeur sur
`.column-slot`. La règle de l'éditeur est plus spécifique, donc elle gagne : les deux déclarations
du composant sont **mortes**. Même origine que `C1` — l'itération de mise en page.

**Impact :** lisibilité, et piège silencieux — changer la largeur d'une liste dans la feuille de
style **de la liste** n'aurait aucun effet.

### C7 — `.sr-only` est dupliquée dans deux feuilles de style — *cosmétique* — **ouvert** : copie conservée (`P2`)

**Emplacements :**
[`kanban-editor.css:137`](../../../frontend/src/app/kanban-editor/kanban-editor.css#L137) ·
[`kanban-column.css:145`](../../../frontend/src/app/kanban-column/kanban-column.css#L145)

Les styles Angular étant scopés, le lot a recopié la règle pour le nouveau composant. C'est la seule
façon de faire sans règle globale, et `frontend/src/styles.css` est **vide** (une ligne de
commentaire) : il n'existe aucun endroit partagé où la poser aujourd'hui. Le constat est donc
autant un arbitrage qu'un défaut (cf. `P2`).

### C8 — Le lot ajoute du JSDoc **en français** dans `schema-migration.service.ts` — *cosmétique* — **reporté** (`R9`)

**Emplacement :** [`schema-migration.service.ts:46-140`](../../../frontend/src/app/core/services/schema-migration.service.ts#L46)

Les trois méthodes ajoutées (`ensureKanbanTable`, `ensureKanbanColumnsTable`, `createTableIfMissing`)
et le `migrate()` réécrit sont documentés en français, pour rester cohérents avec le fichier ; tout
le reste du lot — modèles, `KanbanColumnService`, les deux composants — est en anglais, comme la
règle du projet le demande. Le fichier est donc cohérent et le dépôt ne l'est pas.

**Impact :** cohérence. Le bon geste est de traduire **tout** le fichier, pas d'y mélanger deux
langues : c'est un chantier à part (cf. `R9`).

### C9 — La justification de `deleteAllColumnsOf` est inexacte — *cosmétique* — **résolu le 2026-11-11 (`R7`)**

**Emplacement :** [`kanban-column-service.ts:101-107`](../../../frontend/src/app/core/services/kanban-column-service.ts#L101)

Le JSDoc explique le cas à part par : « *the general form would read `NOT IN ()`, which several
engines reject outright* ». L'approche porte la même affirmation (lot `C`, « cas limites » :
« *`NOT IN ()` avec une liste vide n'étant pas du SQL valide* »), et la doublure du `.spec.ts` la
reproduit. Or **SQLite l'accepte** — vérifié sur `sql.js`, le moteur de `jeep-sqlite` déjà présent
dans `node_modules`, qui est aussi celui qui a servi à valider les scripts de ce lot.

La branche reste légitime : elle dit l'intention et évite une requête dégénérée. Mais une
justification fausse est exactement ce qui fait supprimer une branche par la personne qui va
vérifier.

**Impact :** documentation, en trois endroits (service, approche, doublure du spec).

### C10 — Un enregistrement groupé flushe deux fois — *cosmétique, et à laisser tel quel* — **laissé tel quel, volontairement**

**Emplacements :**
[`kanban-service.ts:86` et `112`](../../../frontend/src/app/core/services/kanban-service.ts#L86) ·
[`kanban-column-service.ts:59`](../../../frontend/src/app/core/services/kanban-column-service.ts#L59)

`createKanban` / `renameKanban` appellent `persist()`, puis `saveColumnsForKanban` l'appelle à son
tour : un enregistrement groupé sérialise donc deux fois la base sur la plateforme web (sans effet
sur l'appareil, où `persist` est un no-op). `E19` — « flushée **une seule fois** » — porte sur le
service des colonnes et est bien tenu là.

**Ce constat ne demande aucun refactoring, et c'est le point :** le premier `persist()` est
précisément ce qui rend le tableau **durable** avant la tentative sur les colonnes. Le retirer pour
« n'en garder qu'un » casserait la garantie de `D-L13` sur le web — un demi-échec ne laisserait plus
le tableau créé, et le ré-essai en créerait un second. À inscrire ici pour qu'une optimisation
naïve ne le découvre pas à la dure.

### C11 — Le contrat DOM vit dans le `.spec.ts`, pas dans le plan de test — *important (documentation)* — **résolu le 2026-11-11 (`R8`)**

**Emplacements :** [`PLAN_TESTS_KANBAN_EDITION_LISTES.md:12-15` et §8](PLAN_TESTS_KANBAN_EDITION_LISTES.md) ·
[`kanban-editor.spec.ts:48-99`](../../../frontend/src/app/kanban-editor/kanban-editor.spec.ts#L48)

Le plan est toujours au statut « *en construction — effets et causes seulement* » et son §8 annonce
encore « *décisions `D#`, doublures et contrat DOM* » à écrire. Le lot a été développé quand même,
et le `.spec.ts` porte un contrat DOM **proposé, en attente de confirmation** : un tableau de huit
sélecteurs et sept décisions `D-EL1` → `D-EL7`, plus `D-P1` dans `kanban-column.spec.ts`. Le §7 du
plan laisse de même ouverte la question d'observabilité de `E15`/`E16`/`E19`, que `D-EL5` a tranchée
dans le spec (lire la composition portée par l'enregistrement groupé).

**Impact :** c'est l'inverse du cycle du dépôt — le plan fait foi, le spec le traduit. En l'état, le
lot « cartes » partira d'un plan incomplet et d'un contrat DOM qu'il faudra aller lire dans un
fichier de test. Les décisions sont bonnes et argumentées ; elles ne sont simplement pas au bon
endroit.

### C12 — `npx cap sync` n'a pas été joué : l'APK n'a aucun des deux scripts kanban — *bloquant* — **refermé le 2026-11-11 (étape 0)**, appareil excepté

**Constat (état local au 2026-11-11) :**

| Dossier | Contenu |
|---|---|
| `frontend/dist/project_tmp/browser/assets/migrations/` | les **5** scripts, dont `schema_kanban.sql` et `schema_kanban_columns.sql` — build du 2026-11-10 |
| `frontend/android/app/src/main/assets/public/assets/migrations/` | **3** scripts seulement (`schema_notes`, `schema_categories`, `migration_relational_categories`) — datés du 2026-10-04 |
| `frontend/android/…/assets/public/assets/databases/family_notesSQLite.db` | 53 ko, du 2026-10-04 — le seed du dépôt fait désormais 77 ko |

Le `npm run build` est donc fait, le `npx cap sync` **non**. Conséquence sur un appareil construit
depuis cet arbre : l'étape 2 de `migrate()` ne trouve pas `kanbans`, demande `schema_kanban.sql`,
`loadScript` lève « *Script de migration introuvable* », `migrate()` rejette,
`DatabaseService.open()` rejette — et comme `SqliteService.ready` rejette pour **tous** les services,
c'est l'application **entière** qui n'a plus de base, les notes comprises.

Et c'est la suppression du court-circuit (`D-L15`) qui rend ce chemin atteignable : avant elle, une
base à jour ne chargeait aucun script, donc un bundle périmé passait inaperçu. Le lot a refermé
`E1` et, du même geste, transformé un bundle périmé en panne franche.

Deux remarques pour être juste :
- ce n'est **pas un défaut de code** : c'est l'étape que le §4 de l'approche annonce obligatoire
  (« *`npm run build` + `npx cap sync` obligatoires après ce lot* ») et que `scripts/README.md`
  rappelle. `frontend/android/app/src/main/assets/public` est `.gitignore`-é : il s'agit de l'état
  **local**, pas d'un fichier livré ;
- le seed binaire, lui, **a** été regénéré (65 → 77 ko), alors que `D-L15` disait explicitement
  « *le seed binaire n'est pas modifié : l'étape 3 crée la table partout* ». L'écart est sans
  conséquence — les gardes `isTable` rendent les étapes inopérantes si le seed porte déjà les
  tables — mais il n'est écrit nulle part, et il retire au passage la seule installation qui
  **testait** vraiment l'étape 3 sur un appareil neuf.

**Impact :** le lot ne peut pas être vérifié sur l'appareil — or c'est là que `D-L14` a laissé son
seul point ouvert (« *que le pragma survive à la connexion ouverte par le plugin natif* ») et là que
`D-L15` prétend refermer `E1`. Rien de tout cela n'est démontré tant que le bundle est périmé.

---

## 3. Refactorings proposés

### R1 — Dédupliquer `.column-slot` *(résout `C1`)* — **priorité 1, effort XS**

**Transformation :** supprimer le bloc mort (`kanban-editor.css:266-273`) et son commentaire
« *around it* », et décider explicitement du sort de `min-width: max-content`, qui n'appartient à
aucune des deux mises en page retenues (cf. `P5`) : soit le réintégrer dans le bloc vivant si on
veut qu'une liste s'élargisse pour son nom, soit le laisser tomber pour que la largeur soit
réellement `min(100vw − 48px, 280px)` et que le nom s'ellipse.

**Fichiers :** `kanban-editor.css`.
**Risque :** visuel, non couvert par les tests — aucun cas ne porte sur le CSS.
**Filet :** vérification à l'œil sur un tableau à quatre listes dont une au nom très long, en
portrait ; les cas `T6.x` restent verts quoi qu'il arrive, ils ne lisent que des sélecteurs.

### R2 — Faire passer l'ajout — et la lecture — par `reindexColumns` *(résout `C3`)* — **priorité 1, effort XS**

**Transformation :** dans `onAddColumn`, poser la nouvelle liste puis renvoyer
`this.reindexColumns([...columnsShown, columnToAdd])`, comme le retrait et le déplacement le font
déjà ; la `position` calculée à la construction devient alors indifférente. Et, au même titre,
renuméroter la composition **lue** dans `loadKanban` : c'est ce qui referme le trou à la source, une
base laissée non contiguë par un enregistrement interrompu étant le seul cas d'entrée possible.

**Fichiers :** `kanban-editor.ts` (deux lignes).
**Risque :** faible. Renuméroter à la lecture change les `position` du modèle affiché sans changer
l'ordre ni les noms ; `hasColumnChanges` ignore déjà la position (`D-L12`), donc aucune modification
fantôme n'apparaît.
**Filet :** `T7.1`, `T10.2`, `T10.3` couvrent le comportement actuel. À compléter par **un cas
neuf** — « une composition lue avec un trou dans les positions est enregistrée contiguë » — sans
quoi la correction reste non démontrée : c'est le seul cas que le plan n'a pas vu venir.

### R3 — Rendre l'échec de nom traçable, et corriger le JSDoc *(résout `C2`)* — **priorité 1, effort S**

**Transformation :** faire entrer la boucle de vérification des noms **dans** le `runQuery` de
`saveColumnsForKanban` — elle y précède toujours le premier `upsertColumn`, donc la garantie « rien
n'est écrit » est intacte, et l'erreur devient journalisée comme toutes les autres. Extraire la
boucle en une fonction nommée (`requireNameOfEveryColumn`) tant qu'on y est : l'approche en parle
comme d'une étape, le code en fait un détail en ligne. Puis journaliser dans le `catch` de
`saveColumnsOf` plutôt que de l'avaler, et **réécrire son JSDoc** : la phrase actuelle affirme une
garantie que le code ne tient pas.

**Fichiers :** `kanban-column-service.ts`, `kanban-service.ts`.
**Risque :** faible. Le seul changement observable est l'ordre entre l'attente de `ready` et le
refus du nom : si la connexion échoue **et** qu'un nom est vide, c'est l'erreur de connexion qui
remonte. Aucun cas ne combine les deux.
**Filet :** `T2.7`, `T2.8` (refus sans écriture), `T4.7`, `T4.8` (demi-succès).

### R4 — Deux messages pour deux échecs *(résout `C4`)* — **priorité 2, effort S**

**Transformation :** garder « *Impossible d'enregistrer le tableau.* » pour l'échec dur, et donner
au demi-succès un message qui dit ce qui s'est réellement passé — le tableau est enregistré, ses
listes ne le sont pas, un nouvel essai les reprendra. Le titre de la barre qui bascule cesse alors
de contredire le bandeau.

**Fichiers :** `kanban-editor.ts` (une constante de plus, un `set` distinct).
**Risque :** nul côté comportement.
**Filet :** `T11.4` lit le message de l'échec dur avec `toContain` → inchangé. `T11.6` lit le **même**
message sur le chemin du demi-succès → **à ajuster**, et c'est le bon endroit pour figer le nouveau
libellé. `T11.5` et `T11.7` ne lisent pas le texte.
**À trancher avant d'écrire :** le libellé exact (cf. `P1`).

### R5 — Distinguer les deux popups par un sélecteur *(résout `C5`)* — **priorité 2, effort XS**

**Transformation :** poser une classe sur chaque instance — par exemple
`class="confirm-remove-column"` et `class="confirm-leave"` sur les deux `app-confirm-dialog`, sans
toucher à `ConfirmDialog` : `app-confirm-dialog.confirm-remove-column .confirm-card` devient un
sélecteur sûr. Puis remonter les deux sélecteurs dans le contrat DOM (cf. `R8`) et faire porter les
cas de retrait et d'abandon sur eux, au lieu du premier `.confirm-backdrop` trouvé.

**Fichiers :** `kanban-editor.html` ; les cas concernés de `kanban-editor.spec.ts` suivent (ils ne
sont pas l'objet de la revue, mais ils sont le filet).
**Risque :** nul. Les deux popups restent fonctionnellement identiques.
**Filet :** tous les cas de retrait (`T9.x`) et d'abandon (`T12.10` → `T12.13`) — ce sont eux qui
deviennent non ambigus.

### R6 — Nettoyer le dimensionnement de la colonne *(résout `C6`, et `C7` en partie)* — **priorité 3, effort S**

**Transformation :** retirer du `:host` de `kanban-column.css` le `flex` et le `max-width` que
l'éditeur annule déjà, et par conséquent le `max-width: none` de l'éditeur qui n'avait plus que
cela à combattre : la largeur d'une liste vit **dans `.column-slot`**, un seul endroit, celui qui
connaît la zone de contenu. Le composant garde sa hauteur et son apparence.

**Fichiers :** `kanban-column.css`, `kanban-editor.css`.
**Risque :** visuel, non couvert par les tests. À faire **après `R1`**, sans quoi on nettoie une
règle dont la gagnante est elle-même en double.
**Filet :** vérification à l'œil, mêmes conditions que `R1` ; aucun cas de test ne bouge.

### R7 — Corriger la justification de `NOT IN ()` *(résout `C9`)* — **priorité 3, effort XS**

**Transformation :** réécrire la phrase aux trois endroits (JSDoc de `deleteAllColumnsOf`, lot `C`
de l'approche, doublure du spec) pour dire ce qui est vrai : SQLite accepte `NOT IN ()`, et la
branche existe pour **dire l'intention** — « ce tableau ne garde plus aucune liste » — et éviter une
requête dégénérée, pas parce que le SQL serait invalide.

**Fichiers :** `kanban-column-service.ts`, `APPROCHE_KANBAN_EDITION_LISTES.md`,
`kanban-column-service.spec.ts` (commentaire de doublure).
**Risque :** nul, aucun code exécutable ne change.
**Filet :** sans objet.

### R8 — Remonter le contrat DOM et les décisions dans le plan de test *(résout `C11`)* — **priorité 2, effort M (documentation)**

**Transformation :** reprendre dans `PLAN_TESTS_KANBAN_EDITION_LISTES.md` le tableau de sélecteurs
et les décisions `D-EL1` → `D-EL7` du `.spec.ts` (plus `D-P1` de `kanban-column.spec.ts`), les
renuméroter en `D#` comme les autres plans du dépôt, trancher dans le §7 la question d'observabilité
de `E15`/`E16`/`E19` par ce que le code fait réellement, et passer le statut de « *en construction* »
à « *arrêté le …* ». Les sélecteurs ajoutés par `R5` y entrent du même geste.

**Fichiers :** `PLAN_TESTS_KANBAN_EDITION_LISTES.md`, et l'en-tête du `.spec.ts` qui peut alors
**citer** le plan au lieu de proposer un contrat.
**Risque :** aucun sur le code. Le risque est de ne pas le faire : le lot « cartes » hérite sinon
d'un plan incomplet.
**Filet :** sans objet — travail documentaire, à faire à code figé pour que le plan décrive ce qui
est livré.

### R9 — Traduire `schema-migration.service.ts` en anglais *(résout `C8`)* — **priorité 4, à sortir du périmètre**

**Transformation :** passer **tout** le fichier en anglais (en-tête de classe, cinq méthodes
existantes, constantes `SCRIPTS`), et non les seules méthodes de ce lot.

**Fichiers :** `schema-migration.service.ts`.
**Risque :** nul, mais le diff est entièrement du commentaire et noie la revue d'un prochain lot.
**Filet :** sans objet.
**Recommandation :** chantier `documenter_sources` séparé, avec les autres fichiers du dépôt restés
en français (`confirm-dialog.ts`, `models/index.ts`…), plutôt qu'au milieu de celui-ci.

---

## 4. Priorisation

**Avant de clore le lot — l'étape qui ne peut pas attendre :**

0. **`C12`** — `npm run build` puis `npx cap sync`, puis la vérification **sur l'appareil** :
   ouverture de l'application sur une base **déjà installée** (c'est le cas que `D-L15` prétend
   refermer), création d'un tableau avec deux ou trois listes, réouverture, suppression du tableau
   et contrôle que ses listes ont bien disparu (le pragma de `D-L14`, le seul point que ni les
   bouchons ni `sql.js` ne peuvent dire). Ce n'est pas un refactoring, et aucun des suivants ne le
   remplace.

**Puis, dans cet ordre — les trois quick wins d'abord, aucun risque et quelques lignes :**

1. **`R2`** (ajout → `reindexColumns`, + le cas neuf) — la seule correction de comportement.
2. **`R3`** (nom vide traçable + JSDoc juste) — referme un échec silencieux.
3. **`R1`** (dédupliquer `.column-slot`) — supprime du code mort qui agit.

**Ensuite, ce qui touche à ce qu'on voit ou à ce qui fait foi :**

4. **`R4`** (deux messages) — après avoir tranché `P1`.
5. **`R5`** (sélecteurs des deux popups) — ouvre la voie à `R8`.
6. **`R8`** (contrat DOM remonté dans le plan) — à faire **à code figé**, donc après `R1` → `R5`.

**Enfin, le confort :**

7. **`R6`** (dimensionnement de la colonne), après `R1`.
8. **`R7`** (justification `NOT IN ()`).

**Explicitement hors périmètre / reporté :**

- **`R9`** — traduction de `schema-migration.service.ts` : chantier `documenter_sources` séparé.
- **`C10`** — le double `persist()` : **à ne pas « optimiser »**, c'est lui qui rend le tableau
  durable avant la tentative sur les colonnes.
- **L'atomicité** de l'enregistrement : `D-L13` l'a écartée en connaissance de cause, la
  rejouabilité en tient lieu. Ne pas la rouvrir ici.
- **Les cartes, le glisser-déposer, le déplacement de plus d'un cran, l'unicité des noms,
  annuler / rétablir, le bouton « retour » matériel d'Android** : écartés par la SPEC.
- **`H-L6`** — rester sur le tableau après enregistrement : question laissée **ouverte** par la SPEC
  et par `D-L16`, pas un défaut de ce lot (cf. `P4`).
- **Les deux échecs préexistants** (`calendar`, `category-selector`) : étrangers à ce lot.
- **Le `max-content` d'une liste au nom long** : le comportement voulu est à trancher (`P5`), pas à
  deviner dans `R1`.

---

## 5. Points à trancher

- **P1 — `R4` :** quel libellé pour le demi-succès ? Proposition : « *Le tableau est enregistré,
  mais pas ses listes. Réessayez pour les enregistrer.* » — il dit l'état, et il dit quoi faire. Le
  libellé figé par `T11.6` vous appartient.
- **P2 — `C7` :** `.sr-only` devient-elle la **première règle globale** de `frontend/src/styles.css`
  (le fichier est vide, ce serait un précédent à assumer pour tout le dépôt), ou accepte-t-on la
  copie par composant, qui est la conséquence normale du style scopé ?
- **P3 — `C12`, question de fond :** un script de migration introuvable doit-il faire tomber
  l'initialisation de **toute** la base, ou une étape doit-elle pouvoir échouer en laissant le reste
  de l'application vivre ? Avant `D-L15`, le court-circuit masquait la question ; elle est désormais
  posée pour de bon. L'échec franc a ses mérites (on ne travaille pas sur un schéma inconnu) — c'est
  un arbitrage, pas un oubli.
- **P4 — `H-L6` :** le lot a maintenu le retour à la liste après enregistrement pour ne pas changer
  deux choses à la fois (`D-L16`). Composer des listes et être éjecté du tableau à chaque
  enregistrement deviendra franchement pénible au lot « cartes ». On tranche maintenant, ou on
  laisse le lot suivant le faire ?
- **P5 — `R1` :** une liste au nom long doit-elle **s'élargir** (garder `min-width: max-content`) ou
  **ellipser** son nom à 280 px (le laisser tomber) ? Le code fait aujourd'hui le premier par
  accident, et dit le second dans sa règle vivante.
- **P6 — `C12`, seed binaire :** le seed a été regénéré alors que `D-L15` disait ne pas y toucher.
  On inscrit l'écart dans l'approche et on l'assume (et l'étape 3 n'est alors plus exercée sur une
  installation neuve), ou on revient au seed d'avant pour que la migration reste le seul chemin ?
- **P7 — `R2` :** le cas neuf (« composition lue avec un trou dans les positions ») va-t-il dans le
  groupe 6 (affichage / lecture) ou dans le groupe 10 (positions et déplacement) ? Il parle des
  deux.

---

## 6. Réalisation — 2026-11-11

Plan **validé en bloc** par l'utilisateur, puis appliqué d'une traite. **Ligne de base :**
`594 passés / 2 échoués` (les deux échecs préexistants de la branche). **Suite rejouée après
chaque `R#`**, toujours `0 unhandled`.

| # | État | Preuve / note |
|---|---|---|
| **Étape 0** | **faite** (appareil excepté) | `ng build` puis `npx cap sync android` : `android/app/src/main/assets/public/assets/migrations/` porte désormais les **5** scripts et le seed de 77 ko. Reste la vérification **sur le téléphone** — elle seule peut dire que `PRAGMA foreign_keys = ON` survit à la connexion du plugin natif (`D-L14`). |
| **`R2`** | **appliqué** | Cas **`T10.4`** écrit d'abord, **rouge sur le défaut réel** (deux listes écrites en `position: 2`), puis vert. `onAddColumn` passe par `reindexColumns`, et `loadKanban` renumérote la composition lue. → `595 passés`. |
| **`R3`** | **appliqué** | Vérification des noms **dans** `runQuery`, extraite en `requireNameOfEveryColumn` ; `saveColumnsOf` journalise au lieu d'avaler ; JSDoc corrigé. |
| **`R1`** | **appliqué** | Bloc `.column-slot` mort supprimé ; `min-width: max-content` **abandonné** (cf. `P5`). |
| **`R6`** | **appliqué** | `:host` de `kanban-column.css` ne se dimensionne plus ; le `max-width: none` de l'éditeur, devenu sans objet, est retiré. |
| **`R4`** | **appliqué** | `COLUMNS_SAVE_FAILED_MESSAGE` distinct. `T11.6` ajusté — **changement contractuel assumé**, pas un verdissement. |
| **`R5`** | **appliqué** | Classes `confirm-remove-column` / `confirm-leave` ; 56 assertions qualifiées. **Le filet a joué** : `T12.3` et `T12.7` pilotent la popup de **retrait** et sont passés rouges sur le mauvais préfixe — exactement la collision que le §4 de l'approche annonçait. |
| **`R7`** | **appliqué** | Justification corrigée dans le service **et** dans l'approche. Le `.spec.ts` ne portait pas la phrase. |
| **`R8`** | **appliqué** | Plan de test complété : §8 décisions (`D-EL1` → `D-EL8`, `D-P1` → `D-P4`), §9 contrat DOM, §10 doublures ; statut passé à « arrêté », compte à **94 cas**. Les en-têtes des deux `.spec.ts` **citent** désormais le plan au lieu de proposer un contrat. |
| **`R9`** | **reporté** | Traduction de `schema-migration.service.ts` : chantier `documenter_sources` séparé, comme recommandé au §4. |
| **`C10`** | **laissé tel quel** | Le double `persist()` reste : c'est lui qui rend le tableau durable avant la tentative sur les colonnes. |

**Suite finale : `595 passés / 2 échoués`, `0 unhandled`** — les deux mêmes échecs préexistants, et
un cas de plus qu'à la ligne de base (`T10.4`).

**Vérification à l'œil de `R1` / `R6`** (aucun test ne couvre le CSS) : build servi en statique,
écran ouvert en 375 px, trois listes dont une au nom délibérément long. Mesuré dans la page — les
trois emplacements font **exactement 280 px**, `min-width` est revenu à `auto`, le nom long
**s'ellipse** au lieu d'étirer sa colonne, et la zone de contenu défile
(`scrollWidth 1254 > clientWidth 359`). C'est le comportement tranché en `P5`.

### Points du §5, tranchés le 2026-11-11

- **`P1`** → libellé retenu : « *Le tableau est enregistré, mais pas ses listes. Réessayez pour les
  enregistrer.* », figé par `T11.6`.
- **`P2`** → **copie par composant conservée**. `styles.css` reste vide : ouvrir une feuille
  globale pour une seule règle d'accessibilité créerait un précédent qui engage tout le dépôt, et
  cela mérite sa propre décision, pas un effet de bord de ce lot. `C7` reste ouvert à ce titre.
- **`P3`** → **échec franc conservé** : un script de migration introuvable fait toujours tomber
  l'initialisation de la base. On ne travaille pas sur un schéma inconnu, et l'étape 0 jouée retire
  au problème son caractère probable. Aucun code changé.
- **`P4`** (`H-L6`) → **laissé ouvert**, comme `D-L16` le voulait : c'est au lot « cartes » de le
  trancher, avec le recul de l'usage.
- **`P5`** → **ellipse à 280 px**. Le nom porte déjà `text-overflow: ellipsis` dans
  `kanban-column.css` : l'intention était écrite, seul le `min-width` mort la contredisait.
- **`P6`** → **seed regénéré conservé**, et l'écart avec `D-L15` est désormais **écrit** (`C12`).
  Le revenir en arrière ferait perdre un seed à jour pour ne gagner qu'un chemin de test ; la
  migration reste vérifiable sur une base **déjà installée**, qui est le cas qui comptait.
- **`P7`** → `T10.4` placé dans le **groupe 10** (positions et renumérotation), auprès de `T10.2`
  et `T10.3` qui portent sur la même chose.

## 7. Ce qui reste

1. **La vérification sur l'appareil** — le seul point que ni les bouchons, ni `sql.js`, ni le
   navigateur ne peuvent trancher : ouvrir l'application sur une base **déjà installée**, créer un
   tableau avec deux ou trois listes, le rouvrir, le supprimer et contrôler que ses listes ont
   disparu avec lui (`D-L14`).
2. **`R9`** — la traduction de `schema-migration.service.ts`, en chantier séparé.
3. **`C7`** — `.sr-only` dupliquée, en attente d'une décision de portée dépôt (`P2`).
4. Le **commit** de tout ceci : laissé à l'utilisateur, ce document ne l'engage pas.
