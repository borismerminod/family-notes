---
name: diagramme_classes
description: Fait la revue d'un développement livré (fichiers modifiés pendant le dev, PAS les .spec.ts) pour créer ou mettre à jour le/les diagramme(s) de classes du dossier .agent (DIAGRAMME_CLASSES_*.md, bloc Mermaid classDiagram). Reflète les classes/interfaces/types RÉELS du code livré — leurs attributs, méthodes et relations — sans inventer ni documenter une intention non réalisée. Documentation UNIQUEMENT : ne change jamais le code ni les tests. Si un nouveau diagramme séparé dans le document semble nécessaire, AVERTIR l'utilisateur d'abord et attendre son accord. Fait valider le document. Invoquer quand une fonctionnalité vient d'être développée et qu'on veut mettre à jour la vue « classes ».
---

# Skill — Diagramme de classes (code livré → DIAGRAMME_CLASSES_*.md à jour)

> **But :** relire un développement **déjà réalisé** pour **créer ou mettre à jour** le/les
> **diagramme(s) de classes** du dossier `.agent` (`DIAGRAMME_CLASSES_<NOM>.md`). Le document
> montre, sous forme de **diagramme Mermaid `classDiagram`**, les **classes / interfaces / types
> réels** du code livré — leurs **attributs**, leurs **méthodes** et les **relations** qui les
> lient (héritage, composition, agrégation, dépendance, injection). Suite naturelle de
> [`dev_par_groupes`](../dev_par_groupes/SKILL.md), [`revue_fonctionnalite`](../revue_fonctionnalite/SKILL.md)
> et [`documenter_sources`](../documenter_sources/SKILL.md).
>
> **Invocation :** quand une réalisation est terminée (groupes verts) et que l'utilisateur veut
> **mettre à jour la vue « classes »** (« mets à jour le diagramme de classes », « ajoute la
> feature X au diagramme », « fais le diagramme de classes du lot »).
>
> **Règle d'or :** le diagramme **décrit le code tel qu'il est livré** — jamais une intention non
> réalisée. Ce skill **n'écrit que de la documentation** (`.agent/*.md`) : il **ne touche ni au
> code, ni aux tests**. Cible d'analyse = **code d'implémentation modifié**, **pas** les `.spec.ts`.
> **Ne jamais scinder** le document en un nouveau diagramme sans **avertir l'utilisateur d'abord**
> et **obtenir son accord**.

---

## Prérequis

- Un développement **terminé** dont le code a été livré (idéalement suite de tests verte à la
  sortie de [`dev_par_groupes`](../dev_par_groupes/SKILL.md)).
- Les **docs de cadrage**, pour connaître l'intention et le vocabulaire du domaine (mais le
  diagramme reflète le **code**, pas ces docs) :
  - la **SPEC** (`.agent/FEATURE_<NOM>.md`), le **plan d'implémentation** (`.agent/APPROCHE_<NOM>.md`,
    qui contient souvent déjà un diagramme *prévu*), le **plan de test** (`.agent/PLAN_TESTS_<CIBLE>.md`),
    la **revue** (`.agent/REVUE_<NOM>.md`).
  - Si un doc manque, le signaler : l'exercice reste possible en s'appuyant sur le seul code.
- Le/les **diagramme(s) existants** : `.agent/DIAGRAMME_CLASSES_*.md` et les diagrammes *prévus*
  dans les `APPROCHE_*.md` — pour **repartir de l'existant** et ne pas dupliquer une vue.

## Étape 0 — Reconstituer le périmètre livré

Cibler **ce qui a bougé pendant le dev**, côté **code d'implémentation** — pas les tests.

1. Lire les docs de cadrage (SPEC, APPROCHE, PLAN_TESTS, REVUE) pour le vocabulaire du domaine et
   les **décisions `D#`** qui expliquent une relation (ex. « marks = intervalles plats »).
2. Lister les fichiers modifiés du lot :

   ```bash
   cd /home/mateus/family-notes-agent
   git status --porcelain                       # modifs non commitées
   git diff --stat main...HEAD                   # modifs de la branche vs main
   ```
