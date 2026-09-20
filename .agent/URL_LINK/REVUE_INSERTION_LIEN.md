# Revue de fonctionnalité — Insertion d'un lien dans une note

**Date :** 2026-09-19
**Statut :** brouillon — à valider
**Références :** [`FEATURE_INSERTION_LIEN.md`](FEATURE_INSERTION_LIEN.md) ·
[`APPROCHE_INSERTION_LIEN.md`](APPROCHE_INSERTION_LIEN.md) ·
[`PLAN_TESTS_INSERTION_LIEN.md`](PLAN_TESTS_INSERTION_LIEN.md)
**Skill :** [`revue_fonctionnalite`](../skill/revue_fonctionnalite/SKILL.md)

**Fichiers d'implémentation revus** (delta URL_LINK, working tree ; `.spec.ts` lus comme
contrat mais **non** audités) :

- `core/models/document.model.ts` *(MOD — `MarkType += 'link'`)*
- `core/services/document-model.ts` *(MOD — `setLink`, `TYPE_ORDER`)*
- `core/services/document-render.ts` *(MOD — `tagFor` cas `link`, `TYPE_ORDER`)*
- `core/services/document-parse.ts` *(MOD — `marksForElement` cas `A`)*
- `core/services/url-sanitize.ts` *(NEW — `sanitizeHttpUrl`)*
- `core/services/external-link.ts` *(NEW — `ExternalLinkService`)*
- `rich-text-editor.ts` / `.html` / `.css` *(MOD — bouton, barre 2 champs, insertion, tap)*

---

## Synthèse

Implémentation **fidèle** à l'APPROCHE et au PLAN_TESTS, décisions `DL#` respectées à la
lettre, code sobre et **bien documenté** (JSDoc renvoyant aux `US`/`DL`/`§`). La dette
introduite est **faible**. Points remarquables, sains :

- **Réutilisation maximale de l'algèbre existante** : `setLink` délègue à `setValueMark`
  (une ligne), l'algèbre d'intervalles rend US6/persistance « gratuites » comme prévu.
- **Sanitation centralisée** dans un module dédié [`url-sanitize.ts`](../../frontend/src/app/core/services/url-sanitize.ts)
  plutôt qu'en méthode privée du parser (comme l'esquissait l'APPROCHE §3 Lot B) : **meilleur
  choix** — point unique `DL6` réellement partagé par parse/insertion/ouverture ; renvoie la
  chaîne d'origine (pas `url.href`) pour ne pas casser le round-trip.
- **Hygiène TDD** : `onEditorClick` enveloppe l'`open()` async (`Promise.resolve(...).catch`)
  pour éviter tout `unhandled rejection`.

Les constats ci-dessous sont surtout des **finitions** et **deux points de validation** ;
aucun bug fonctionnel détecté à la lecture.

---

## Constats

### C1 — Règle CSS morte `.format-toolbar::-webkit-scrollbar` *(cosmétique)*

[`rich-text-editor.css:22`](../../frontend/src/app/rich-text-editor/rich-text-editor.css:22).
La barre d'outils est passée de `flex-wrap: nowrap` + `overflow-x: auto` +
`scrollbar-width: none` à **`flex-wrap: wrap`** (pour loger le nouveau bouton 🔗). La règle
`::-webkit-scrollbar { display: none; }` masquait la scrollbar de l'ancien défilement
horizontal : elle **n'a plus d'objet** (la barre ne défile plus, elle retourne à la ligne).
**Impact :** lisibilité / code mort.

### C2 — `trim()` redondant à l'appel de `sanitizeHttpUrl` *(cosmétique)*

[`rich-text-editor.ts:152`](../../frontend/src/app/rich-text-editor/rich-text-editor.ts:152) :
`sanitizeHttpUrl(this.linkUrl().trim())`. `sanitizeHttpUrl` **trim déjà** en interne
([`url-sanitize.ts:21`](../../frontend/src/app/core/services/url-sanitize.ts:21)). Le `.trim()`
au call site est sans effet. **Impact :** micro-redondance ; inoffensif.

### C3 — Filet de tests non exécutable en l'état *(important — prérequis de clôture)*

La cible `ExternalLinkService` importe `@capacitor/browser`, **dépendance pas encore
installée** (`npm install` + `npx cap sync` en attente, cf. mémoire `url-link-feature`). Tant
que ce n'est pas fait, le **piège builder** (`@angular/build:unit-test` compile tout le bundle
en une passe) fait échouer la compilation → **toutes** les suites sont bloquées, y compris les
tests `link` déjà écrits. **Impact :** le filet de sécurité qui protège tout refactoring
ultérieur ne peut pas tourner ; la livraison n'est pas vérifiable.

### C4 — Ouverture au tap **inconditionnelle** vs placement du curseur *(important — UX / à trancher)*

