---
name: kanban_edition_listes
description: Écran d'édition d'un tableau kanban — la zone de contenu, vide jusqu'ici, porte désormais les listes (colonnes) du tableau : ajouter, renommer, retirer et déplacer une liste, le tout enregistré avec le tableau. Les cartes dans les listes restent hors périmètre.
status: brouillon — à valider
date: 2026-11-05
---

# Explication du développement à réaliser

Le lot précédent (`KANBAN/EDITION`) a livré l'**écran d'édition d'un tableau** : servi par les deux
routes `/kanban/new` et `/kanban/edit/:id`, il porte la saisie du nom, le bouton d'enregistrement et
un retour vers la liste des tableaux qui demande confirmation quand la saisie n'est pas enregistrée.
Il a aussi livré, volontairement **vide**, la **zone de contenu du tableau** — la colonne fantôme
qui annonce « *Les listes et les cartes arriveront dans un prochain lot* » (décision `D-E11`). Ce
lot est ce prochain lot : il **remplit cette zone avec les listes du tableau**.

Un tableau kanban est fait de **listes** (ses colonnes : « À faire », « En cours », « Fait »…) qui
contiendront à terme des **cartes**. Ce lot livre **uniquement les listes** : leur affichage dans
l'ordre, et les quatre gestes qui permettent de composer un tableau — en **ajouter** une, la
**renommer**, la **retirer**, et la **déplacer** d'un cran vers la gauche ou vers la droite. Les
cartes sont explicitement reportées au lot suivant ; le modèle de données doit simplement **laisser
la place** pour qu'elles s'y rattachent sans être refait.

L'**ordre** des listes est une donnée du tableau, pas un hasard d'affichage : il porte le sens du
flux de travail (de gauche à droite, du reste à faire vers le terminé). Il est donc **persisté** et
retrouvé à la réouverture du tableau, exactement tel que l'utilisateur l'a laissé.

Les quatre gestes ne touchent **pas la base immédiatement** : ils modifient le tableau **affiché**,
et c'est le **bouton d'enregistrement déjà en place** qui écrit le tout — le nom du tableau *et* ses
listes — en un seul geste. Ce choix prolonge les deux garanties du lot précédent au lieu de les
contredire :

- la notion de **modification en attente** (`US4` du lot `EDITION`) s'**étend aux listes** : un
  retour vers la liste des tableaux après avoir ajouté, renommé, retiré ou déplacé une liste ouvre
  la **même popup de confirmation** que pour un nom non enregistré. Confirmer abandonne tout le
  travail sur les listes ; annuler laisse l'écran intact ;
- un **échec** de l'enregistrement laisse l'utilisateur sur l'écran avec **ses listes telles
  qu'il les a composées** et un message d'erreur : son travail n'est jamais perdu à cause d'une
  panne de la base, et il peut réessayer.

Ce choix a une conséquence heureuse sur le **tableau neuf** (`/kanban/new`) : l'utilisateur peut
nommer son tableau **et** poser ses listes **avant** que quoi que ce soit n'existe en base, puis
tout créer d'un seul enregistrement. La décision `D-K11` du lot `CRUD` — *ouvrir l'écran n'écrit
rien* — reste donc vraie telle quelle, et aucun tableau fantôme n'apparaît dans la liste.

Le **déplacement** se fait par deux boutons **← / →** portés par chaque liste, qui l'échangent avec
sa voisine. Le glisser-déposer, plus naturel au doigt, est reporté : il demande une gestion des
événements tactiles qui n'apporterait rien au modèle de données livré ici, et pourra être ajouté
plus tard **par-dessus** ce lot sans le remettre en cause.

# Périmètre

**Inclus :**
- **Modèle de données des listes** : une nouvelle table, créée par un **fichier `.sql` dans
  `frontend/public/assets/migrations/`** joué au démarrage par `SchemaMigrationService` — jamais de
  SQL dupliqué en TypeScript. Une liste porte un identifiant, le tableau auquel elle appartient, un
  nom et sa **position** dans le tableau. Suppression du tableau parent ⇒ suppression de ses listes.