3. **Écarter les tests et le bruit**, ne garder que l'**implémentation** :
   - exclure `*.spec.ts`, `*.test.ts`, `src/test-setup.ts`, mocks/fixtures ;
   - exclure la config pure (`angular.json`, `tsconfig*.json`, `package.json`) ;
   - garder : modèles (`core/models`), services (`core/services`), composants (`.ts`),
     helpers, utilitaires — tout ce qui porte des **classes / interfaces / types**.
   Les `.spec.ts` se **lisent** pour comprendre les contrats, mais **ne figurent jamais** comme
   classes du diagramme (un fichier de test n'est pas une classe du domaine).
4. Lire **intégralement** chaque fichier retenu (pas seulement le diff) : un attribut, une méthode
   publique ou une relation peut vivre hors des lignes modifiées.

## Étape 1 — Recenser classes, membres et relations (état réel)

Pour chaque unité de type du périmètre, relever **fidèlement** :

- **Nature** : `class` / `<<interface>>` / `<<type>>` / union discriminée / enum littéral / signal
  Angular. Marquer les stéréotypes utiles comme le fait l'existant (`<<Injectable root>>`,
  `<<Component app-...>>`, `<<type>>`, `<<union: A | B>>`).
- **Attributs / champs / signals** : nom, type, visibilité (`+` public / `-` privé), défaut ou
  cardinalité utile (`?` optionnel, `Signal~T~`, `InputSignal~T~`). Prioriser l'**API réelle** ;
  ne pas gonfler avec chaque variable locale.
