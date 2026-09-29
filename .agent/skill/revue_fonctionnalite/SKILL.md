---
name: revue_fonctionnalite
description: Fait la revue d'une fonctionnalité livrée à partir du plan de test (PLAN_TESTS_*.md) et du plan d'implémentation (APPROCHE_*.md), inspecte les fichiers d'implémentation modifiés pendant le dev (surtout le code, PAS les .spec.ts) et propose un plan de refactoring validé dans .agent. Ne refactore PAS lui-même : il produit un document de constats + refactorings priorisés et le fait valider. Invoquer quand une fonctionnalité vient d'être développée (groupes verts) et qu'on veut la relire et préparer son nettoyage avant de clore.
---

# Skill — Revue de fonctionnalité (plans + code livré → plan de refactoring validé)

> **But :** relire une fonctionnalité **déjà développée**, en confrontant le **code
> d'implémentation modifié** à ce qui était prévu (plan de test `PLAN_TESTS_*.md` + plan
> d'implémentation `APPROCHE_*.md`, et la SPEC `FEATURE_*.md`), puis produire un **plan de
> refactoring** priorisé et validé. Suite naturelle du skill
> [`dev_par_groupes`](../dev_par_groupes/SKILL.md).
>
> **Invocation :** quand une réalisation est terminée (groupes verts) et que l'utilisateur
> veut la **relire / auditer / nettoyer** (« fais la revue de la fonctionnalité X »,
> « propose un plan de refacto », « relis le code livré avant de clore »).
>
> **Règle d'or :** ce skill **inspecte et propose** — il **ne refactore pas**, **n'écrit ni
> code, ni test**. Il s'arrête sur un **plan de refactoring approuvé** par l'utilisateur.

---

## Étape 0 — Reconstituer le périmètre livré

1. Lire les documents de cadrage, sources de vérité de l'**intention** :
   - la **SPEC** (`.agent/FEATURE_<NOM>.md` — user stories + critères d'acceptation),
   - le **plan d'implémentation** (`.agent/APPROCHE_<NOM>.md` — diagramme de classes +
     algorithmes prévus),
   - le **plan de test** (`.agent/PLAN_TESTS_<CIBLE>.md` — cas `T#.x`, décisions `D#`,
     Contrat DOM).
   Si l'un manque, le signaler : la revue est possible mais moins étayée (dire sur quoi elle
   s'appuie réellement).
2. Lire les autres docs `.agent/*.md` pertinents (`DIAGRAMME_CLASSES_*.md`,
   `MODELE_DONNEES_*.md`, `PLAN_*.md`) et la mémoire projet, pour connaître les **conventions
   et l'existant réutilisable** (un « refactoring » proposé ne doit pas contredire une
   décision déjà prise ailleurs).

## Étape 1 — Repérer les fichiers d'implémentation modifiés

Cibler **ce qui a bougé pendant le dev**, et se concentrer sur le **code d'implémentation** —
**pas** les fichiers de test.

1. Lister les fichiers modifiés du lot (working tree + commits de la branche de la feature) :

   ```bash
   cd /home/mateus/family-notes-agent
   git status --porcelain                       # modifs non commitées
   git diff --stat main...HEAD                   # modifs de la branche vs main
   ```
2. **Écarter les fichiers de test et le bruit** pour ne garder que l'implémentation :
   - exclure `*.spec.ts`, `*.test.ts`, `src/test-setup.ts`, mocks/fixtures de test ;
   - exclure la config pure si elle n'est pas au cœur du sujet (`angular.json`,
     `tsconfig*.json`, `package.json`) — la **mentionner** si elle a changé, sans en faire le
     centre de la revue.
   - garder : modèles (`core/models`), services (`core/services`), composants (`.ts`,
     `.html`), helpers, utilitaires.
   Les `.spec.ts` restent utiles comme **contrat de comportement** (ce que le code doit
   continuer de respecter) — les **lire pour comprendre**, mais **ne pas les auditer** comme
   cible du refactoring.
3. Lire **intégralement** chaque fichier d'implémentation retenu (pas seulement le diff) :
   un refactoring pertinent tient compte du fichier entier et de ses voisins.

## Étape 2 — Analyser (constats, pas encore de solution)

Confronter le code livré à l'intention et aux bonnes pratiques du projet. Pistes d'analyse :

- **Conformité au plan** : le code réalise-t-il l'algorithme d'`APPROCHE_*.md` et les
  décisions `D#` du plan de test ? Écarts assumés vs dérives non documentées.