- **Lecture des listes** d'un tableau à l'ouverture de `/kanban/edit/:id`, dans leur ordre
  persisté, et **écriture** de l'état complet des listes à l'enregistrement — les deux écrites en
  TDD comme le reste de la couche de données.
- **Affichage** des listes dans la zone de contenu du tableau, horizontalement, dans l'ordre. La
  colonne fantôme actuelle laisse place à un **état vide** explicite quand le tableau n'a aucune
  liste.
- **Ajouter une liste** : un geste depuis la zone de contenu, la saisie de son nom, et la liste
  apparaît **en dernière position**.
- **Renommer une liste** déjà présente.
- **Retirer une liste**, après **confirmation** par la popup `ConfirmDialog` déjà utilisée pour les
  suppressions de notes et de tableaux.
- **Déplacer une liste** d'un cran vers la gauche ou vers la droite par deux boutons **← / →**,
  inopérants aux extrémités.
- **Enregistrement groupé** : le bouton d'enregistrement existant persiste le nom du tableau **et**
  l'état des listes ; retour à la liste des tableaux en cas de succès.
- **Extension des modifications en attente** aux quatre gestes sur les listes, avec la même popup
  de confirmation au retour, et **maintien de l'écran et des listes composées** en cas d'échec de
  l'enregistrement.

**Hors périmètre (lots ultérieurs) :**
- **Les cartes dans les listes** — ajout, édition, suppression, déplacement d'une liste à l'autre :
  c'est le lot suivant, et le but final de la fonctionnalité. Ce lot ne livre que les listes qui
  les accueilleront.
- **Glisser-déposer** d'une liste (et, a fortiori, d'une carte) : reporté au profit des boutons
  ← / →.
- Déplacement d'une liste **au-delà d'un cran** à la fois (saisir une position, envoyer en tête ou
  en queue).
- **Enregistrement automatique** des listes à chaque geste : l'enregistrement reste explicite.
- **Couleur, description, icône, limite de cartes (WIP)** ou toute autre propriété d'une liste
  au-delà de son nom et de sa position.
- **Contrôle d'unicité** du nom des listes au sein d'un tableau : deux listes peuvent porter le même
  nom, comme deux tableaux le peuvent déjà (`D-K4`).
- **Historique d'édition (annuler / rétablir)** sur les listes.
- Duplication d'une liste, modèles de tableau pré-remplis (« À faire / En cours / Fait »).
- **Bouton « retour » matériel d'Android** : il reste non intercepté, donc la composition des
  listes reste perdable par ce geste — trou connu, hérité de `H6` du lot `EDITION`.
- Partage, synchronisation (CRDT, P2P) et pilotage par l'assistant IA.

# User Stories

**US1 : Voir les listes d'un tableau**
- **En tant qu'** utilisateur de Family Notes,
- **je veux** voir les listes d'un tableau, dans l'ordre, en l'ouvrant,
- **afin de** retrouver l'organisation que j'ai mise en place.
- **Critères d'acceptation :**
    - Ouvrir un tableau existant affiche ses listes dans la **zone de contenu** du tableau.
    - Les listes sont affichées **horizontalement**, dans l'**ordre persisté**, de gauche à droite.
    - Chaque liste affiche son **nom**.
    - Un tableau **sans aucune liste** affiche un état vide explicite invitant à en ajouter une —
      et non la colonne fantôme « *les listes arriveront dans un prochain lot* » du lot précédent.
    - Un tableau **neuf** (`/kanban/new`) démarre sans aucune liste.
    - Pendant le chargement du tableau, l'indicateur de chargement déjà en place couvre aussi ses
      listes : l'écran n'affiche jamais un tableau à moitié chargé.
    - Si le chargement des listes échoue, l'écran ne plante pas : il le signale et laisse revenir à
      la liste des tableaux.
    - Les listes sont visibles même quand elles dépassent la largeur de l'écran (**défilement
      horizontal**).

