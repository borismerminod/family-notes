---
name: appliquer_refactoring
description: Met en œuvre un plan de refactoring validé (REVUE_*.md) pour améliorer la qualité de l'implémentation SANS changer le comportement, en s'appuyant sur la suite de tests unitaires (verte à l'issue des phases précédentes) comme filet anti-régression. Applique UN refactoring R# à la fois dans l'ordre de priorisation, relance toute la suite après chaque étape, exige qu'elle reste verte, rapporte honnêtement, et fait valider l'utilisateur avant de passer au suivant. Invoquer quand une revue a produit un plan de refactoring approuvé et qu'on veut l'exécuter.
---

# Skill — Mise en œuvre d'un plan de refactoring (REVUE validée → code nettoyé, tests toujours verts)

> **But :** exécuter un **plan de refactoring déjà validé** (`REVUE_<NOM>.md`) pour améliorer
> la qualité du code livré, **sans modifier le comportement observable**. La **suite de tests
> unitaires** — verte à la sortie de [`dev_par_groupes`](../dev_par_groupes/SKILL.md) — est le
> **filet de sécurité** : elle doit rester verte à chaque étape. Suite naturelle du skill
> [`revue_fonctionnalite`](../revue_fonctionnalite/SKILL.md).
>
> **Invocation :** quand un plan de refactoring existe et est approuvé (« applique le plan de
> refacto », « mets en œuvre le refactoring R2 », « nettoie le code selon la revue »).
>
> **Règle d'or :** **refactorer, c'est changer la structure sans changer le comportement.**
> On n'avance **jamais** au refactoring suivant sans que **toute la suite soit verte** ET
> sans le **feu vert explicite** de l'utilisateur. Les `.spec.ts` sont le **filet** : on ne
> les affaiblit pas pour faire passer un refactoring.

---

## Prérequis

- Un **plan de refactoring validé** : `.agent/REVUE_<NOM>.md` avec des constats `C#`, des
  refactorings `R#` **priorisés**, leurs fichiers touchés et leur **filet** (tests couvrants).
  Sinon, produire d'abord la revue via [`revue_fonctionnalite`](../revue_fonctionnalite/SKILL.md).
- Une **suite de tests verte** à l'état initial (fin de `dev_par_groupes`). C'est la
  référence : le refactoring ne doit pas la faire régresser.
- Connaître les docs de cadrage (`FEATURE_*.md`, `APPROCHE_*.md`, `PLAN_TESTS_*.md`) pour ne
  pas contredire une décision `D#` déjà actée, et la mémoire projet (conventions, pièges).

## Étape 0 — Établir la ligne de base verte (obligatoire)

Avant toute modification, **prouver que la suite est verte**. On ne refactore pas sur une
base rouge : sinon impossible de distinguer une régression introduite d'un échec préexistant.

```bash
cd /home/mateus/family-notes-agent/frontend
NODE=/home/mateus/.lmstudio/.internal/utils/node
PATH="/home/mateus/.lmstudio/.internal/utils:$PATH" "$NODE" \
  node_modules/@angular/cli/bin/ng.js test --watch=false > /tmp/refacto-base.txt 2>&1
grep -E "Test Files|Tests " /tmp/refacto-base.txt | tail -n 2
```

- Noter les **totaux verts** (« X/X verts ») — c'est l'invariant à préserver.
- ⚠️ Le builder `@angular/build:unit-test` (Vitest) **compile tout le bundle en une passe** :
  une erreur de compilation bloque **toutes** les suites (cf. mémoire `run-frontend-tests`).
- Si la base **n'est pas verte**, s'arrêter et le signaler : il faut d'abord réparer (ou
  documenter) l'échec avant de refactorer.

## Boucle par refactoring (répéter pour chaque `R#`)

### 1. Cibler UN refactoring
Prendre le prochain `R#` dans **l'ordre de priorisation** du plan (quick wins d'abord, en
général), ou celui demandé par l'utilisateur. Relire dans `REVUE_<NOM>.md` : le **constat**
`C#` qu'il résout, la **transformation** décrite, les **fichiers touchés**, le **filet**
(tests censés le couvrir) et le **risque de régression** annoncé.

### 2. Vérifier le filet AVANT de toucher au code
Identifier **quels tests couvrent** le comportement à préserver par ce `R#`. Deux cas :
- **Le comportement est couvert** → parfait, ces tests sont le garde-fou. Avancer.
- **Le comportement n'est pas (ou mal) couvert** → le refactoring serait à l'aveugle.
  **Le signaler** et proposer d'ajouter d'abord un test de caractérisation via
  [`ecrire_tests`](../ecrire_tests/SKILL.md) (test qui fige le comportement actuel), **avant**
  de transformer le code. Ne pas refactorer une zone non couverte sans l'accord de l'utilisateur.

### 3. Appliquer la transformation — sans changer le comportement
Réaliser **uniquement** le `R#` ciblé, en respectant les décisions `D#` et les conventions.
- **Périmètre strict** : ne pas embarquer d'autres refactorings « au passage » ; un `R#` = un
  changement cohérent. Ce qui déborde est un autre `R#` (ou un constat à ajouter au plan).
- **Comportement identique** : extraire/renommer/déplacer/dédupliquer, pas ajouter ni retirer
  de fonctionnalité. Si une transformation **change** le comportement, ce n'est pas un
  refactoring : le sortir de ce skill et le traiter en TDD via `dev_par_groupes`.
