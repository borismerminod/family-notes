---
name: dev_par_cas
description: Écrit UNIQUEMENT l'implémentation qui fait passer au vert le ou les cas rouges d'un .spec.ts déjà écrit — composant (.ts + .html + .css) ou service — en s'appuyant sur le dossier de la fonctionnalité (.agent/<FONCTIONNALITE>/<SOUS_FONCTIONNALITE> — FEATURE_*, APPROCHE_*, PLAN_TESTS_*, MAQUETTE_*). Il implémente, lance la suite, et ne s'arrête qu'au vert sans régression ; puis il rend la main au superviseur, qui relancera ecrire_tests pour le cas suivant. N'écrit JAMAIS de test et ne touche jamais au .spec.ts. Conçu pour alterner avec ecrire_tests sous un superviseur (skill superviser_realisation, ou l'utilisateur lui-même). Invoquer quand un cas de test rouge attend son implémentation.
---

# Skill — Développement TDD (cas rouge → vert)

> **But :** écrire le code qui fait passer au **vert** le ou les cas rouges d'un `.spec.ts` déjà
> écrit — dans un **composant** (`.ts`, `.html`, `.css`) ou dans un **service** — puis rendre la
> main une fois le vert **prouvé**.
>
> **Invocation :** « implémente le composant X », « résous le cas rouge », « continue le
> développement » — dès lors qu'un plan de test et un `.spec.ts` existent déjà.
>
> **Règle d'or :** ce skill **n'écrit aucun test**. Il ne modifie **jamais** le `.spec.ts` — ni un
> titre, ni une assertion, ni un helper, ni un `beforeEach`, même pour « corriger » un cas qui
> paraît faux. Un cas douteux se **signale** au superviseur ; adapter le test au code au lieu du
> code au test viderait le TDD de son sens.

---

## La paire et son superviseur

Ce skill et [`ecrire_tests`](../ecrire_tests/SKILL.md) **fonctionnent en paire**, en se relayant
autour du même `.spec.ts` sous l'autorité d'un **superviseur** :

```
superviseur ──▶ ecrire_tests      : écrit T1.1 → vert → écrit T1.2 → ROUGE → s'arrête, rapporte
            ◀──
superviseur ──▶ dev_par_cas       : implémente jusqu'à T1.2 vert → s'arrête, rapporte
            ◀──
superviseur ──▶ ecrire_tests      : écrit T1.3 → …
```

Le **superviseur** est, selon le contexte :

- l'**agent de supervision** du skill [`superviser_realisation`](../superviser_realisation/SKILL.md),
  qui ouvre un sous-agent par tour ;
- ou l'**utilisateur lui-même**, quand il lance la session à la main et pilote l'alternance.

Dans les deux cas le fonctionnement du skill est **identique** : il implémente jusqu'au vert, il
**rapporte**, il s'arrête. Il n'écrit pas le cas suivant et ne demande pas de validation
intermédiaire.

> **Ce skill ne fait relire le code à personne.** Quand l'utilisateur veut **relire chaque cas de
> test** avant son implémentation, c'est la paire
> [`tdd_cas_par_cas`](../tdd_cas_par_cas/SKILL.md) + [`implementer_cas`](../implementer_cas/SKILL.md)
> qu'il faut employer : même grain, mais un arrêt pour relecture humaine à chaque cas.

---

## Prérequis

- Un **`.spec.ts`** existe, avec au moins un cas `T#.x` **rouge** à résoudre — rouge d'assertion,
  ou rouge de **compilation** quand la cible n'existe pas encore.
- Un **plan de test** `PLAN_TESTS_<CIBLE>.md` dans
  `.agent/<FONCTIONNALITE>/<SOUS_FONCTIONNALITE>` (par exemple `.agent/KANBAN/EDITION`), avec ses
  **décisions `D#` figées** et son **Contrat DOM**. Sinon, produire d'abord le plan via
  [`plan_test`](../plan_test/SKILL.md) puis les cas via [`ecrire_tests`](../ecrire_tests/SKILL.md).
- La **cible** est identifiée : **un** composant (`frontend/src/app/<cible>/`) ou **un** service
  (`frontend/src/app/core/services/`).

---

## Étape 0 — Établir qui lance les tests (**en ouverture de session**)

Ce skill a **besoin** de lancer la suite : c'est elle, et elle seule, qui dit si le vert est atteint.
Avant toute lecture de fichier, **établir qui la lance** :

- **La mission reçue du superviseur le précise** → s'y tenir, sans rien demander.
- **Sinon, poser la question** — à l'utilisateur quand il supervise lui-même :

  > « Est-ce que je peux lancer les tests moi-même dans cette session, ou est-ce toi qui les lances
  > et me colles la sortie ? »

  (En sous-agent d'un superviseur, cette question **remonte au superviseur**, jamais à
  l'utilisateur directement.)

- **Si le skill ne peut pas lancer les tests** (agent local sans accès à l'exécution) → il
  **n'annonce jamais un vert** de lui-même : il livre le code, fournit la **commande exacte**, et
  attend la **sortie collée**. Un code « qui devrait passer » n'est pas un cas vert, et ne justifie
  pas de rendre la main.

**Commandes de référence** (depuis la racine du dépôt, cf. [`COMMANDES.md`](../../COMMANDES.md) —
rien ne s'exécute sur l'hôte) :

```bash
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx ng test --watch=false
```

```bash
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx ng test --watch=false --filter="T1.2"
```

Le filtre sert au **diagnostic** pendant l'écriture ; la **suite complète** fait seule foi avant de
rendre la main — c'est elle qui révèle les régressions. Si Docker n'est pas disponible, demander
**quelle commande utiliser** plutôt que d'en inventer une (une machine peut avoir un Node
utilisable hors Docker — mémoire projet `run-frontend-tests`).

---

## Étape 1 — Lire le contrat et situer le rouge

Un nouveau tour part souvent d'un **sous-agent neuf** : l'état du travail se lit **dans les
fichiers** et dans la **sortie des tests**, pas dans le souvenir.

1. **Identifier le ou les cas rouges** : par le rapport de passation du superviseur, et **confirmé
   par la sortie** de la suite. Ne pas se fier à une liste de cas supposés.
2. **Lire ces cas dans le `.spec.ts`** : c'est le **contrat exécutable**. En relever les
   **sélecteurs** interrogés, les **appels aux doublures** attendus, les **valeurs** et **textes**
   exacts, et le montage du banc de test (quelles dépendances sont fournies, donc injectables).
3. `PLAN_TESTS_<CIBLE>.md` : l'énoncé du cas, ses **décisions `D#`** et le **Contrat DOM** — la
   table des sélecteurs que le gabarit **doit** honorer.
4. `APPROCHE_<NOM>.md` : le **diagramme de classes** (noms exacts des méthodes, entrées / sorties)
   et les **algorithmes** à suivre ; l'implémentation s'y conforme plutôt que d'improviser sa
   propre structure.
5. `FEATURE_<NOM>.md` : la user story citée par le cas, pour comprendre l'intention.
6. `MAQUETTE_*.html`, quand elle existe : **classes CSS**, structure et styles de l'écran. Le `.css`
   du composant s'en inspire directement ; les sélecteurs du **Contrat DOM priment** en cas d'écart.
7. **Le code existant** : la cible, ses **jumeaux** (un écran déjà livré), les **modèles** et
   **services** de `frontend/src/app/core/`.

Si un cas de test **contredit** le plan ou l'approche, ou exige un comportement impossible :
**s'arrêter et le remonter** au superviseur, les deux lectures en regard. Ne pas trancher seul, ne
pas contourner par le code, **ne pas modifier le test**.

---

## Étape 2 — Implémenter le minimum

- **Le strict nécessaire** pour les cas ciblés, en respectant les **décisions `D#`**. Ne pas
  anticiper les cas que `ecrire_tests` n'a pas encore écrits : les laisser rouges est le
  fonctionnement normal du TDD.
- **Rouge de compilation d'abord.** `@angular/build:unit-test` compile **tout le bundle en une
  passe** : un spec qui cite une cible inexistante (`TS2307`) ou une API pas encore écrite
  (`TS2339`/`TS2345`) **bloque toutes les suites**. Première tâche, alors : créer le **squelette**
  de la cible (classe, gabarit, feuille de style) pour débloquer la compilation et obtenir un vrai
  rouge d'assertions. Ce squelette est **le travail de ce skill**, jamais celui de `ecrire_tests`.
- **Composant** → les **trois fichiers** : la classe `.ts`, le gabarit `.html` honorant les
  sélecteurs du Contrat DOM, et le `.css` reprenant la maquette. Composant **standalone**
  (Angular 21).
- **Service** → l'API du diagramme de classes. **Migrations SQLite** : des fichiers `.sql` dans
  `frontend/public/assets/migrations/`, joués par `SchemaMigrationService` — **jamais de SQL
  dupliqué en TypeScript**. Aucun **état partagé dans un `static`** : il fuit d'un fichier de spec
  à l'autre (mémoire `run-frontend-tests`).
- **Règles de code du projet** (cf. [`AGENT.md`](../../AGENT.md) § 4) : **SOLID**, une
  responsabilité par classe / fonction ; **nommage porteur de sens** ; la **lisibilité prime sur la
  concision** ; **pas d'appels imbriqués** — des variables intermédiaires nommées ; **commentaires
  en en-tête** de classe, de fonction et d'attribut (**JSDoc en anglais**), **jamais dans le corps
  d'une fonction** — un bloc qui a besoin d'être expliqué devient une fonction nommée.
- **Repérer les couplages** : un même élément (le bouton « Enregistrer », par exemple) peut être
  exigé par plusieurs cas ; l'implémenter en fait passer d'autres au vert → le **signaler** comme
  effet de bord assumé, sans élargir le périmètre pour autant.
- **Hygiène** : aucun `unhandled rejection` — envelopper l'asynchrone qui peut échouer, même quand
  sa gestion fine relève d'un cas ultérieur.

---

## Étape 3 — Vérifier (la sortie des tests, rien d'autre)

Lancer la suite (ou demander sa sortie) et **ne s'arrêter qu'au vert**, les **trois** points
réunis :

1. le ou les **cas ciblés sont verts** ;
2. **aucun cas déjà vert n'a cassé** — comparer les totaux, pas seulement le cas du jour ;
3. **zéro `unhandled`**.

Tant que l'un des trois manque, continuer à corriger **la cible** — jamais le test. Boucler
étape 2 → étape 3 autant de fois qu'il le faut : il n'y a **pas de validation intermédiaire** à
demander dans ce mode, le vert est le seul point d'arrêt.

**Vérification du rendu réel (facultative).** Si le comportement est visible dans l'application et
que l'exécution de commandes est autorisée, en fournir une **preuve** (capture d'écran ou état du
DOM) plutôt que de demander une vérification à la main. ⚠️ `ng serve` échoue depuis certains shells
(droits `root` sur `.angular/cache`) : si c'est le cas, le dire au lieu d'insister.

---

## Étape 4 — Rapporter et **rendre la main**

Au vert — et seulement là — **s'arrêter** et produire le **rapport de passation**, lisible tel quel
par le superviseur :

- **Cas passés au vert** : identifiants, et **effets de bord** (cas suivants devenus verts au
  passage).
- **Fichiers écrits** : liens `fichier:ligne`.
- **Totaux réels** de la suite (« X/Y verts, 0 `unhandled` »), issus de la **sortie**.
- **Cas encore rouges**, s'il en reste, et pourquoi (hors périmètre du tour, pas encore écrits…).
- **Écarts et questions** relevés à l'étape 1 et laissés à l'arbitrage du superviseur.
- **Main rendue** : au superviseur, pour que [`ecrire_tests`](../ecrire_tests/SKILL.md) écrive le
  **cas suivant**.

Ne pas écrire ce cas suivant, ne pas le deviner, ne pas enchaîner.

---

## Fin de parcours

- **Tous les cas du périmètre verts** → faire tourner la **suite complète**, confirmer `0 échec` et
  l'absence d'`unhandled`, puis lister ce qui reste **hors périmètre** (cf. § *Hors périmètre* du
  plan : routes vérifiées à la main, lots ultérieurs…).
- Mettre à jour la **mémoire projet** (état livré, pièges découverts) et l'index `MEMORY.md`.
- Ajouter / ajuster les **routes** ou le câblage nécessaires à un test manuel **seulement** si le
  superviseur le demande (ça a été un pas séparé pour le `NoteEditor`).
- Proposer (sans l'imposer) la suite de la chaîne :
  [`revue_fonctionnalite`](../revue_fonctionnalite/SKILL.md), puis
  [`documenter_sources`](../documenter_sources/SKILL.md).

---

## Rappels

- **Zéro ligne de test.** Le `.spec.ts` est en lecture seule pour ce skill ; un cas douteux se
  signale, il ne se corrige pas.
- **Le minimum pour le vert** : rester dans le périmètre des cas rouges, ne pas anticiper les
  suivants.
- **Un seul point d'arrêt : le vert sans régression.** Pas de validation intermédiaire à demander.
- Les **décisions `D#`**, le **Contrat DOM** et le **diagramme de classes** font foi — l'approche
  n'est pas réinventée au moment d'implémenter.
- **Jamais de vert annoncé sans la sortie des tests**, qu'elle vienne du skill ou de l'utilisateur.
- Convertir les dates relatives en **dates absolues**.
- Ce skill vit dans `.agent/skill/dev_par_cas/SKILL.md` (format `SKILL.md` + frontmatter).
  Pour le rendre invocable en `/`-commande, le copier dans un dossier de skills reconnu
  (ex. `.claude/skills/dev_par_cas/`), le frontmatter est déjà prêt.