**US2 : Ajouter une liste à un tableau**
- **En tant qu'** utilisateur,
- **je veux** ajouter une liste nommée à mon tableau,
- **afin de** découper mon sujet en étapes (à faire, en cours, fait…).
- **Critères d'acceptation :**
    - La zone de contenu porte un geste d'**ajout de liste**, visible même quand le tableau est
      vide.
    - Le nom de la nouvelle liste est **saisi par l'utilisateur** avant qu'elle apparaisse.
    - La liste ajoutée apparaît **en dernière position**, à droite des listes existantes.
    - Le nom est retenu **sans espaces superflus** en début et en fin ; les espaces intérieurs sont
      conservés.
    - Un nom **vide** ou fait uniquement d'espaces se replie sur **« Sans titre »**, comme pour le
      nom d'un tableau (`D-E2`) : une liste sans nom n'est jamais créée.
    - Plusieurs listes peuvent être ajoutées **à la suite** sans quitter l'écran.
    - Deux listes **peuvent porter le même nom**.
    - L'ajout **n'écrit rien en base** : il rend l'enregistrement nécessaire (`US6`, `US7`).
    - Renoncer à la saisie du nom **n'ajoute aucune liste**.

**US3 : Renommer une liste**
- **En tant qu'** utilisateur,
- **je veux** corriger le nom d'une liste déjà présente,
- **afin de** l'ajuster sans avoir à la supprimer et la recréer.
- **Critères d'acceptation :**
    - Chaque liste offre un geste de **renommage**, qui part de son **nom actuel**.
    - Valider remplace le nom affiché de **cette** liste, et d'elle seule.
    - Mêmes règles de nom qu'à l'ajout : espaces de début et de fin retirés, repli sur
      « Sans titre » si la saisie est vide.
    - Renoncer au renommage laisse le nom **inchangé**.
    - Le renommage **ne change pas la position** de la liste.
    - Le renommage **n'écrit rien en base** avant l'enregistrement.

**US4 : Retirer une liste**
- **En tant qu'** utilisateur,
- **je veux** retirer une liste devenue inutile, après confirmation,
- **afin de** garder un tableau lisible sans craindre un geste involontaire.
- **Critères d'acceptation :**
    - Chaque liste offre un geste de **retrait**.
    - Ce geste ouvre la **popup de confirmation** (le composant `ConfirmDialog` déjà utilisé pour
      les suppressions de notes et de tableaux), qui nomme la liste concernée.
    - « Annuler » (ou un clic hors de la popup) ferme la popup et **conserve** la liste.
    - Confirmer **retire** cette liste de l'affichage, et **elle seule**.
    - Les listes restantes **restent dans leur ordre relatif**, sans trou dans la suite des
      positions.
    - Retirer la **dernière** liste ramène le tableau à son **état vide** (`US1`).
    - Le retrait **n'écrit rien en base** avant l'enregistrement : quitter l'écran sans enregistrer
      **laisse la liste en place**.

**US5 : Déplacer une liste**
- **En tant qu'** utilisateur,
- **je veux** déplacer une liste vers la gauche ou vers la droite,
- **afin de** faire correspondre l'ordre des colonnes à mon flux de travail.
- **Critères d'acceptation :**
    - Chaque liste porte deux boutons de déplacement : **vers la gauche** et **vers la droite**.
    - Le bouton échange la liste avec sa **voisine immédiate** dans la direction choisie ; l'ordre
      affiché change aussitôt.
    - Sur la liste **la plus à gauche**, le bouton « gauche » est **indisponible** (et réciproquement
      à droite) : aucun déplacement hors du tableau, aucune erreur.
    - Un tableau d'**une seule liste** n'offre aucun déplacement effectif.
    - Le déplacement **ne change ni le nom ni le nombre** des listes.
    - Le déplacement **n'écrit rien en base** avant l'enregistrement.