- **Duplication & réutilisation** : logique copiée qui devrait vivre dans un service/helper
  partagé ; réimplémentation de ce qui existe déjà (cf. `DIAGRAMME_CLASSES_*.md`).
- **Responsabilités** : composant qui porte de la logique métier déplaçable en service ;
  fonctions trop longues ou faisant trop de choses ; couplages inutiles.
- **Lisibilité & conventions** : nommage, cohérence avec le code voisin, commentaires
  obsolètes ou manquants, code mort laissé par le TDD.
- **Robustesse** : cas limites/erreurs du plan réellement gérés ; `async` non protégé ;
  invariants du modèle respectés.
- **Contrat DOM & testabilité** : sélecteurs conformes au Contrat DOM ; structure qui
  faciliterait/compliquerait l'évolution des tests.

Rester **factuel** : chaque constat s'appuie sur un emplacement précis (lien `file:line`).
Ne pas inventer de problème ; si le code est propre sur un axe, le dire.

## Étape 3 — Écrire le plan de refactoring dans `.agent`

Fichier : `.agent/REVUE_<NOM>.md` (ex. `REVUE_INSERTION_LIEN.md`). Structure obligatoire :

1. **En-tête** : titre, date (absolue), statut *(brouillon — à valider)*, références (SPEC,
   APPROCHE, PLAN_TESTS concernés) et **liste des fichiers d'implémentation revus**.
2. **Synthèse** : en quelques lignes, l'état général du code livré (ce qui est sain, les
   points saillants). Une revue honnête reconnaît ce qui va bien.
3. **Constats** (`C1`, `C2`, …) : un constat par point, chacun avec :
   - **emplacement** (`file:line`), **description factuelle** du problème,
   - **impact** (lisibilité / duplication / robustesse / conformité au plan…),
   - **gravité** *(bloquant / important / cosmétique)*.
4. **Refactorings proposés** (`R1`, `R2`, …), **reliés aux constats** qu'ils résolvent :
   - **objectif** et **transformation** proposée (décrite, pas codée) ;
   - **fichiers touchés**, **risque de régression** et **filet** (quels tests couvrent, ou
     lesquels ajouter d'abord) ;
   - **priorité** et **effort** estimé.
5. **Priorisation** : ordre conseillé (ex. quick wins sans risque d'abord, refactos
   structurels ensuite), et ce qui est **explicitement hors périmètre** / reporté.
6. **Points à trancher** *(optionnel)* : arbitrages qui appartiennent à l'utilisateur.

Calquer le ton des docs `.agent` (concis, factuel, dates absolues).

## Étape 4 — Faire valider et affiner — PUIS s'arrêter

Présenter le document et **inviter l'utilisateur à l'ajuster** : retirer un refactoring jugé
inutile, revoir une priorité, ajouter un axe oublié. Appliquer les retours directement dans
le `.md`, résumer en une ligne ce qui a changé, et redemander si ça convient. **Ne pas** clore
sans **accord explicite**. En mode plan : `ExitPlanMode` une fois le plan stabilisé.

Une fois validé :
- Passer le statut d'en-tête à *(validé le <date>)*.
- **Ne pas** enchaîner l'implémentation des refactorings de soi-même : proposer (sans
  l'imposer) de les réaliser — idéalement en TDD via [`dev_par_groupes`](../dev_par_groupes/SKILL.md)
  quand un refactoring touche du comportement couvert par tests, chaque `R#` validé un par un.
- Si la revue fait ressortir un piège durable, proposer une note de **mémoire projet** +
  une ligne dans `MEMORY.md`.

## Rappels

- Ce skill **ne refactore pas** : il livre un **document** de constats + refactorings
  priorisés, et le fait valider. Aucune modification de code ou de test.
- **Cible = fichiers d'implémentation modifiés** ; les `.spec.ts` se **lisent** (contrat de
  comportement) mais ne sont **pas** l'objet du refactoring.
- Chaque constat est **factuel et localisé** (`file:line`) ; reconnaître aussi ce qui est
  propre.
- Un refactoring proposé **ne contredit pas** une décision déjà actée ailleurs et **précise
  son filet de sécurité** (tests) contre les régressions.
- Convertir les dates relatives en absolues. Attendre l'**accord explicite** avant de clore.
- Ce skill vit dans `.agent/skill/revue_fonctionnalite/SKILL.md` (format `SKILL.md` +
  frontmatter). Pour le rendre invocable en `/`-commande Claude Code, le copier/lier dans un
  dossier de skills reconnu (ex. `.claude/skills/revue_fonctionnalite/`) ; le frontmatter est
  déjà prêt.
