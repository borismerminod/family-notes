# Plan de Test (TDD) — Composant « RichTextEditor »

> **Approche :** boîte noire / TDD. Ce plan décrit le **comportement observable** de
> `RichTextEditor` (toolbar + zone `contenteditable` dans un même composant) avant toute
> implémentation. Calqué sur `PLAN_TESTS_NOTE_LIST.md` / `PLAN_TESTS_NOTE_EDITOR.md`.
>
> **Sources :** `PLAN_REFONTE_EDITION_TEXTE.md` (2026-09-12, décisions D1→D7 §3, architecture
> §5, correspondance §4) et `PLAN_PIVOT_DOCUMENT_RICHE.md` (contenu = HTML unique). Remplace
> l'approche « fonction pure » de `PLAN_TESTS_FORMAT_TOOLBAR.md` (composant `format-toolbar`
> voué à disparaître).
>
> ⚠️ **Contrainte de test majeure (§6 refonte) :** jsdom **n'implémente pas**
> `execCommand` / `queryCommandState` / `queryCommandValue`. La transformation HTML **réelle**
> et l'état actif natif se vérifient **en Browser pane** (§7 refonte), **pas** en unitaire. Les
> specs ci-dessous testent donc le **contrat de délégation** (le bon appel au moteur de
> formatage) et la **réaction** du composant à un état de moteur **simulé** — jamais le rendu
> riche natif lui-même.

## 1. Objet testé

Le composant `RichTextEditor` (`<app-rich-text-editor>`) qui regroupe, dans un seul composant :
- une **barre d'outils** (marques, tailles, listes, couleurs, boutons média) ;
- une **zone d'édition** `contenteditable` (`.editor-content`).

Rôle fonctionnel :
- **afficher** le HTML entrant dans la zone éditable ;
- **déléguer** chaque action de formatage à un moteur de formatage (marques, taille, couleur,
  listes, insertion média) ;
- **refléter l'état actif** des boutons d'après ce moteur (surbrillance) ;
- **notifier** le contenu HTML courant à chaque frappe et après chaque commande ;
- **préserver la sélection** du contenteditable lors des clics sur la toolbar ;
- gérer les **popups** d'insertion image / vidéo.