**US6 : Enregistrer le tableau et ses listes en un seul geste**
- **En tant qu'** utilisateur,
- **je veux** que le bouton d'enregistrement sauve le nom du tableau **et** ses listes,
- **afin de** retrouver mon tableau exactement tel que je l'ai composé.
- **Critères d'acceptation :**
    - Le bouton d'enregistrement **déjà en place** persiste, en un seul geste, le nom du tableau et
      l'**état complet** de ses listes : celles ajoutées, renommées, retirées, et leur **ordre**.
    - Sur un tableau **neuf**, l'enregistrement **crée** le tableau *et* ses listes ; ni l'un ni les
      autres n'existent en base avant ce geste. Si l'écriture des listes échoue **après** celle du
      tableau, le tableau, lui, **reste créé** — voir la réserve d'`US7`
      *(révisé le 2026-11-05)*.
    - Sur un tableau **existant**, l'enregistrement met à jour ses listes **et** la date de dernière
      modification du tableau — il remonte donc en tête de la liste des tableaux.
    - Après un enregistrement réussi, l'utilisateur est ramené à la **liste des tableaux**
      *(hypothèse `H-L6` : à revoir, voir ci-dessous)*.
    - Les listes enregistrées sont **persistantes** : rouvrir le tableau — y compris après un
      redémarrage de l'application — affiche les mêmes listes, dans le même ordre.
    - Enregistrer **sans avoir touché aux listes** les laisse telles quelles.
    - L'enregistrement est **rejouable** : enregistrer deux fois de suite, ou réessayer après un
      échec, aboutit au **même** résultat qu'un enregistrement réussi du premier coup — ni tableau
      en double, ni liste en double *(ajouté le 2026-11-05)*.

**US7 : Ne pas perdre mes listes par accident**
- **En tant qu'** utilisateur,
- **je veux** être prévenu quand je quitte l'écran alors que mon travail sur les listes n'est pas
  enregistré, et le retrouver intact si l'enregistrement échoue,
- **afin de** ne jamais perdre une composition de tableau à cause d'un geste de retour ou d'une
  panne.
- **Critères d'acceptation :**
    - Un ajout, un renommage, un retrait ou un déplacement de liste compte comme une
      **modification en attente**, au même titre que la saisie du nom du tableau (`US4` du lot
      `EDITION`).
    - Le **retour** vers la liste des tableaux ouvre alors la **même popup de confirmation**,
      prévenant que les modifications seront perdues.
    - « Annuler » laisse l'utilisateur sur l'écran, **ses listes intactes**.
    - Confirmer ramène à la liste **sans déclencher le moindre enregistrement** : à cet instant,
      aucune liste n'est créée, retirée, renommée ni déplacée en base. Si un enregistrement a déjà
      été **tenté et échoué** à mi-chemin, ce qu'il avait écrit reste écrit — voir la réserve
      ci-dessous *(révisé le 2026-11-05)*.
    - **Sans** modification en attente — ni sur le nom, ni sur les listes — le retour est
      **immédiat**, sans question.
    - Après un **enregistrement réussi**, il n'y a **plus** de modification en attente : un retour
      immédiat ne pose plus de question.
    - En cas d'**échec** de l'enregistrement, l'utilisateur **reste** sur l'écran, les listes
      **telles qu'il les a composées**, avec un message d'erreur visible — et non laissé dans la
      seule console.
    - Après un échec, l'utilisateur peut **réessayer** l'enregistrement, et la modification reste
      « en attente ». Un ré-essai ne crée **jamais** un second tableau.
    - **Garantie tenue par un échec** *(réécrit le 2026-11-05)* : ce que l'utilisateur **voit** est
      intact — son nom, ses listes, leur ordre — et l'enregistrement est **rejouable**, donc un
      nouvel essai réussi met en base la composition **entière**.
    - **Réserve assumée** *(ajoutée le 2026-11-05)* : l'enregistrement n'est **pas** une opération
      atomique. Faute de transaction — décision `D-L13` d'`APPROCHE_KANBAN_EDITION_LISTES.md`, prise
      en connaissance de cause —, un échec survenu **après** l'écriture du tableau peut laisser la
      base dans un état intermédiaire : tableau enregistré, listes pas encore écrites ou écrites à
      moitié. La version précédente de ce critère promettait qu'« un échec ne crée, ne modifie, ni
      ne supprime aucune liste en base » : c'était **faux**, et aucun test n'aurait pu le rendre
      vert.

