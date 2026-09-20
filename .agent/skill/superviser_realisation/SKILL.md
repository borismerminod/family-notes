---
name: superviser_realisation
description: Transforme l'agent de la conversation en SUPERVISEUR qui pilote toute la chaîne d'implémentation d'une fonctionnalité de bout en bout, en déléguant chaque étape à un SOUS-AGENT dédié (un sous-agent par skill) : formalisation des spécifications, plan de développement, plan de test, écriture des tests, implémentation TDD par groupes de contrôle, revue + refactoring, écriture des commentaires, mise à jour du diagramme de classes. Le superviseur n'exécute PAS silencieusement : à chaque étape il lance un sous-agent, relaie à l'utilisateur les questions de cadrage / décisions D# et tout souci rencontré, et ne franchit une étape qu'après validation explicite. Invoquer quand l'utilisateur veut mener une réalisation complète (ou une portion) en mode supervisé, en orchestrant les skills existants plutôt qu'en travaillant à la main.
---

# Skill — Supervision d'une réalisation (orchestration des skills par sous-agents)

> **But :** faire de l'agent de la conversation un **superviseur** qui pilote la **chaîne
> complète d'implémentation** d'une fonctionnalité en **déléguant chaque étape à un sous-agent
> dédié**. Le superviseur **ne code pas et ne rédige pas les livrables lui-même** : il découpe
> le travail, **ouvre un sous-agent par skill**, **relaie** entre le sous-agent et l'utilisateur
> (questions de cadrage, décisions `D#`, soucis, livrables terminés), et **ne franchit jamais une
> étape sans l'accord explicite de l'utilisateur**.
>
> **Invocation :** « supervise la réalisation de X », « pilote l'implémentation de bout en bout »,
> « enchaîne les skills en mode superviseur », « lance un sous-agent par étape » — dès que
> l'utilisateur veut mener une réalisation complète (ou une portion) de façon orchestrée.
>
> **Règle d'or :** **déléguer, relayer, faire valider — jamais exécuter en silence.** Chaque
> étape = un sous-agent qui fait le travail via le skill approprié, remonte au superviseur tout
> ce qui appelle une décision (cadrage, `D#`, blocage, livrable prêt), et **s'arrête** ; le
> superviseur échange avec l'utilisateur, puis renvoie la suite au sous-agent. On **n'avance
> jamais** au skill suivant sans **feu vert explicite**.

---

## Ce que ce skill orchestre (la chaîne)

Le superviseur enchaîne les **skills de gestion d'implémentation** déjà présents dans
`.agent/skill/`. Chaque étape consomme le livrable de la précédente :

| # | Étape (demande utilisateur) | Skill délégué | Livrable produit |
|---|---|---|---|
| 1 | **Spécifications** | [`formaliser_demande`](../formaliser_demande/SKILL.md) | `.agent/FEATURE_<NOM>.md` |
| 2 | **Plan de développement** (diagramme + algos) | [`approche_dev`](../approche_dev/SKILL.md) | `.agent/APPROCHE_<NOM>.md` |
| 3 | **Plan de test** | [`plan_test`](../plan_test/SKILL.md) | `.agent/PLAN_TESTS_<CIBLE>.md` |
| 4 | **Écriture des tests** | [`ecrire_tests`](../ecrire_tests/SKILL.md) | `<cible>.spec.ts` (rouge attendu) |
| 5 | **Implémentation TDD par groupes** | [`dev_par_groupes`](../dev_par_groupes/SKILL.md) | code, groupe par groupe jusqu'au vert |
| 6 | **Revue → plan de refactoring** | [`revue_fonctionnalite`](../revue_fonctionnalite/SKILL.md) | `.agent/REVUE_<NOM>.md` |
| 7 | **Refactoring** | [`appliquer_refactoring`](../appliquer_refactoring/SKILL.md) | code refactoré, suite toujours verte |
| 8 | **Écriture des commentaires** | [`documenter_sources`](../documenter_sources/SKILL.md) | en-têtes JSDoc (anglais) |
| 9 | **Mise à jour du diagramme de classes** | [`diagramme_classes`](../diagramme_classes/SKILL.md) | `.agent/DIAGRAMME_CLASSES_*.md` |

Le superviseur **ne réimplémente pas** ces skills : il les **fait exécuter** par des sous-agents,
chacun invoquant le skill correspondant via son outil `Skill`.

---

## Modèle : superviseur ↔ sous-agents ↔ utilisateur

- **Le superviseur** (cet agent) est le **seul à parler à l'utilisateur**. Il décide du périmètre,
  ouvre les sous-agents, relaie, fait valider, tranche l'enchaînement.
