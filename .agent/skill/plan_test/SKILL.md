---
name: plan_test
description: Rédige UNIQUEMENT le plan de test d'une réalisation à venir, en TDD boîte noire, à partir de la spec (FEATURE_*.md) et du plan de développement (APPROCHE_*.md). Prend connaissance du besoin, pose les questions de cadrage, écrit un plan de test dans .agent (cas groupés, décisions figées, contrat DOM) et demande validation. N'écrit PAS le .spec.ts — c'est le rôle du skill ecrire_tests. Invoquer quand l'utilisateur demande de préparer/cadrer le plan de test d'un composant, service ou écran.
---

# Skill — Plan de test (spec + approche → plan validé)

> **But :** produire le **plan de test** d'une réalisation à venir, en TDD boîte noire, à
> partir de la SPEC (`FEATURE_*.md`) et du plan de développement (`APPROCHE_*.md`). Se place
> entre [`approche_dev`](../approche_dev/SKILL.md) et [`ecrire_tests`](../ecrire_tests/SKILL.md).
>
> **Invocation :** quand l'utilisateur demande de préparer / cadrer les tests d'un composant,
> service ou écran (« fais un plan de test pour… », « cadre les tests de… »).
>
> **Règle d'or :** ce skill **s'arrête** au plan validé dans `.agent`. Il **n'écrit pas le
> `.spec.ts`** (c'est le skill [`ecrire_tests`](../ecrire_tests/SKILL.md)), ni composant, ni
> implémentation.

---

## Étape 0 — Prendre connaissance de la réalisation

1. Lire les documents de cadrage : la **SPEC** (`.agent/FEATURE_<NOM>.md` — user stories +
   critères d'acceptation) et l'**approche de dev** (`.agent/APPROCHE_<NOM>.md` — diagramme
   de classes + algorithmes). Ce sont les sources de vérité du comportement à tester.
2. Lire aussi les autres docs `.agent/*.md` pertinents (`MODELE_DONNEES_*.md`,
   `DIAGRAMME_CLASSES_*.md`, les `PLAN_TESTS_*.md` existants) et la mémoire projet
   (`test-setup-notes-service`, `notes-service-findings`).
3. Lire le code concerné et ses voisins : modèles (`core/models`), service(s)
   (`core/services`), composants existants et **leur `.spec.ts`** (source de vérité des
   conventions), routes (`app.routes.ts`).
4. Repérer ce qui existe déjà et **doit être réutilisé** (méthodes de service, doublures,
   helpers DOM, composants partagés comme `ConfirmDialog`) — ne pas réinventer.

## Étape 1 — Poser les questions de cadrage (si nécessaire)

Utiliser `AskUserQuestion` **uniquement** pour les choix qui changent les assertions.
Questions typiques :
- **Périmètre** : squelette fonctionnel vs minimal vs complet (découper si le sujet couvre
  plusieurs phases — un `.spec.ts` reste focalisé).
- **Déclencheurs** : bouton explicite vs auto-save/debounce ; création + édition vs édition
  seule ; route unique vs routes séparées.
- Toute ambiguïté de comportement observable non tranchée par la SPEC ou l'approche.

Ne pas demander ce qui a un défaut évident (nom de fichier, conventions déjà établies) :
choisir, l'annoncer, avancer.

## Étape 2 — Écrire le plan de test dans `.agent`

Fichier : `.agent/PLAN_TESTS_<CIBLE>.md` (ex. `PLAN_TESTS_NOTE_EDITOR.md`), calqué sur
`PLAN_TESTS_NOTE_LIST.md`. Structure obligatoire :

1. **En-tête** : approche boîte noire / TDD, référence à la SPEC + à l'approche de dev et au
   jumeau existant.
2. **Objet testé** : rôle fonctionnel, périmètre validé, **hors périmètre** explicite.
3. **Dépendances (abstraites) & doublures** : source de données, navigation, route,
   confirmation… décrites sans figer de signature d'API précise.
4. **Décisions de conception à figer** (`D1`, `D2`, …) : chaque décision qui impacte une
   assertion, suivie de *(à confirmer)*.
5. **Cas de test** groupés (`Groupe N`) et numérotés (`T1.1`, `T1.2`, …), un comportement
   observable par cas, formulé en langage métier, **relié aux user stories** de la SPEC.
6. **Contrat DOM** : table des sélecteurs ciblés par les tests (fixe le contrat que
   l'implémentation devra honorer).
7. **Ordre d'implémentation TDD suggéré** (rouge → vert, groupe par groupe).

## Étape 3 — Demander validation — PUIS s'arrêter

Présenter le plan et **attendre l'accord explicite**. En mode plan : `ExitPlanMode`. Sinon :
demander clairement « je valide ce plan de test ? ».

Une fois validé, **ne pas** écrire le `.spec.ts` : proposer (sans l'imposer) d'enchaîner sur
le skill [`ecrire_tests`](../ecrire_tests/SKILL.md), qui traduira ce plan en code de test.

## Rappels

- Ce skill livre **un plan de test markdown**, rien d'autre : pas de `.spec.ts`, pas de code.
- Le plan doit être **exécutable par `ecrire_tests`** sans re-décision : cas groupés,
  décisions `D#` figées, Contrat DOM précis.
- Convertir les dates relatives en absolues dans les docs.
- Si le sujet est trop large pour un `.spec.ts`, proposer un découpage plutôt qu'un plan
  géant.
- Ce skill vit dans `.agent/skill/plan_test/SKILL.md` (format `SKILL.md` + frontmatter). Pour
  le rendre invocable en `/`-commande Claude Code, le copier/lier dans un dossier de skills
  reconnu (ex. `.claude/skills/plan_test/`), le frontmatter (`name`, `description`) est déjà prêt.