[`rich-text-editor.ts:194`](../../frontend/src/app/rich-text-editor/rich-text-editor.ts:194)
`onEditorClick` ouvre le lien **que l'éditeur ait le focus ou non** (décision assumée
`APPROCHE §0.3`, écart avec US5). Conséquence directe, déjà pointée en `APPROCHE §4` : **on ne
peut plus placer le curseur *dans* un lien par un simple tap** (le tap ouvre le navigateur), ce
qui **complique US6** (retrait par effacement) — il faut viser un bord du lien ou une sélection
englobante. **Impact :** comportement réel sur mobile non encore vérifié ; risque
d'ergonomie. Ce n'est pas un bug (c'est un choix), mais il mérite une **validation manuelle** et
une **décision explicite**.

### C5 — Duplication de forme `insertLinkFromUrl` / `insertVideoFromUrl` *(mineur — différé)*

[`rich-text-editor.ts:151`](../../frontend/src/app/rich-text-editor/rich-text-editor.ts:151)
reprend le patron « `trim` → no-op si vide → insérer → fermer » de `insertVideoFromUrl`, et sa
branche « pas de curseur → nouveau bloc à `insertionIndex` » redit la logique de placement de
`insertBlock`. **C'est un choix de conception assumé** : l'APPROCHE (§3 Lots C/D) a
**explicitement demandé aucune abstraction**, pour rester au plus près de la barre vidéo.
**Impact :** duplication mineure et **volontaire** ; à ne réévaluer que si une 3ᵉ insertion
inline apparaît.

### C6 — `setLink` : chemin remplacement/toggle non atteignable par l'UI de ce lot *(mineur — informatif)*

[`document-model.ts:38`](../../frontend/src/app/core/services/document-model.ts:38). `setLink`
gère le remplacement d'URL et le toggle (via `setValueMark`), mais l'UI insère **toujours** la
marque sur du **texte neuf** (jamais déjà lié) → ces chemins ne sont pas empruntés par ce lot.
Ils **restent couverts** par les tests modèle (`§A2` : TA2.1/2.2/2.3) et servent la symétrie
d'API + une **édition future** (hors périmètre). **Impact :** aucun (ni code mort, ni risque) —
simple note de traçabilité.

---

## Refactorings proposés

### R1 ← C1 — Supprimer la règle CSS orpheline *(quick win, risque nul)*

Retirer le bloc `.format-toolbar::-webkit-scrollbar { display: none; }`
([`rich-text-editor.css:22`](../../frontend/src/app/rich-text-editor/rich-text-editor.css:22)).
**Fichier :** `rich-text-editor.css`. **Filet :** rendu visuel (`dev_par_groupes` étape 4,
Browser pane) — aucun test unitaire concerné. **Priorité :** haute (trivial). **Effort :** ~1 min.

### R2 ← C2 — Retirer le `.trim()` redondant *(quick win, risque nul)*

`sanitizeHttpUrl(this.linkUrl())` au lieu de `...linkUrl().trim())`
([`rich-text-editor.ts:152`](../../frontend/src/app/rich-text-editor/rich-text-editor.ts:152)).
**Filet :** `§C+D` (TCD2.4 « trim avant insertion ») reste vert puisque la sanitation trim.
**Priorité :** basse. **Effort :** ~1 min. *(Alternative : garder pour l'auto-documentation ;
au choix.)*

### R3 ← C3 — Débloquer et faire tourner le filet *(prérequis, à faire d'abord)*

`npm install @capacitor/browser@8` (version alignée sur `@capacitor/core` v8, `APPROCHE §4`)
puis `npx cap sync`, puis lancer la suite (node bundlé LM Studio, cf. mémoire
`run-frontend-tests`) et **constater le vert réel** des cibles `link`. **Fichiers :**
`package.json` (déjà modifié — à vérifier), lockfile. **Filet :** c'est lui-même le
rétablissement du filet. **Priorité :** **haute — bloquant**, à faire **avant** tout autre
refacto. **Effort :** court (hors aléas d'install ; `node_modules` root-owned, cf. mémoire —
peut nécessiter l'intervention utilisateur).

### R4 ← C4 — Valider US6 sur mobile + trancher l'ouverture au tap *(décision utilisateur)*

Test manuel sur appareil : vérifier qu'on **sait retirer un lien** (bords + sélection
englobante) malgré l'ouverture au tap ; puis **décider** : garder l'ouverture inconditionnelle
(actuelle) ou n'ouvrir **que hors focus** (option écartée en `§0.3`, réactivable si l'ergonomie
gêne). Documenter le geste retenu côté utilisateur. **Fichiers si changement :**
`rich-text-editor.ts` (`onEditorClick`) + tests `§E2`. **Priorité :** moyenne. **Effort :**
validation courte ; refacto seulement si l'option est changée.

### R5 ← C5 — (Différé) Factoriser l'insertion inline *(ne rien faire maintenant)*

Si une 3ᵉ insertion inline apparaît, extraire un helper privé
`insertInlineAtCaretOrNewBlock(text, marks)` partagé. **Tant que non** : **respecter la
décision APPROCHE** (aucune abstraction) et **laisser en l'état**. **Priorité :** aucune (veille).

---

## Priorisation

1. **R3** — installer `@capacitor/browser` + `cap sync` + suite verte *(prérequis bloquant)*.
2. **R1**, **R2** — quick wins zéro risque, une fois la suite verte pour re-vérifier.
3. **R4** — validation manuelle mobile de US6 + décision UX sur le tap.
4. **R5** — différé (ne pas anticiper).

**Explicitement hors périmètre** (rappel SPEC/APPROCHE §5, inchangé par cette revue) : édition
d'un lien posé, bouton « retirer le lien », état « lien actif » dans la barre (`ActiveState`),
auto-linkification, prévisualisation enrichie, liens internes, validation métier de l'URL
distante.

---

## Points à trancher (utilisateur)

- **C4/R4** — garde-t-on l'ouverture au tap **inconditionnelle**, ou bascule-t-on sur
  « ouvrir seulement hors édition » pour faciliter le placement du curseur / US6 ?
- **R2** — retirer le `.trim()` redondant, ou le conserver pour la lisibilité ?