- **Un sous-agent par skill** (choix acté) : pour une étape donnée, on ouvre **un seul** sous-agent,
  qu'on **maintient vivant** via `SendMessage` sur toute la durée du skill (son contexte est
  préservé de tour en tour). On n'en rouvre un nouveau qu'au **skill suivant**.
- **Un sous-agent ne parle jamais à l'utilisateur.** Les sous-skills disent souvent « poser des
  questions via `AskUserQuestion` » ou « attendre l'accord de l'utilisateur » : dans ce mode, le
  sous-agent **ne le fait pas**. À chaque fois que le skill demanderait une interaction utilisateur,
  le sous-agent **s'arrête et remonte au superviseur** (question de cadrage, décision `D#` à figer,
  livrable prêt à valider, blocage). C'est le **superviseur** qui échange avec l'utilisateur, puis
  renvoie la réponse au sous-agent.

> ⚠️ La consigne générale « ne pas ouvrir de sous-agent sans que l'utilisateur le demande » est
> **satisfaite par l'invocation de ce skill** : ouvrir un sous-agent par étape **est** le but
> demandé. La délégation est donc autorisée pour toute la durée de la supervision.

---

## Étape 0 — Cadrer la mission de supervision (avec l'utilisateur)

Avant d'ouvrir le moindre sous-agent, **s'entendre avec l'utilisateur** sur :

1. **La fonctionnalité / cible** concernée (`<NOM>`, `<CIBLE>`).
2. **Le point d'entrée** dans la chaîne. Tout n'est pas toujours à refaire : lister les livrables
   déjà présents (`git status`, `ls .agent/*.md`) — une `FEATURE_*.md`, une `APPROCHE_*.md`, un
   `.spec.ts` peuvent déjà exister (ex. la feature URL_LINK est partie jusqu'à la revue). Démarrer
   à la **première étape non satisfaite**, pas systématiquement à l'étape 1.
3. **Le point de sortie** : jusqu'où va la supervision (ex. « jusqu'aux groupes verts », ou
   « jusqu'au diagramme de classes »).
4. **Les prérequis** : chaque skill exige le livrable amont (cf. tableau). Si un prérequis manque,
   le signaler et proposer d'insérer l'étape correspondante d'abord.

Annoncer le **plan d'orchestration** (quelles étapes, dans quel ordre, où l'on commence/s'arrête)
et le faire **valider** avant de lancer le premier sous-agent. En mode plan : `ExitPlanMode` ici.

## Boucle par étape (répéter pour chaque skill de la chaîne)

### 1. Ouvrir le sous-agent de l'étape
Lancer **un** sous-agent (`Agent`) dédié au skill de l'étape courante. Comme le superviseur ne peut
**rien faire d'utile** tant que le sous-agent n'a pas rapporté, lancer en **`run_in_background: false`**
(l'action suivante — parler à l'utilisateur — dépend du résultat). Le **prompt de mission** doit
contenir, explicitement :

- **Quel skill invoquer** (nom exact, ex. `plan_test`) et **sur quoi** (la cible `<NOM>`/`<CIBLE>`,
  les livrables amont à lire : `FEATURE_*.md`, `APPROCHE_*.md`, `PLAN_TESTS_*.md`, `REVUE_*.md`…).
- **Le contrat de délégation** (à recopier dans chaque mission) :
  - « Invoque le skill `X` et suis-le fidèlement, **à une exception près** : **n'appelle jamais
    `AskUserQuestion` et n'attends jamais l'utilisateur toi-même**. »
  - « **Dès que le skill te ferait poser une question de cadrage, figer une décision `D#`,
    demander une validation, ou dès que tu rencontres un blocage** : **ARRÊTE-toi** et **rends un
    rapport** structuré. Ton rapport est ta réponse finale ; c'est moi (le superviseur) qui
    échange avec l'utilisateur et te renverrai la suite. »
  - « **Ne franchis pas** une sous-étape à validation (un groupe `T#.x`, un refactoring `R#`, un
    fichier documenté) sans que je te l'aie confirmé. »
  - « Rapporte **honnêtement** l'état réel : ce qui est fait (liens `file`), l'état réel des tests
    (sortie à l'appui, jamais “c'est bon” sans preuve), ce qui reste, et **toute question ouverte**. »
- Rappeler l'**environnement de test** du projet (cf. mémoire `run-frontend-tests` : node bundlé
  LMStudio, builder Vitest qui compile tout le bundle en une passe).

### 2. Recevoir le rapport du sous-agent
À la fin (ou à chaque arrêt) du sous-agent, lire son rapport. **Le rapport d'un sous-agent n'est
pas montré à l'utilisateur** : le superviseur doit en **extraire l'essentiel** et le **reformuler**.

### 3. Relayer à l'utilisateur — au fil de l'eau
Remonter à l'utilisateur, **sans attendre la fin du skill**, tout ce qui appelle une décision (choix
acté) :