# Questions ouvertes / hypothèses

- **H-L1 — Dossier de la fonctionnalité** — *tranchée le 2026-11-05* : les livrables de ce lot vont
  dans `.agent/KANBAN/EDITION_LISTES`, à côté de `.agent/KANBAN/EDITION`.
- **H-L2 — Moment de la persistance** — *tranchée le 2026-11-05* : les quatre gestes **ne touchent
  pas la base** ; tout est persisté par le **bouton d'enregistrement** existant (`US6`). Cela
  prolonge `US4`/`US5` du lot `EDITION` aux listes (`US7`), et préserve `D-K11` (ouvrir un tableau
  neuf n'écrit rien). L'alternative — écrire à chaque geste — imposait de créer le tableau neuf
  avant d'accepter la moindre liste.
- **H-L3 — Geste de déplacement** — *tranchée le 2026-11-05* : **boutons ← / →**, un cran à la
  fois. Le **glisser-déposer** est hors périmètre, à ajouter plus tard par-dessus ce lot.
- **H-L4 — Renommage d'une liste** — *tranchée le 2026-11-05* : **inclus** (`US3`), pour éviter
  d'avoir à supprimer puis recréer une liste mal nommée.
- **H-L5 — Confirmation au retrait** — *tranchée le 2026-11-05* : **oui**, popup `ConfirmDialog`
  (`US4`), par cohérence avec les suppressions de notes et de tableaux et parce que le lot
  « cartes » rendra la perte réelle.
- **H-L6 — Sort de l'écran après enregistrement** — **question ouverte, à trancher**. `H2` du lot
  `EDITION` avait retenu le **retour à la liste des tableaux**, en notant qu'il faudrait y revenir
  « *lorsque les listes et les cartes arriveront* ». C'est maintenant le cas : composer des listes
  puis être éjecté du tableau à chaque enregistrement peut devenir pénible. `US6` garde le retour à
  la liste pour ne pas changer deux choses à la fois — **à confirmer ou à renverser** (rester dans
  le tableau, le bouton de retour devenant la seule sortie).
- **H-L7 — Nom par défaut d'une liste** : hypothèse retenue — même repli que pour un tableau,
  **« Sans titre »** (`D-E2`), appliqué à la validation de la saisie.
- **H-L8 — Saisie du nom d'une nouvelle liste** : hypothèse retenue — saisie **sur place** dans la
  zone de contenu (une colonne de saisie à droite des listes existantes), plutôt qu'une popup
  dédiée. Même parti pour le renommage, directement sur l'en-tête de la liste.
- **H-L9 — Nombre de listes** : hypothèse retenue — **aucune limite** haute, aucune liste imposée à
  la création d'un tableau (pas de modèle « À faire / En cours / Fait » pré-rempli).
- **H-L10 — Place laissée aux cartes** : hypothèse retenue — la table des listes porte un
  identifiant propre, auquel les cartes se rattacheront au lot suivant, et la suppression d'un
  tableau emporte ses listes. Aucun autre travail d'anticipation sur les cartes dans ce lot.
- **H-L11 — Maquette** : `MAQUETTE_KANBAN_EDITOR.html` a été déclarée **périmée** par
  `REVUE_KANBAN_EDITION.md` (son rôle de fixation du contrat DOM est terminé, le code fait foi).
  Faut-il une **nouvelle maquette** de la zone de contenu avec ses listes avant de partir sur
  l'approche et le plan de test, ou travaille-t-on directement depuis le code existant ?
- **H-L12 — Atomicité de l'enregistrement** — *tranchée le 2026-11-05* : **pas de transaction**
  (il n'en existe aucune dans le dépôt). Le tableau est écrit d'abord, les listes ensuite, et c'est
  la **rejouabilité** de l'écriture qui tient lieu de garantie — pas l'atomicité. `US6` et `US7`
  ont été réécrites en conséquence. Voir `D-L13` et `D-L19` d'`APPROCHE_KANBAN_EDITION_LISTES.md`.