### Périmètre validé (ce lot de tests)
Rendu de la toolbar, injection du contenu initial, délégation des commandes au moteur (mocké),
reflet de l'état actif d'un moteur mocké, émission du contenu, préservation de la sélection,
popups média (ouverture / fermeture / délégation de l'insertion).

### Hors périmètre (explicite)
- La **transformation HTML réelle** (gras réellement appliqué, toggle natif, frappe « marque
  activée ») → **Browser pane** (§7 refonte), pas en unitaire.
- Le **`FormattingService`** lui-même (helpers purs mapping taille/couleur, `toEmbedUrl`, appels
  `execCommand`) → **plan/spec séparés** (`formatting-service.spec.ts`, §6 refonte).
- Le `NoteEditor` hôte (titre / catégorie / save / load / not-found) → `PLAN_TESTS_NOTE_EDITOR.md`.
- La **persistance** SQLite (`NotesService`) et l'incohérence `seed_notes.sql` (hors périmètre §2 refonte).
- Le **style visuel** (CSS) au-delà de la présence des éléments et de la classe `active`.
- Le **câblage réel `FileReader`** (lecture fichier → data URL) : intégration / Browser pane ;
  seule la **primitive d'insertion** est testée avec un data URL fourni.

## 2. Dépendances (abstraites) et doublures de test

Pour tester le composant en isolation, on remplace ses collaborateurs par des doublures :

- **Moteur de formatage** (le futur `FormattingService`) : applique les commandes sur la
  sélection courante et **renseigne l'état actif**. Fourni **mocké** (`vi.fn()`), avec deux
  familles de membres :
  - *commandes* : appliquer une marque, une liste, une couleur, une taille, insérer du HTML ;
  - *requêtes d'état* : marque active ? liste active ? couleur courante ? taille courante ? ;
  - *helper* : conversion d'un lien vidéo en URL d'embed.
  - Espionné pour vérifier **quel** membre est appelé et **avec quels arguments** ; ses requêtes
    d'état sont **stubées** pour piloter la surbrillance des boutons.
- **Contenu entrant** : le HTML initial fourni au composant (entrée `[content]`).
  - posé à des valeurs connues (note existante, vide) pour vérifier l'injection dans le DOM.
- **Notification de changement** : la sortie `(contentChange)` émise par le composant.
  - captée (souscription / spy) pour vérifier l'émission et la valeur émise.

> Aucune doublure ne fige de signature d'API précise **au-delà** de ce que le plan de refonte
> §5 a déjà arrêté (noms des commandes/requêtes) ; le détail émergera à l'écriture du spec.

## 3. Décisions de conception à figer (impactent les assertions)

- **D1 — Test = contrat + réaction à un moteur mocké** (pas de rendu natif en unitaire).
  Cliquer un bouton **appelle** le bon membre du moteur ; la surbrillance **reflète** l'état que
  le moteur (mocké) renvoie. *(figé par §6 refonte)*
- **D2 — Délégation par commandes nommées** (marque / liste / couleur / taille / insertion HTML),
  conformes à l'architecture §5 refonte. *(à confirmer sur les noms exacts au moment du spec)*
- **D3 — État actif piloté par signal, recalculé sur événement de sélection.** Après un
  événement de type `selectionchange` / `keyup` / `mouseup` / `input`, le composant **relit**
  l'état auprès du moteur et met à jour les classes `active` des boutons. *(à confirmer)*
- **D4 — Préservation de la sélection.** Chaque bouton de la toolbar **annule** l'action par
  défaut du `mousedown` (`preventDefault`) pour ne pas voler le focus du contenteditable. *(D5 refonte)*
- **D5 — Injection du contenu sans écrasement.** Le HTML entrant n'est écrit dans `.editor-content`
  qu'au **chargement / changement de valeur**, et **seulement** si l'éditeur n'a pas le focus et
  que la valeur diffère de son `innerHTML` (évite les sauts de curseur). *(D6 refonte)*
- **D6 — Insertion média via le moteur.** Image → insertion d'un `<img src>` ; vidéo → insertion
  d'un `<iframe>` dont la `src` provient du helper d'embed du moteur ; les deux passent par la
  commande d'insertion HTML du moteur. *(D7 refonte)*
- **D7 — Émission du contenu.** `(contentChange)` est émis avec l'`innerHTML` courant de
  `.editor-content` **à la frappe** (`input`) **et** après chaque commande de formatage. *(à confirmer)*

## 4. Cas de test

### Groupe 1 — Rendu de la barre d'outils et de la zone d'édition
- **T1.1** Les trois boutons de marque sont présents (`.btn-bold`, `.btn-italic`, `.btn-underline`).
- **T1.2** Les cinq boutons de taille sont présents (`.btn-size-small|normal|large|h2|h1`).
- **T1.3** Les deux boutons de liste sont présents (`.btn-list-bullet`, `.btn-list-numbered`).
- **T1.4** Une pastille de couleur est rendue **par couleur** de `NOTE_COLOR_PALETTE`, chacune
  portant sa couleur en `data-color`.
- **T1.5** Les deux boutons média sont présents (`.btn-image`, `.btn-video`).
- **T1.6** La zone d'édition `.editor-content` est présente et porte `contenteditable="true"`.

### Groupe 2 — Injection du contenu initial (D5)
- **T2.1** Le HTML fourni via `[content]` est **injecté** dans `.editor-content` au chargement.
- **T2.2** Un contenu entrant **vide** laisse `.editor-content` vide (pas de résidu).
- **T2.3** Modifier `[content]` **pendant que l'éditeur a le focus** ne réécrit **pas** le DOM
  (garde anti-saut de curseur — D5). *(vérifie la garde, pas le rendu natif)*

### Groupe 3 — Marques (délégation au moteur mocké — D1/D2)
- **T3.1** Clic `.btn-bold` → la commande **marque gras** du moteur est appelée.
- **T3.2** Clic `.btn-italic` → la commande **marque italique** est appelée.
- **T3.3** Clic `.btn-underline` → la commande **marque souligné** est appelée.
- **T3.4** Un `mousedown` sur un bouton de marque **annule l'action par défaut**
  (`defaultPrevented === true`) — préservation de la sélection (D4).

### Groupe 4 — Couleur et taille (D2)
- **T4.1** Clic sur une pastille → la commande **couleur** est appelée avec la couleur de sa
  `data-color`.
- **T4.2** Clic `.btn-size-small` / `.btn-size-large` → commande **taille** appelée avec
  `small` / `large`.
- **T4.3** Clic `.btn-size-h1` / `.btn-size-h2` → commande **taille** appelée avec `h1` / `h2`.

### Groupe 5 — Listes (D2)
- **T5.1** Clic `.btn-list-bullet` → commande **liste à puces** appelée.
- **T5.2** Clic `.btn-list-numbered` → commande **liste numérotée** appelée.

### Groupe 6 — État actif des boutons (D3)
- **T6.1** Si le moteur signale la **marque gras active**, `.btn-bold` porte la classe `active`.
- **T6.2** Si le moteur ne la signale pas active, `.btn-bold` **ne** porte **pas** `active`.
- **T6.3** Après un **événement de sélection** (ex. `selectionchange`), l'état est **relu** auprès
  du moteur et les classes `active` sont mises à jour (ex. gras devient actif après re-sélection).
- **T6.4** La pastille correspondant à la **couleur courante** renvoyée par le moteur porte `active`.
- **T6.5** Le bouton de taille correspondant à la **taille courante** renvoyée par le moteur porte
  `active`.

### Groupe 7 — Émission du contenu (D7)
- **T7.1** Une frappe dans `.editor-content` (`input`) **émet** `contentChange` avec l'`innerHTML`
  courant.
- **T7.2** Après une commande de formatage (ex. clic gras), `contentChange` est **émis** avec
  l'`innerHTML` courant.

### Groupe 8 — Popup d'insertion d'image
- **T8.1** Clic `.btn-image` **ouvre** la popup image (`.image-popup` visible).
- **T8.2** Saisir une URL puis « insérer le lien » (`.btn-image-link`) → commande **insertion HTML**
  du moteur appelée avec un `<img>` dont le `src` est l'URL saisie, puis popup **fermée**.
- **T8.3** Le bouton de fermeture (`.btn-close-popup`) **ferme** la popup et **réinitialise** le champ.
- **T8.4** La **primitive d'insertion d'image**, appelée avec un **data URL**, délègue au moteur un
  `<img>` portant ce data URL (câblage `FileReader` réel = hors unitaire, D6 / hors périmètre §1).

### Groupe 9 — Popup d'insertion de vidéo
- **T9.1** Clic `.btn-video` **ouvre** la popup vidéo (`.video-popup` visible).
- **T9.2** Saisir un lien puis « insérer la vidéo » (`.btn-video-link`) → commande **insertion HTML**
  appelée avec un `<iframe>` dont la `src` provient du **helper d'embed** du moteur (mocké pour
  renvoyer une URL connue), puis popup **fermée**.
