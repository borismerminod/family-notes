---
name: approche_dev
description: Établit une approche de développement à partir d'une SPEC (FEATURE_*.md). Produit un document contenant un diagramme de classes Mermaid (attributs de chaque classe quand c'est possible + relations entre classes) et une approche de développement décrivant les algorithmes à réaliser pour implémenter le besoin. Fait valider le document au fil des échanges. Invoquer quand une spec/feature est cadrée et qu'on veut concevoir le « comment » avant d'écrire les tests ou le code.
---

# Skill — Approche de développement (SPEC → conception validée)

> **But :** transformer une SPEC cadrée (`FEATURE_*.md`) en un document de conception qui
> décrit **comment** réaliser le besoin : un **diagramme de classes** et les **algorithmes**
> à implémenter. Se place entre [`formaliser_demande`](../formaliser_demande/SKILL.md) (le
> « quoi ») et [`plan_test`](../plan_test/SKILL.md) (les tests).
>
> **Invocation :** quand une spec / feature existe (ou vient d'être décrite) et que
> l'utilisateur veut cadrer l'approche technique (« établis l'approche de dev », « conçois la
> solution », « fais le diagramme de classes et les algos »).
>
> **Règle d'or :** ce skill **conçoit et fait valider un document**. Il **n'écrit ni test, ni
> code d'implémentation**. Il s'arrête sur une conception approuvée par l'utilisateur.

---

## Étape 0 — Prendre connaissance de la SPEC et de l'existant

1. Lire la SPEC de référence : `.agent/FEATURE_<NOM>.md` (explication + périmètre + user
   stories). Si elle n'existe pas, produire d'abord la formalisation via le skill
   [`formaliser_demande`](../formaliser_demande/SKILL.md).
2. Se replacer dans l'architecture : lire les docs `.agent/*.md` pertinents
   (`DIAGRAMME_CLASSES_NOTES.md`, `MODELE_DONNEES_*.md`, `PLAN_*.md`) et la mémoire projet,
   pour **réutiliser** les modèles, services et composants existants plutôt que réinventer.
3. Lire le code concerné (`core/models`, `core/services`, composants) pour connaître les
   signatures et conventions réelles.

## Étape 1 — Poser les questions de cadrage technique (si nécessaire)

Utiliser `AskUserQuestion` **uniquement** pour les choix de conception qui changent la
structure ou les algorithmes. Questions typiques :
- **Périmètre technique** : nouveaux modèles vs extension de l'existant ; où vit la logique
  (service, composant, helper) ?
- **Structures de données** : forme d'une donnée clé, invariants à garantir.
- **Cas limites algorithmiques** : concurrence, erreurs, migration de données existantes.

Ne pas interroger sur ce qui a un défaut évident ou déjà tranché : choisir, l'annoncer,
avancer.

## Étape 2 — Écrire le document d'approche dans `.agent`

Fichier : `.agent/APPROCHE_<NOM>.md` (ex. `APPROCHE_PARTAGE_NOTE.md`). Structure obligatoire :

1. **En-tête** : titre, date (absolue), statut *(brouillon — à valider)*, référence à la
   SPEC (`FEATURE_<NOM>.md`) et aux docs complétés.
2. **Diagramme de classes** — bloc **Mermaid `classDiagram`**, calqué sur
   `DIAGRAMME_CLASSES_NOTES.md` :
   - une `class` par entité du domaine (modèles, services, composants clés) ;
   - **les attributs typés quand c'est possible** (`+string id`, `+NoteBlock[] blocks`, `?`
     pour l'optionnel) ; méthodes clés des services quand elles éclairent l'approche ;
   - stéréotypes utiles (`<<interface>>`, `<<service>>`, `<<union: A | B>>`) ;
   - **les relations entre classes** avec cardinalités et sens : composition `*--`,
     agrégation `o--`, association `-->`, réalisation `..|>`, dépendance `..>` ;
   - sections commentées (`%% ----`) pour regrouper (domaine / services / UI).
   - **Distinguer** ce qui existe déjà de ce qui est **à créer** (commentaire ou note sous
     le diagramme).
3. **Approche de développement** : pour chaque partie à implémenter, décrire **l'algorithme**
   à réaliser — en langage clair ou pseudo-code, pas en code final :
   - **entrées / sorties**, structures manipulées, invariants ;
   - **étapes** de l'algorithme (numérotées), **cas nominaux et cas limites/erreurs** ;
   - points d'intégration avec l'existant (quel service/méthode appeler, quoi étendre) ;
   - regrouper par **lot / responsabilité**, et relier chaque partie aux **user stories**
     de la SPEC qu'elle sert.
4. **Impacts & points d'attention** : migrations de données, effets de bord, dépendances
   entre lots, risques.
5. **Découpage suggéré** : ordre de réalisation conseillé (ce qui alimentera `plan_test` puis
   `dev_par_groupes`), et ce qui est **hors périmètre** de ce lot.

## Étape 2 bis — Valider le diagramme Mermaid (obligatoire)

Avant de présenter le document, **vérifier que le diagramme se rend** — cf. mémoire
`valider-mermaid` : tester la source via `mermaid.render()` en chaîne JS (par ex. dans le
Browser pane), **jamais** en la collant dans un `<pre>` (les `<<annotation>>` seraient
mangées et produiraient un faux « Parse error »). Corriger la source tant qu'elle n'est pas
valide.

## Étape 3 — Faire valider et affiner (boucle d'échanges)

Présenter le document et inviter l'utilisateur à l'ajuster. Deux axes, appliqués directement
dans le `.md` :
- **Sur le diagramme** : ajouter/retirer une classe, corriger un attribut, un type, une
  relation ou une cardinalité.
- **Sur l'approche** : préciser/reformuler un algorithme, ajouter un cas limite, revoir le
  découpage.

À chaque retour : mettre à jour le fichier, **re-valider le Mermaid** si le diagramme a
changé, résumer en une ligne ce qui a changé, et redemander si ça convient. **Ne pas** clore
sans **accord explicite**. En mode plan : `ExitPlanMode` une fois le document stabilisé.

## Étape 4 — Clôturer

Une fois validé :
- Passer le statut d'en-tête à *(validé le <date>)*.
- Proposer (sans l'imposer) la suite : enchaîner sur [`plan_test`](../plan_test/SKILL.md)
  pour cadrer les tests d'un des lots décrits.
- Si l'approche fait évoluer durablement le modèle, proposer de mettre à jour
  `DIAGRAMME_CLASSES_NOTES.md` / `MODELE_DONNEES_*.md` et la **mémoire projet** + `MEMORY.md`.

## Rappels

- Ce skill **ne code pas** et **n'écrit pas de tests** : il livre une conception (diagramme
  + algorithmes).
- **Attributs dans le diagramme quand c'est possible**, et **toujours les relations** entre
  classes.
- Les algorithmes se décrivent en **pseudo-code / langage clair**, orientés étapes et cas
  limites — pas d'implémentation finale.
- **Toujours valider le rendu Mermaid** (mémoire `valider-mermaid`) avant de présenter.
- **Réutiliser** l'existant ; distinguer clairement le neuf de l'existant.
- Convertir les dates relatives en absolues. Attendre l'**accord explicite** avant de clore.
- Ce skill vit dans `.agent/skill/approche_dev/SKILL.md` (format `SKILL.md` + frontmatter).
  Pour le rendre invocable en `/`-commande Claude Code, le copier/lier dans un dossier de
  skills reconnu (ex. `.claude/skills/approche_dev/`) ; le frontmatter est déjà prêt.
