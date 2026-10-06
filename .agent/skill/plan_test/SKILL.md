---
name: plan_test
description: Rédige le plan de test d'une réalisation à venir, en TDD boîte noire, via une démarche de co-construction d'un diagramme Cause-Effet. Le processus est itératif : discussion sur les couples [Cause $\rightarrow$ Effet] $\rightarrow$ assemblage du diagramme $\rightarrow$ rédaction du plan de test (déduit du diagramme). Prend connaissance de la SPEC et de l'APPROCHE, pose les questions de cadrage, et demande validation finale.
---

# Skill — Plan de test (Co-construction Cause-Effet $\rightarrow$ Plan validé)

> **But :** produire le **plan de test** d'une réalisation à venir, en TDD boîte noire, via un **diagramme Cause-Effet** co-construit par discussion. Ce diagramme sert de base pour déduire les cas de test. Se place entre [`approche_dev`](../approche_dev/SKILL.md) et [`ecrire_tests`](../ecrire_tests/SKILL.md).
>
> **Invocation :** quand l'utilisateur demande de préparer / cadrer les tests d'un composant,
> service ou écran (« fais un plan de test pour… », « cadre les tests de… »).
>
> **Règle d'or :** ce skill **s'arrête** au plan validé dans `.agent`. Il **n'écrit pas le
> `.spec.ts`** (c'est le skill [`ecrire_tests`](../ecrire_tests/SKILL.md)), ni composant, ni
> implémentation.

---

## Étape 0 — Prendre connaissance de la réalisation

1. Lire les documents de cadrage : la **SPEC** (`.agent/FEATURE_<NOM>.md`) et l'**approche de dev** (`.agent/APPROCHE_<NOM>.md`).
2. Lire aussi les autres docs `.agent/*.md` pertinents (`MODELE_DONNEES_*.md`, `DIAGRAMME_CLASSES_*.md`, les `PLAN_TESTS_*.md` existants) et la mémoire projet (`test-setup-notes-service`, `notes-service-findings`).
3. Lire le code concerné et ses voisins : modèles (`core/models`), service(s) (`core/services`), composants existants et **leur `.spec.ts`** (source de vérité des conventions), routes (`app.routes.ts`).
4. Repérer ce qui existe déjà et **doit être réutilisé** (méthodes de service, doublures, helpers DOM, composants partagés comme `ConfirmDialog`) — ne pas réinventer.

## Étape 1 — Poser les questions de cadrage (si nécessaire)

Utiliser `AskUserQuestion` **uniquement** pour les choix qui changent les assertions.
Questions typiques :
- **Périmètre** : squelette fonctionnel vs minimal vs complet (découper si le sujet couvre plusieurs phases).
- **Déclencheurs** : bouton explicite vs auto-save/debounce ; création + édition vs édition seule ; route unique vs routes séparées.
- Toute ambiguïté de comportement observable non tranchée par la SPEC ou l'approche.

Ne pas demander ce qui a un défaut évident (nom de fichier, conventions déjà étabues) : choisir, l'annoncer, avancer.

## Étape 2 — Co-construction et Rédaction

Cette étape se déroule en deux phases interactives.

### 2.1. Phase de discussion (Diagramme Cause-Effet)

L'objectif est de mapper les interactions système via un diagramme de flux.
1. **Proposition** : Je propose une série de couples [Action/Cause $\rightarrow$ Effet/Réaction] (incluant les parcours nominaux, les erreurs et les cas limites).
2. **Discussion** : L'utilisateur valide, complète ou contredit mes propositions. On discute jusqu'à ce que l'ensemble des user stories soit couvert par ces flux.
3. **Assemblage** : Une fois d'accord, je rédige un document `.agent/PLAN_TESTS_<CIBLE>.md` qui intègre un **diagramme Mermaid** (type `graph TD` ou `stateDiagram-v2`) illustrant cette logique.

### 2.2. Phase de rédaction (Plan de Test)

Une fois le diagramme stabilisé, je complète le fichier `.agent/PLAN_TESTS_<CIBLE>.md` avec la structure suivante :

1. **En-tête** : approche boîte noire / TDD, référence à la SPEC + à l'approche de dev.
2. **Objet testé** : rôle fonctionnel, périmètre validé, **hors périmètre** explicite.
3. **Diagramme Cause-Effet** (Mermaid) : le diagramme co-construit.
4. **Décisions de conception à figer** (`D1`, `D2`, …) : chaque décision qui impacte une assertion, suivie de *(à confirmer)*.
5. **Cas de test** groupés (`Groupe N`) et numérotés (`T1.1`, `T1.2`, …), **directement déduits des transitions/nœuds du diagramme**, un comportement observable par cas, formulé en langage métier, **relié aux user stories** de la SPEC.
6. **Dépendances (abstraites) & doublures** : source de données, navigation, route, confirmation… décrites sans figer de signature d'API précise.
7. **Contrat DOM** : table des sélecteurs ciblés par les tests (fixe le contrat que l'implémentation devra honorer).
8. **Ordre d'implémentation TDD suggéré** (rouge $\rightarrow$ vert, groupe par groupe).

## Étape 3 — Demander validation — PUIS s'arrête

Présenter le plan complet (Diagramme + Cas de test) et **attendre l'accord explicite**. En mode plan : `ExitPlanMode`. Sinon : demander clairement « je valide ce plan de test ? ».

Une fois validé, **ne pas** écrire le `.spec.ts` : proposer (sans l'imposer) d'enchaîner sur le skill [`ecrire_tests`](../ecrire_tests/SKILL.md), qui traduira ce plan en code de test.

## Rappels

- Ce skill livre **un plan de test complet**, rien d'autre : pas de `.spec.ts`, pas de code.
- Le plan doit être **exécutable par `ecrire_tests`** sans re-décision : cas groupés, décisions `D#` figées, Contrat DOM précis.
- Les cas de test doivent être la **traduction directe du diagramme cause-effet**.
- Convertir les dates relatives en absolues dans les docs.
- Si le sujet est trop large pour un `.spec.ts`, proposer un découpage plutôt qu'un plan géant.
- Ce skill vit dans `.agent/skill/plan_test/SKILL.md` (format `SKILL.md` + frontmatter). Pour le rendre invocable en `/`-commande Claude Code, le copier/lier dans un dossier de skills reconnu (ex. `.claude/skills/plan_test/`).
