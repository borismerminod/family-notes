---
name: formaliser_demande
description: Formalise un besoin de développement en document cadré — écoute l'explication orale du besoin, la reformule dans un .md structuré (explication du développement à réaliser + liste de User Stories), puis fait valider et affiner le document au fil des échanges (ajustements des explications ou des user stories) jusqu'à l'accord de l'utilisateur. Invoquer quand l'utilisateur explique un besoin/une fonctionnalité à réaliser et veut le cadrer avant de partir sur les tests ou le code.
---

# Skill — Formalisation d'une demande (besoin → document validé)

> **But :** transformer un besoin exprimé à l'oral en un document de cadrage clair et
> validé, réutilisable comme point de départ des skills [`plan_test`](../plan_test/SKILL.md)
> et [`dev_par_groupes`](../dev_par_groupes/SKILL.md).
>
> **Invocation :** quand l'utilisateur décrit une fonctionnalité ou un besoin de
> développement pour le projet (« j'aimerais pouvoir… », « il faudrait que… », « formalise
> ce besoin… ») et veut le cadrer **avant** d'écrire tests ou implémentation.
>
> **Règle d'or :** ce skill **produit et fait valider un document**. Il **n'écrit ni test,
> ni code**. Il s'arrête sur un document approuvé par l'utilisateur.

---

## Étape 0 — Prendre connaissance du contexte

1. Écouter/relire attentivement le besoin exprimé par l'utilisateur : **quel problème**
   résout la fonctionnalité, **pour qui**, **dans quel écran/parcours**.
2. Se replacer dans le projet : lire les documents `.agent/*.md` pertinents
   (`PLAN_GLOBAL.md`, `PLAN_NOTES.md`, `MODELE_DONNEES_*.md`, `DIAGRAMME_CLASSES_*.md`) et la
   mémoire projet, pour rattacher le besoin à l'existant et éviter de recadrer ce qui est
   déjà décidé.
3. Repérer les fonctionnalités/composants voisins déjà en place, qui contraignent ou
   inspirent la formalisation.

## Étape 1 — Poser les questions de cadrage (si nécessaire)

Utiliser `AskUserQuestion` **uniquement** pour les zones d'ombre qui changent la nature du
besoin ou le périmètre des user stories. Questions typiques :
- **Acteur/rôle** : qui déclenche le besoin (utilisateur simple, parent, enfant…) ?
- **Périmètre** : version minimale attendue vs complète ; ce qui est explicitement **hors
  périmètre** pour ce lot.
- **Déclencheurs & résultats observables** : geste attendu, résultat visible, cas limites.

Ne pas interroger sur ce qui a un défaut évident ou déjà tranché ailleurs : choisir,
l'annoncer, avancer. Une seule salve de questions bien ciblées vaut mieux qu'un
interrogatoire.

## Étape 2 — Écrire le document de formalisation dans `.agent`

Fichier : `.agent/FEATURE_<NOM>.md` (ex. `FEATURE_PARTAGE_NOTE.md`). Structure obligatoire :

1. **En-tête** : titre du besoin, date (absolue), statut *(brouillon — à valider)*.
2. **Explication du développement à réaliser** : quelques paragraphes en langage métier
   décrivant **le quoi et le pourquoi** — le problème résolu, le comportement attendu, le
   parcours utilisateur concerné. Rester fonctionnel : **pas** de choix techniques imposés
   ici sauf contrainte réelle.
3. **Périmètre** : ce qui est **inclus** dans ce lot et, explicitement, ce qui est **hors
   périmètre** (reporté à plus tard).
4. **User Stories** : liste numérotée (`US1`, `US2`, …), chacune au format
   **« En tant que _<rôle>_, je veux _<action>_ afin de _<bénéfice>_. »**, suivie de
   **critères d'acceptation** en puces (comportements observables, cas limites). Une story
   = un besoin atomique et vérifiable.
5. **Questions ouvertes / hypothèses** *(optionnel)* : points à trancher avec l'utilisateur.

Calquer le ton des autres docs `.agent` (métier, concis, dates absolues).

## Étape 3 — Faire valider et affiner (boucle d'échanges)

Présenter le document et **inviter explicitement l'utilisateur à le compléter/corriger**.
Deux types d'ajustements possibles, à appliquer directement dans le `.md` :
- **Sur les explications** : préciser, reformuler, corriger le périmètre ou le comportement
  décrit.
- **Sur les user stories** : ajouter / supprimer / reformuler une story, ajuster un rôle, un
  bénéfice ou des critères d'acceptation.

À chaque retour : mettre à jour le fichier, résumer en une ligne **ce qui a changé**, et
redemander si le document convient. **Ne pas** clore tant que l'utilisateur n'a pas donné
son **accord explicite**. En mode plan : `ExitPlanMode` une fois le document stabilisé.

## Étape 4 — Clôturer

Une fois le document validé :
- Passer le statut d'en-tête à *(validé le <date>)*.
- Proposer (sans l'imposer) la suite logique : enchaîner sur le skill
  [`plan_test`](../plan_test/SKILL.md) pour cadrer les tests d'une des user stories.
- Si le besoin structure durablement le projet, proposer une note de **mémoire projet** +
  une ligne dans `MEMORY.md`.

## Rappels

- Ce skill **ne code pas** et **n'écrit pas de tests** : il livre un document de cadrage.
- Une user story reste **atomique, orientée valeur et vérifiable** (rôle → action →
  bénéfice + critères d'acceptation).
- Toujours **attendre l'accord explicite** avant de considérer le document comme validé.
- Convertir les dates relatives en absolues dans le document.
- Ce skill vit dans `.agent/skill/formaliser_demande/SKILL.md` (format `SKILL.md` +
  frontmatter). Pour le rendre invocable en `/`-commande Claude Code, le copier/lier dans un
  dossier de skills reconnu (ex. `.claude/skills/formaliser_demande/`) ; le frontmatter est
  déjà prêt.