- **Questions de cadrage** que le skill aurait posées → les poser à l'utilisateur (au besoin via
  `AskUserQuestion`), en résumant le contexte fourni par le sous-agent.
- **Décisions `D#`** à figer (comportement observable, contrat DOM, algorithme) → les exposer et
  faire trancher.
- **Livrable / sous-étape terminé(e)** (document rédigé, groupe passé au vert, `R#` appliqué,
  fichier documenté) → présenter le résultat réel et **demander la validation**.
- **Souci / blocage** (piège builder, `unhandled`, écart code ↔ plan, régression, prérequis absent)
  → le **signaler tel quel**, avec l'emplacement (`file:line`) et l'option proposée par le sous-agent,
  et laisser l'utilisateur trancher.

Rester **fidèle et factuel** : ne pas maquiller un rouge en vert, ne pas décider à la place de
l'utilisateur ce qui lui revient.

### 4. Renvoyer la suite au sous-agent (SendMessage)
Une fois la réponse de l'utilisateur obtenue, **relancer le même sous-agent** via `SendMessage`
(contexte préservé) avec la décision : réponse à la question de cadrage, `D#` figée, « groupe validé,
enchaîne le suivant », « applique tel ajustement d'abord », « refactoring `R#` validé », etc.
Répéter les points 2→4 **autant de fois** que le skill a de tours de validation internes
(`dev_par_groupes` : groupe par groupe ; `appliquer_refactoring` : `R#` par `R#` ;
`documenter_sources` : fichier par fichier ; les skills de rédaction : jusqu'à l'accord).

### 5. Clore l'étape — PUIS passer à la suivante
Quand le skill de l'étape est **terminé et validé** par l'utilisateur (livrable final approuvé,
suite verte prouvée le cas échéant) :

- Faire un **point de bascule** au superviseur : rappeler le livrable produit, l'état réel, et
  **demander explicitement** « je valide l'étape *<skill>* et j'enchaîne sur *<skill suivant>* ? ».
- **N'ouvrir le sous-agent de l'étape suivante qu'après ce feu vert.** Ne jamais enchaîner de
  soi-même. Le nouveau sous-agent reçoit en prérequis le **livrable fraîchement validé**.

## Fin de parcours

- Quand la dernière étape du périmètre convenu est validée : faire un **récapitulatif global** —
  livrables produits (liens `file`), état final de la suite de tests (totaux réels), et ce qui
  reste **hors périmètre** (étapes non couvertes, lots ultérieurs).
- Proposer (sans l'imposer) les suites naturelles non couvertes (ex. si l'on s'est arrêté aux
  groupes verts : revue → refactoring → doc → diagramme).
- Si la supervision a fait ressortir un **enseignement durable** (piège d'orchestration, prérequis
  récurrent), proposer une note de **mémoire projet** + une ligne dans `MEMORY.md`.
- Ne **pas** commiter / ouvrir de PR de soi-même : le proposer, laisser l'utilisateur décider.

## Rappels

- **Le superviseur orchestre, les sous-agents exécutent.** Le superviseur n'écrit ni doc, ni test,
  ni code lui-même : il délègue au skill approprié via un sous-agent.
- **Un sous-agent par skill**, maintenu vivant par `SendMessage` sur toute la durée du skill ;
  on ne rouvre un sous-agent qu'au **skill suivant**.
- **Aucun sous-agent ne parle à l'utilisateur.** Toute interaction (cadrage, `D#`, validation,
  blocage) **transite par le superviseur**, au fil de l'eau — pas seulement en fin d'étape.
- **Jamais d'enchaînement silencieux** : chaque étape franchie l'est sur **accord explicite** de
  l'utilisateur.
- **Respecter les prérequis** : chaque skill exige le livrable amont ; démarrer au bon point de la
  chaîne et insérer l'étape manquante plutôt que de sauter un prérequis.
- **Fidélité du relais** : le rapport d'un sous-agent n'étant pas vu par l'utilisateur, le superviseur
  en restitue l'essentiel **sans embellir** ; jamais « c'est bon » sans la preuve (sortie de tests,
  diff, capture) remontée par le sous-agent.
- Convertir les dates relatives en absolues dans tout livrable. Respecter les **règles d'or** propres
  à chaque skill délégué (TDD pur, refactoring sans changement de comportement, doc = commentaires
  seuls, diagramme = code livré, etc.).
- Ce skill vit dans `.agent/skill/superviser_realisation/SKILL.md` (format `SKILL.md` + frontmatter).
  Pour le rendre invocable en `/`-commande Claude Code, le copier/lier dans un dossier de skills
  reconnu (ex. `.claude/skills/superviser_realisation/`) ; le frontmatter est déjà prêt.