- **Ne pas affaiblir le filet** : on **ne modifie pas** un `.spec.ts` pour faire passer un
  refactoring. Exception légitime : le refactoring change une frontière **contractuelle** déjà
  actée (ex. sélecteur du **Contrat DOM**, signature publique) — dans ce cas, **le signaler
  explicitement**, faire valider la mise à jour du test comme un choix à part, et l'appliquer
  en conscience (jamais en douce pour verdir).
- Tenir à jour les **commentaires** de la cible si la structure a changé.

### 4. Rejouer TOUTE la suite (le filet)
Relancer l'intégralité de la suite (pas seulement le fichier touché : un refactoring peut
avoir des effets à distance) et **comparer à la ligne de base** :

```bash
cd /home/mateus/family-notes-agent/frontend
NODE=/home/mateus/.lmstudio/.internal/utils/node
PATH="/home/mateus/.lmstudio/.internal/utils:$PATH" "$NODE" \
  node_modules/@angular/cli/bin/ng.js test --watch=false > /tmp/refacto-out.txt 2>&1
grep -E "Test Files|Tests " /tmp/refacto-out.txt | tail -n 2
grep -E "FAIL " /tmp/refacto-out.txt | sort -u
grep -ciE "unhandled" /tmp/refacto-out.txt
```

- **Attendu : totaux identiques à la ligne de base, 0 échec, 0 `unhandled`.**
- **Si un test casse** : c'est le filet qui joue son rôle. Le refactoring a soit introduit une
  régression, soit changé un comportement. **Corriger le code** pour revenir au vert — ou, si
  la transformation est mauvaise, **revenir en arrière** (`git checkout -- <fichier>`) et
  reconsidérer le `R#`. **Ne jamais** « réparer » en modifiant l'assertion du test.
- Ne passer à l'étape suivante **que** sur suite verte.

### 5. Vérifier le rendu réel (si observable)
Si le `R#` touche du comportement visible dans l'app, le **prouver identique** via le
**Browser pane** : `preview_start` (ou serveur existant), `navigate`, puis `read_page` /
`javascript_tool` / `computer screenshot`. Un refactoring réussi = rendu **inchangé**.

### 6. Faire valider par l'utilisateur — PUIS s'arrêter
Rapporter **honnêtement** :
- le `R#` réalisé et le constat `C#` qu'il résout ;
- **preuve du filet** : totaux réels vs ligne de base (« toujours X/X verts »), 0 `unhandled` ;
- fichiers modifiés (liens `file`), et tout **test contractuel** légitimement mis à jour (avec
  la raison) ;
- ce qui reste à faire dans le plan.

Puis **demander explicitement la validation** (« je valide R2 et j'enchaîne sur R3 ? ») et
**attendre** : l'utilisateur valide, ajuste, ou reporte le suivant. **Ne pas enchaîner de
soi-même.** Envisager un **commit par `R#`** validé (checkpoint réversible) si l'utilisateur
le souhaite — jamais sans qu'il le demande.

## Fin de parcours

- Quand tous les `R#` du périmètre sont appliqués : relancer la **suite complète**, confirmer
  les **totaux identiques à la ligne de base** (`0 échec`, `0 unhandled`), et lister les `R#`
  **reportés / hors périmètre**.
- Mettre à jour l'en-tête de `REVUE_<NOM>.md` : marquer chaque `R#` *(appliqué le <date>)* ou
  *(reporté)*, et passer le statut global à *(refactoring réalisé le <date>)*.
- Si le refactoring change durablement une convention ou fait ressortir un piège, proposer une
  note de **mémoire projet** + une ligne dans `MEMORY.md`.
- Ne **pas** ouvrir de PR / commit final de soi-même : le proposer, laisser l'utilisateur décider.

## Rappels

- **Refactorer = améliorer la structure, pas le comportement.** Le comportement observable
  reste identique ; la **suite de tests verte** le garantit et sert de filet.
- **Un `R#` à la fois**, dans l'ordre de priorisation, **validation entre chaque**. Toute la
  suite est rejouée après chaque étape et doit rester verte.
- **On ne touche pas aux `.spec.ts` pour verdir.** Un test qui casse signale une régression à
  corriger dans le code, pas une assertion à assouplir. Seule exception : une frontière
  contractuelle actée qui change — et alors on le fait **explicitement et validé**.
- **Ne pas refactorer une zone non couverte** sans ajouter d'abord un test de caractérisation
  (via [`ecrire_tests`](../ecrire_tests/SKILL.md)) ou l'accord explicite de l'utilisateur.
- Respecter les **décisions `D#`** et l'existant ; ne pas réintroduire un problème déjà tranché.
- Toujours rapporter l'**état réel** (totaux vs ligne de base), jamais « c'est bon » sans
  preuve de la suite. Convertir les dates relatives en absolues.
- Ce skill vit dans `.agent/skill/appliquer_refactoring/SKILL.md` (format `SKILL.md` +
  frontmatter). Pour le rendre invocable en `/`-commande Claude Code, le copier/lier dans un
  dossier de skills reconnu (ex. `.claude/skills/appliquer_refactoring/`) ; le frontmatter est
  déjà prêt.