- **Méthodes** : signature réelle (nom, params significatifs, type de retour), visibilité. Les
  helpers **privés** peuvent être **résumés** en note plutôt que tous listés (cf. §5 de l'existant).
- **Relations** entre ces types, avec la **bonne notation Mermaid** :
  - héritage / réalisation d'interface `<|..` ,
  - **composition** `*--` (le tout possède la partie), **agrégation** `o--` (liste ordonnée /
    contenu détachable), **dépendance / usage** `..>`, **association / injection** `-->`,
  - **cardinalités** (`"1"`, `"0..*"`) et un **libellé** court quand il éclaire (`: inject()`,
    `: blocks (JSON)`).
  Rester **exact** : une relation n'est portée que si le code la crée réellement.

En cas d'**écart entre le code et un diagramme prévu** (`APPROCHE_*.md`), **suivre le code** et
**signaler l'écart** à l'utilisateur (ne pas dessiner l'intention comme si elle était réalisée).

## Étape 2 — Décider : compléter un diagramme OU en proposer un nouveau

Un fichier `DIAGRAMME_CLASSES_*.md` peut contenir **plusieurs diagrammes** (l'existant a une
Section 1 « Notes » et une Section 5 « note-editor »). **Choisir par défaut de compléter le
diagramme existant** le plus proche du périmètre.

- **Nouveau diagramme dans le document = décision de l'utilisateur.** Ne jamais scinder de
  soi-même. Envisager une nouvelle section **seulement si** : le lot introduit une vue **cohérente
  et distincte** (nouveau sous-système, nouvelle « époque » de modèle comme le pivot document), ou
  si tout fusionner rendrait le diagramme **illisible**.
- Si ce besoin se présente, **s'ARRÊTER et AVERTIR l'utilisateur** : exposer **pourquoi** un
  diagramme séparé semble préférable (ce qu'il regrouperait, ce qui le distingue de l'existant, le
  risque d'illisibilité sinon), proposer un **titre de section** et **attendre son accord explicite**
  avant de créer la nouvelle section. En cas de refus, tout intégrer au diagramme existant.
- Créer un **nouveau fichier** `DIAGRAMME_CLASSES_<NOM>.md` seulement s'il n'existe **aucun**
  document couvrant ce domaine (voir Étape 3).

## Étape 3 — Écrire / mettre à jour le document `.agent`

Fichier : `.agent/DIAGRAMME_CLASSES_<NOM>.md`. **Calquer la structure de l'existant**
(`DIAGRAMME_CLASSES_NOTES.md`) :

1. **En-tête de section** : une ligne `>` de **vision** (ce que couvre le diagramme), la **date
   absolue** (« Créé le <date> » / « Ajouté le <date> » / « Mis à jour le <date> »), et les
   **renvois** aux docs liés (`MODELE_DONNEES_*.md`, `PLAN_*.md`, `APPROCHE_*.md`).
2. **Diagramme** : un bloc ` ```mermaid ` `classDiagram` avec `direction LR`/`TB`. Regrouper les
   classes par **commentaires de section** (`%% ---------- Modèles ----------`), déclarer les
   classes/membres, **puis** les relations en fin de bloc — comme l'existant.
3. **Lecture des relations** : un **tableau** `| Relation | Signification |` qui explicite chaque
   lien non trivial (et rattache aux décisions `D#` quand c'est utile).
4. **(Optionnel) Cycle / parcours** : un petit schéma ASCII des couches si le lot en introduit un
   (cf. §3 et §7 de l'existant).
5. **Notes de conception** : points saillants, invariants, dettes assumées, et **écarts** repérés
   entre code et plans.

Si une **section existante** doit refléter du code qui a changé, **la mettre à jour sur place**
(membres, relations, date « Mis à jour le <date> ») plutôt que d'en dupliquer une nouvelle.

Créer le fichier **s'il n'existe pas** : reprendre le même squelette (titre `#`, ligne de vision,
Section 1 « Diagramme », tableau de relations, notes).

## Étape 4 — Vérifier le rendu du diagramme

Le document est inerte, mais un `classDiagram` **mal formé ne se rend pas**. Contrôler :

- **Syntaxe Mermaid** : chaque `class X { … }` fermé, relations valides (`<|..`, `*--`, `o--`,
  `..>`, `-->`), libellés après `:`. Un caractère parasite (`~`, `<`, `>` mal placé) casse le rendu.
- **Cohérence code ↔ diagramme** : chaque classe/membre/relation dessiné **existe** dans le code
  livré (revérifier par `file:line` au moindre doute) ; aucun type inventé, aucun membre fantôme.
- **Rendu visuel** *(si utile)* : ouvrir un aperçu Markdown-Mermaid. Le **Browser pane** peut
  afficher un `.md` via un aperçu compatible, ou rendre un bloc `pre.mermaid` dans une page HTML de
  contrôle jetable (scratchpad) — ne **pas** committer ce fichier de contrôle.

## Étape 5 — Faire valider par l'utilisateur — PUIS s'arrêter

Rapporter **honnêtement** :
- diagramme(s) **créé(s) / complété(s)** (liens vers les sections du `.md`) ;
- classes / types **ajoutés ou modifiés**, et **relations** nouvelles ou corrigées ;
- tout **écart code ↔ plan** repéré ;
- si un **diagramme séparé** a été proposé : l'avoir soumis **avant** de le créer, et ce qui a été
  décidé.

Puis **demander explicitement la validation** et **attendre** : l'utilisateur valide, ajuste
(niveau de détail, découpage, libellés) ou reporte. **Ne pas enchaîner de soi-même** ; en mode
plan, `ExitPlanMode` une fois le document stabilisé. Ne **pas** committer / ouvrir de PR de
soi-même — le proposer, laisser l'utilisateur décider.

Si l'exercice fait ressortir un **écart durable** (code vs plan) ou une **convention de diagramme**
à fixer, proposer une note de **mémoire projet** + une ligne dans `MEMORY.md`.

## Rappels

- **Le diagramme décrit le code livré**, pas l'intention. Chaque classe / membre / relation
  dessiné **existe** dans le code (vérifiable par `file:line`) ; on **signale** les écarts plutôt
  que de les masquer.
- **Cible d'analyse = code d'implémentation modifié** ; les `.spec.ts` se **lisent** (contrats) mais
  ne sont **jamais** des classes du diagramme.
- **Documentation uniquement** : aucun changement de code ni de test.
- **Format Mermaid `classDiagram`** calqué sur `DIAGRAMME_CLASSES_NOTES.md` : stéréotypes,
  visibilités `+/-`, notations `<|.. *-- o-- ..> -->`, cardinalités, tableau « Lecture des relations ».
- **Compléter par défaut** le diagramme existant. **Ne jamais scinder** en une nouvelle section /
  un nouveau diagramme sans **avoir averti l'utilisateur** et **obtenu son accord**.
- Dates **absolues**. Attendre l'**accord explicite** avant de clore.
- Ce skill vit dans `.agent/skill/diagramme_classes/SKILL.md` (format `SKILL.md` + frontmatter).
  Pour le rendre invocable en `/`-commande Claude Code, le copier/lier dans un dossier de skills
  reconnu (ex. `.claude/skills/diagramme_classes/`) ; le frontmatter est déjà prêt.