- **T9.3** Le bouton de fermeture **ferme** la popup vidéo et **réinitialise** le champ.

## 5. Contrat DOM (sélecteurs ciblés par les tests)

Fixe le contrat que l'implémentation devra honorer. Repris de `format-toolbar.html` (markup
migré dans `RichTextEditor`).

| Sélecteur | Élément / rôle |
|---|---|
| `.editor-content` | zone `contenteditable="true"` (le document riche) |
| `.btn-bold` / `.btn-italic` / `.btn-underline` | boutons de marque |
| `.btn-size-small` / `-normal` / `-large` / `-h2` / `-h1` | boutons de taille |
| `.btn-list-bullet` / `.btn-list-numbered` | boutons de liste |
| `.color-swatch[data-color]` | pastilles de couleur (une par `NOTE_COLOR_PALETTE`) |
| `.btn-image` / `.btn-video` | ouverture des popups média |
| `.image-popup` / `.video-popup` | conteneurs de popup (rendu conditionnel) |
| `.image-url-input` / `.video-url-input` | champs URL des popups |
| `.btn-image-link` / `.btn-video-link` | validation de l'insertion par lien |
| `.btn-image-file` | `input[type=file]` de la popup image |
| `.btn-close-popup` | fermeture d'une popup |
| classe `active` | état actif d'un bouton (marque / liste / couleur / taille) |

## 6. Ordre d'implémentation TDD suggéré

1. **Groupe 1** (rendu statique de la toolbar + zone éditable) →
2. **Groupe 2** (injection du contenu initial, garde D5) →
3. **Groupes 3–5** (délégation des commandes au moteur mocké : marques, couleur/taille, listes) →
4. **Groupe 6** (reflet de l'état actif d'un moteur mocké) →
5. **Groupe 7** (émission de `contentChange`) →
6. **Groupes 8–9** (popups média : ouverture / fermeture / délégation de l'insertion).

À chaque cas : écrire le test (**rouge**), écrire le minimum de code pour le faire passer
(**vert**), refactorer si besoin.

> ⚠️ **Piège builder** (mémoire projet / skill `plan_test` §5) : `@angular/build:unit-test`
> compile tout le bundle en une passe. Un spec important une cible **inexistante**
> (`RichTextEditor`, `FormattingService`) échoue en `TS2307` et **bloque toutes les suites** —
> ce n'est pas un « rouge d'assertions ». Le cas échéant, prévoir un **squelette minimal**
> (classe vide + template placeholder honorant le Contrat DOM) pour obtenir un vrai rouge
> exécutable — **seulement** sur demande explicite (TDD strict).
