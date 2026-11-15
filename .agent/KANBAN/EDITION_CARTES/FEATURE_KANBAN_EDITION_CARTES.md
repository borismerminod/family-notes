---
name: kanban_edition_cartes
description: Les cartes dans les listes d'un tableau kanban — créer une carte faite d'un texte et d'une référence optionnelle vers une note, modifier son texte, la supprimer, la déplacer dans sa liste ou vers une liste voisine via un mode sélection, le tout enregistré avec le tableau. Dernier lot de la fonctionnalité kanban.
status: brouillon — à valider
date: 2026-11-11
---

# Explication du développement à réaliser

Le lot précédent (`KANBAN/EDITION_LISTES`) a livré les **listes** d'un tableau — leur affichage dans
l'ordre, et les quatre gestes qui les composent : ajouter, renommer, retirer, déplacer. Il a livré,
dans chaque liste, une **zone réservée aux cartes** volontairement présente et vide (décision
`D-L21`), et il a annoncé les cartes comme « le lot suivant, et le but final de la fonctionnalité ».
Ce lot est ce lot suivant : il **remplit cette zone**, et **termine la fonctionnalité kanban**.

Une **carte** est l'unité de travail du tableau : la chose qu'on fait avancer de « À faire » vers
« Fait ». Dans Family Notes, elle est faite de deux parties, et la seconde est ce qui la distingue
d'un simple pense-bête :

- un **texte**, obligatoire — ce qu'il y a à faire, en clair sur la carte ;
- une **référence vers une note** de l'application, **facultative** — le lien entre les deux
  moitiés de l'application. Le tableau porte l'**avancement** d'un sujet, la note en porte le
  **contenu** : la carte « Préparer la rentrée » renvoie à la note qui tient la liste des
  fournitures. Toucher la référence **ouvre la note** dans l'éditeur de notes, ce qui fait du
  tableau un point d'entrée vers les notes et pas seulement une liste de tâches.

Les gestes livrés sont ceux qui font vivre un tableau : **créer** une carte dans une liste,
**modifier** son texte, la **supprimer**, et la **déplacer** — vers le haut ou le bas de sa liste
pour la prioriser, vers une liste voisine pour la faire avancer dans le flux.

Le **déplacement** est le point délicat sur un téléphone. Le glisser-déposer reste hors périmètre,
comme pour les listes (`D-L2`) : il demande une gestion des événements tactiles qui n'apporterait
rien au modèle de données livré ici. À la place, un **mode sélection** : chaque liste porte un
bouton « déplacer » qui fait basculer le tableau dans un mode où toucher une carte la **cible** —
une seule à la fois sur tout le tableau — et où des **flèches ↑ ↓ ← →** apparaissent pour la
pousser d'un cran. On sort du mode explicitement. Ce détour par un mode est **voulu** : hors du
mode, toucher une carte ouvre directement la **saisie de son texte**, ce qui est le geste le plus
fréquent, et les cartes restent **nues** — aucune carte ne porte quatre boutons, ce qui serait
illisible dans une colonne étroite.

Le mode sélection vaut pour **tout le tableau**, pas pour une seule liste : c'est ce qui permet à
une carte de traverser les listes **sans être désélectionnée**. L'utilisateur peut donc enchaîner
les crans — deux fois « → » pour sauter deux listes — en un seul passage par le mode.

Les gestes ne touchent **pas la base immédiatement** : ils modifient le tableau **affiché**, et
c'est le **bouton d'enregistrement déjà en place** qui écrit le tout — le nom du tableau, ses listes
*et* leurs cartes — en un seul geste. Ce choix prolonge `D-L1` aux cartes plutôt que de le
contredire, et il est **tranché d'office** ici : les cartes vivent sur le même écran et sous le même
bouton que les listes, les faire persister autrement aurait donné deux règles pour un seul écran.
Deux conséquences héritées telles quelles :

- la notion de **modification en attente** s'**étend aux cartes** : un retour vers la liste des
  tableaux après avoir créé, modifié, supprimé ou déplacé une carte ouvre la **même popup de
  confirmation** ;
- un **échec** de l'enregistrement laisse l'utilisateur sur l'écran avec **ses cartes telles qu'il
  les a composées** et un message d'erreur, et l'enregistrement reste **rejouable** — sans être
  pour autant atomique (réserve `D-L13` / `H-L12`, qui s'étend d'un cran de plus avec les cartes).

L'**ouverture d'une note** depuis une carte est la seule nouveauté qui fait **sortir** de l'écran
d'édition du tableau. Elle passe donc par la même garantie que le bouton « Retour » : s'il y a des
modifications en attente, la popup de confirmation prévient avant de quitter le tableau.

Enfin, les deux moitiés de l'application deviennent **liées**, ce qui pose la question d'une note
supprimée depuis l'écran des notes. Le parti retenu est le moins destructeur : la carte **survit**
avec son texte, et c'est la **référence** qui disparaît. Le texte est la donnée porteuse ; le lien
n'est qu'un complément, et supprimer une note ne doit jamais faire disparaître du travail dans un
tableau.

# Périmètre

**Inclus :**
- **Modèle de données des cartes** : une nouvelle table, créée par un **fichier `.sql` dans
  `frontend/public/assets/migrations/`** joué au démarrage par `SchemaMigrationService` — jamais de
  SQL dupliqué en TypeScript. Une carte porte un identifiant, la **liste** à laquelle elle
  appartient, un **texte**, une **référence facultative** vers une note, et sa **position** dans la
  liste. Suppression de la liste parente (ou du tableau, par cascade déjà en place) ⇒ suppression
  de ses cartes. Suppression de la **note** référencée ⇒ la carte **reste**, sa référence est vidée.
- **Lecture des cartes** de chaque liste à l'ouverture de `/kanban/edit/:id`, dans leur ordre
  persisté, et **écriture** de l'état complet des cartes à l'enregistrement — les deux écrites en
  TDD comme le reste de la couche de données, et selon la même stratégie d'**upsert puis suppression
  des absentes** que les listes (`D-L10`), pour que les identifiants survivent.
- **Affichage** des cartes dans la zone déjà réservée de chaque liste, verticalement, dans l'ordre,
  avec défilement vertical quand elles dépassent la hauteur de l'écran. Une liste **sans carte**
  affiche un état vide explicite.
- **Créer une carte** dans une liste : un geste depuis la liste, la saisie du texte, et — au même
  moment si l'utilisateur le souhaite — le choix de la **note référencée**. La carte apparaît en
  **dernière position** de sa liste.
- **Modifier le texte** d'une carte existante, en touchant la carte.
- **Lier une carte à une note**, ou **retirer** ce lien, sur une carte déjà créée.
- **Ouvrir la note référencée** depuis la carte, avec la popup de confirmation si des modifications
  sont en attente.
- **Supprimer une carte**, après **confirmation** par la popup `ConfirmDialog` déjà utilisée pour
  les suppressions de notes, de tableaux et de listes.
- **Mode sélection** : un bouton « déplacer » par liste fait basculer tout le tableau dans un mode
  où toucher une carte la cible ; des flèches **↑ ↓ ← →** déplacent la carte sélectionnée d'un cran,
  inopérantes aux extrémités ; une sortie explicite du mode.
- **Déplacement vertical** d'une carte dans sa liste (↑ / ↓) et **déplacement vers la liste
  voisine** (← / →), la carte conservant son **rang vertical** dans la liste d'arrivée — ou
  atterrissant **en bas** quand celle-ci est plus courte.
- **Enregistrement groupé** : le bouton d'enregistrement existant persiste le nom du tableau, ses
  listes **et** leurs cartes ; retour à la liste des tableaux en cas de succès.
- **Extension des modifications en attente** aux gestes sur les cartes, avec la même popup de
  confirmation au retour **et avant l'ouverture d'une note**, et **maintien de l'écran et des cartes
  composées** en cas d'échec de l'enregistrement.
- **Avertissement au retrait d'une liste qui porte des cartes** : la popup de retrait d'une liste
  (`US4` du lot `EDITION_LISTES`) dit désormais que ses cartes partiront avec elle.

**Hors périmètre (lots ultérieurs) :**
- **Glisser-déposer** d'une carte (ni d'une liste) : reporté au profit du mode sélection, et
  ajoutable plus tard **par-dessus** ce lot sans le remettre en cause.
- Déplacement d'une carte **au-delà d'un cran** à la fois (saisir une position, envoyer en tête ou
  en queue d'une liste), et déplacement **multiple** (plusieurs cartes sélectionnées à la fois).
- Déplacement d'une carte **vers un autre tableau**.
- **Référence vers autre chose qu'une note** : un événement du calendrier, une catégorie, un lien
  externe, une autre carte.
- **Plusieurs notes** référencées par une même carte : la référence est unique et facultative.
- **Aperçu du contenu de la note** dans le tableau : toucher la référence **ouvre** la note, il
  n'y a pas de panneau de prévisualisation.
- **Création d'une note depuis une carte** (« lier à une note qui n'existe pas encore ») : la note
  doit déjà exister pour être référencée.
- **Texte riche** sur la carte : le texte d'une carte est du **texte simple**, pas un document à
  blocs comme une note. Ni mise en forme, ni lien inséré, ni case à cocher.
- **Toute autre propriété d'une carte** : couleur, étiquette, échéance, assignation, pièce jointe,
  sous-tâches, description longue.
- **Limite de cartes par liste (WIP)**, compteur de cartes dans l'en-tête d'une liste.
- **Contrôle d'unicité** du texte des cartes : deux cartes peuvent porter le même texte, et deux
  cartes peuvent référencer la **même** note.
- **Enregistrement automatique** à chaque geste : l'enregistrement reste explicite.
- **Historique d'édition (annuler / rétablir)** sur les cartes.
- Duplication d'une carte, modèles de tableau pré-remplis.
- **Bouton « retour » matériel d'Android** : il reste non intercepté, donc la composition reste
  perdable par ce geste — trou connu, hérité de `H6` du lot `EDITION`.
- Partage, synchronisation (CRDT, P2P) et pilotage par l'assistant IA.

# User Stories

**US1 : Voir les cartes d'une liste**
- **En tant qu'** utilisateur de Family Notes,
- **je veux** voir les cartes de chaque liste, dans l'ordre, en ouvrant un tableau,
- **afin de** retrouver d'un coup d'œil où en est chacun de mes sujets.
- **Critères d'acceptation :**
    - Ouvrir un tableau existant affiche les cartes de chaque liste **dans la zone réservée** de
      cette liste, et non ailleurs.
    - Les cartes sont affichées **verticalement**, dans l'**ordre persisté**, de haut en bas.
    - Chaque carte affiche son **texte**.
    - Une carte qui **référence une note** affiche en plus le **titre** de cette note, de façon
      distincte de son propre texte.
    - Une carte **sans référence** n'affiche rien de plus que son texte : aucun emplacement vide ni
      mention « aucune note ».
    - Une liste **sans aucune carte** affiche un état vide explicite invitant à en créer une.
    - Une liste nouvellement **ajoutée** démarre sans aucune carte.
    - Le chargement du tableau couvre aussi ses cartes : l'indicateur de chargement déjà en place
      reste jusqu'au bout, l'écran n'affiche jamais des listes sans leurs cartes.
    - Si le chargement des cartes échoue, l'écran ne plante pas : il le signale et laisse revenir à
      la liste des tableaux, comme pour un échec de chargement des listes.
    - Les cartes sont atteignables même quand elles dépassent la hauteur de l'écran (**défilement
      vertical** à l'intérieur de la liste), sans empêcher le défilement **horizontal** des listes
      déjà en place.

**US2 : Créer une carte dans une liste**
- **En tant qu'** utilisateur,
- **je veux** créer une carte portant un texte, et éventuellement un lien vers une note,
- **afin de** poser dans le tableau une chose à faire, rattachée au besoin à son contenu détaillé.
- **Critères d'acceptation :**
    - Chaque liste porte un geste de **création de carte**, visible même quand elle est vide.
    - Le **texte** de la carte est **saisi par l'utilisateur** avant qu'elle apparaisse.
    - La création offre, **dans le même geste**, le choix **facultatif** d'une note à référencer :
      on peut valider une carte **sans** note.
    - La carte créée apparaît **en dernière position** de sa liste, sous les cartes existantes.
    - Le texte est retenu **sans espaces superflus** en début et en fin ; les espaces intérieurs
      sont conservés.
    - Un texte **vide** ou fait uniquement d'espaces se replie sur **« Sans titre »**, comme le nom
      d'un tableau (`D-E2`) et celui d'une liste (`D-L17`) : une carte sans texte n'est jamais
      créée.
    - Plusieurs cartes peuvent être créées **à la suite** dans la même liste sans quitter l'écran.
    - Deux cartes **peuvent porter le même texte**, et **référencer la même note**.
    - La création **n'écrit rien en base** : elle rend l'enregistrement nécessaire (`US9`, `US10`).
    - Renoncer à la saisie **ne crée aucune carte**.

**US3 : Modifier le texte d'une carte**
- **En tant qu'** utilisateur,
- **je veux** corriger le texte d'une carte déjà posée,
- **afin de** l'ajuster sans avoir à la supprimer et la recréer.
- **Critères d'acceptation :**
    - **Toucher une carte** — hors du mode sélection (`US7`) — ouvre la saisie de son texte, qui
      part du **texte actuel**.
    - Valider remplace le texte de **cette** carte, et d'elle seule.
    - Mêmes règles de texte qu'à la création : espaces de début et de fin retirés, repli sur
      « Sans titre » si la saisie est vide.
    - Renoncer laisse le texte **inchangé**.
    - La modification ne change ni la **position** de la carte, ni sa **liste**, ni sa
      **référence**.
    - La modification **n'écrit rien en base** avant l'enregistrement.

**US4 : Lier une carte à une note, ou défaire ce lien**
- **En tant qu'** utilisateur,
- **je veux** rattacher une carte existante à une note, ou détacher celle qui s'y trouve,
- **afin de** relier l'avancement que porte le tableau au contenu que porte la note.
- **Critères d'acceptation :**
    - Depuis une carte, un geste permet de **choisir la note** à référencer parmi les notes de
      l'application, **désignées par leur titre**.
    - La liste des notes proposées est **consultable** même quand elle est longue (recherche ou
      filtrage par titre), et n'oblige pas à connaître l'identifiant de la note.
    - Choisir une note remplace la référence de **cette** carte ; la carte affiche aussitôt le
      **titre** de la note choisie (`US1`).
    - Une carte qui porte déjà une référence offre un geste pour la **retirer** : la carte garde son
      texte et redevient une carte sans note.
    - Renoncer au choix laisse la référence **inchangée**.
    - Si l'application ne contient **aucune note**, le geste le dit plutôt que d'ouvrir une liste
      vide sans explication.
    - Lier ou délier **n'écrit rien en base** avant l'enregistrement.

**US5 : Ouvrir la note référencée depuis une carte**
- **En tant qu'** utilisateur,
- **je veux** ouvrir la note d'une carte d'un seul geste depuis le tableau,
- **afin de** passer de l'avancement au contenu sans traverser l'application.
- **Critères d'acceptation :**
    - Sur une carte qui référence une note, un geste **distinct** de celui qui modifie son texte
      (`US3`) ouvre cette note dans l'**éditeur de notes**.
    - La note ouverte est bien **celle que la carte référence**, avec son contenu.
    - S'il y a des **modifications en attente** sur le tableau, ce geste ouvre d'abord la **popup de
      confirmation** (`US10`) : annuler laisse l'utilisateur sur le tableau, ses cartes intactes ;
      confirmer ouvre la note **sans enregistrer** le tableau.
    - **Sans** modification en attente, la note s'ouvre **immédiatement**, sans question.
    - Une carte **sans** référence n'offre pas ce geste.
    - Si la note référencée est **introuvable**, l'écran le signale et reste utilisable : aucun
      écran blanc, aucun plantage.

**US6 : Supprimer une carte**
- **En tant qu'** utilisateur,
- **je veux** supprimer une carte devenue inutile, après confirmation,
- **afin de** garder un tableau lisible sans craindre un geste involontaire.
- **Critères d'acceptation :**
    - Chaque carte offre un geste de **suppression**.
    - Ce geste ouvre la **popup de confirmation** (le composant `ConfirmDialog` déjà utilisé pour
      les suppressions de notes, de tableaux et de listes), qui **nomme la carte** concernée.
    - « Annuler » (ou un clic hors de la popup) ferme la popup et **conserve** la carte.
    - Confirmer retire cette carte de l'affichage, et **elle seule** : les autres cartes de la
      liste, et celles des autres listes, sont intactes.
    - Les cartes restantes **restent dans leur ordre relatif**, sans trou dans la suite des
      positions.
    - Supprimer la **dernière** carte d'une liste ramène celle-ci à son **état vide** (`US1`).
    - Supprimer une carte ne touche **pas** la note qu'elle référençait : la note reste dans
      l'application.
    - La suppression **n'écrit rien en base** avant l'enregistrement : quitter l'écran sans
      enregistrer **laisse la carte en place**.

**US7 : Cibler une carte pour la déplacer (mode sélection)**
- **En tant qu'** utilisateur,
- **je veux** désigner la carte à déplacer avant d'actionner les flèches,
- **afin de** déplacer mes cartes au doigt sans encombrer chaque carte de boutons.
- **Critères d'acceptation :**
    - Chaque liste porte un bouton **« déplacer »** qui fait basculer le tableau en **mode
      sélection**.
    - En mode sélection, **toucher une carte la sélectionne** ; la carte sélectionnée est
      **visuellement distinguée** des autres.
    - Une **seule** carte est sélectionnée à la fois **sur tout le tableau** : sélectionner une
      autre carte, même dans une autre liste, désélectionne la précédente.
    - En mode sélection, toucher une carte **n'ouvre pas** la saisie de son texte (`US3`) : le mode
      remplace ce geste par la sélection.
    - Les **flèches de déplacement** (`US8`) n'apparaissent **qu'en mode sélection**, et seulement
      lorsqu'une carte est effectivement sélectionnée.
    - Le mode se **quitte explicitement**, ce qui désélectionne la carte et rend au toucher son rôle
      de modification.
    - Le mode sélection **ne modifie rien par lui-même** : entrer dans le mode, sélectionner une
      carte puis sortir du mode ne compte **pas** comme une modification en attente.
    - Entrer dans le mode pendant une **saisie en cours** (texte d'une carte, nom d'une liste, ou
      création) ne fait pas perdre cette saisie sans avertissement.

**US8 : Déplacer la carte sélectionnée**
- **En tant qu'** utilisateur,
- **je veux** pousser la carte sélectionnée vers le haut, le bas, ou la liste voisine,
- **afin de** la prioriser dans sa liste et la faire avancer dans mon flux de travail.
- **Critères d'acceptation :**
    - Quatre flèches agissent sur la carte sélectionnée : **↑**, **↓**, **←** et **→**.
    - **↑** et **↓** échangent la carte avec sa **voisine immédiate** dans sa liste ; l'ordre
      affiché change aussitôt.
    - **←** et **→** déplacent la carte vers la **liste immédiatement voisine** dans la direction
      choisie.
    - En changeant de liste, la carte **conserve son rang vertical** ; si la liste d'arrivée est
      **plus courte**, la carte atterrit **en dernière position**.
    - Sur la **première** carte d'une liste, **↑** est **indisponible** (et réciproquement **↓** sur
      la dernière) : aucun déplacement hors de la liste, aucune erreur.
    - Dans la liste **la plus à gauche**, **←** est **indisponible** (et réciproquement **→** dans
      celle la plus à droite) : aucun déplacement hors du tableau.
    - Un tableau d'une **seule liste** n'offre aucun déplacement **horizontal** effectif ; une liste
      d'une **seule carte** n'offre aucun déplacement **vertical** effectif.
    - La carte déplacée **reste sélectionnée** après son déplacement, y compris quand elle a changé
      de liste : les crans peuvent être **enchaînés** sans ressélectionner.
    - Le déplacement ne change ni le **texte**, ni la **référence**, ni le **nombre** total de
      cartes du tableau.
    - Les cartes **laissées derrière** et celles de la liste d'arrivée se renumérotent **sans
      trou**.
    - Le déplacement **n'écrit rien en base** avant l'enregistrement.

**US9 : Enregistrer le tableau, ses listes et ses cartes en un seul geste**
- **En tant qu'** utilisateur,
- **je veux** que le bouton d'enregistrement sauve aussi les cartes,
- **afin de** retrouver mon tableau exactement tel que je l'ai composé.
- **Critères d'acceptation :**
    - Le bouton d'enregistrement **déjà en place** persiste, en un seul geste, le nom du tableau,
      l'état complet de ses **listes** et l'état complet de leurs **cartes** : celles créées,
      modifiées, supprimées, celles qui ont **changé de liste**, et leur **ordre**.
    - Sur un tableau **neuf**, l'enregistrement crée le tableau, ses listes **et** leurs cartes ;
      rien de tout cela n'existe en base avant ce geste.
    - Sur un tableau **existant**, l'enregistrement met à jour ses cartes **et** la date de dernière
      modification du tableau — il remonte donc en tête de la liste des tableaux.
    - Les cartes enregistrées sont **persistantes** : rouvrir le tableau — y compris après un
      redémarrage de l'application — affiche les mêmes cartes, dans les mêmes listes, dans le même
      ordre, avec les mêmes références de note.
    - Enregistrer **sans avoir touché aux cartes** les laisse telles quelles.
    - L'enregistrement est **rejouable** : enregistrer deux fois de suite, ou réessayer après un
      échec, aboutit au **même** résultat qu'un enregistrement réussi du premier coup — ni carte en
      double, ni carte orpheline.
    - Une carte **déplacée** d'une liste à une autre reste **la même carte** : son identifiant et sa
      référence survivent au déplacement, elle n'est pas détruite puis recréée.
    - Retirer une **liste** qui portait des cartes fait disparaître **ses cartes** à
      l'enregistrement, et seulement les siennes.
    - La **réserve d'atomicité** du lot précédent s'applique d'un cran de plus (`H-L12`, `D-L13`) :
      faute de transaction, un échec peut laisser la base dans un état intermédiaire — tableau
      enregistré, listes écrites, cartes pas encore. La garantie tenue est la **rejouabilité**, pas
      l'atomicité.

**US10 : Ne pas perdre mes cartes par accident**
- **En tant qu'** utilisateur,
- **je veux** être prévenu quand je quitte l'écran alors que mon travail sur les cartes n'est pas
  enregistré, et le retrouver intact si l'enregistrement échoue,
- **afin de** ne jamais perdre une composition de tableau à cause d'un geste de sortie ou d'une
  panne.
- **Critères d'acceptation :**
    - Une création, une modification de texte, un changement de référence, une suppression ou un
      déplacement de carte compte comme une **modification en attente**, au même titre que les
      gestes sur les listes (`US7` du lot `EDITION_LISTES`).
    - Le **retour** vers la liste des tableaux ouvre alors la **même popup de confirmation**,
      prévenant que les modifications seront perdues.
    - L'**ouverture d'une note** depuis une carte (`US5`) ouvre la **même popup**, pour la même
      raison : c'est une sortie de l'écran.
    - « Annuler » laisse l'utilisateur sur l'écran, **ses cartes intactes**.
    - Confirmer quitte l'écran **sans déclencher le moindre enregistrement** : à cet instant,
      aucune carte n'est créée, modifiée, supprimée ni déplacée en base.
    - **Sans** modification en attente — ni sur le nom, ni sur les listes, ni sur les cartes — la
      sortie est **immédiate**, sans question.
    - Après un **enregistrement réussi**, il n'y a **plus** de modification en attente.
    - En cas d'**échec** de l'enregistrement, l'utilisateur **reste** sur l'écran, ses cartes
      **telles qu'il les a composées** — dans leurs listes, dans leur ordre, avec leurs
      références — et un message d'erreur visible, jamais laissé dans la seule console.
    - Après un échec, l'utilisateur peut **réessayer**, et la modification reste « en attente ». Un
      ré-essai ne crée **jamais** une seconde carte.
    - Retirer une **liste** qui porte des cartes ouvre une popup qui **le dit** : la confirmation
      prévient que les cartes de cette liste partiront avec elle.
    - Supprimer une **note** depuis l'écran des notes ne fait perdre **aucune carte** : les cartes
      qui la référençaient gardent leur texte et perdent seulement leur lien (`H-C6`).

# Questions ouvertes / hypothèses

- **H-C1 — Dossier de la fonctionnalité** — *tranchée le 2026-11-11* : les livrables de ce lot vont
  dans `.agent/KANBAN/EDITION_CARTES`, à côté de `.agent/KANBAN/EDITION_LISTES`.
- **H-C2 — Moment de la persistance** — *tranchée d'office le 2026-11-11* : les gestes sur les
  cartes **ne touchent pas la base** ; tout est persisté par le **bouton d'enregistrement** existant
  (`US9`). Prolonge `D-L1` plutôt que de le contredire : une seule règle de persistance pour tout
  l'écran. Non soumise à question — l'alternative aurait imposé deux règles concurrentes sur le même
  bouton.
- **H-C3 — Geste de déplacement** — *tranchée le 2026-11-11* : **mode sélection** déclenché par un
  bouton « déplacer » porté par chaque liste, puis **flèches ↑ ↓ ← →** sur la carte sélectionnée, un
  cran à la fois (`US7`, `US8`). Hors du mode, toucher une carte ouvre la **saisie de son texte**.
  Écartés : des flèches portées par chaque carte (illisible dans une colonne étroite), et le
  **glisser-déposer** (hors périmètre, comme `D-L2` pour les listes).
- **H-C4 — Atterrissage d'une carte changeant de liste** — *tranchée le 2026-11-11* : la carte
  **conserve son rang vertical**, et atterrit **en bas** si la liste d'arrivée est plus courte.
  Plus proche du glisser-déposer qu'un atterrissage systématique en queue.
- **H-C5 — Rôle de la référence** — *tranchée le 2026-11-11* : toucher la référence **ouvre la note**
  dans l'éditeur de notes (`US5`). Écartés : une référence purement décorative (titre non
  cliquable), et un **aperçu** du contenu dans le tableau (nouvel écran à concevoir, hors
  périmètre).
- **H-C6 — Note référencée supprimée** — *tranchée le 2026-11-11* : la carte **garde son texte**, sa
  **référence disparaît** (`ON DELETE SET NULL`). Écartés : conserver un titre figé avec la mention
  « note supprimée » (il faudrait stocker le titre sur la carte, donc le désynchroniser d'un
  renommage), et la **cascade** (supprimer une note ferait disparaître du travail dans un tableau,
  sans confirmation côté tableau).
- **H-C7 — Où vit la suppression d'une carte** — hypothèse retenue, **à confirmer** : la corbeille
  d'une carte vit **dans la saisie de son texte** (ouverte par un simple toucher, `US3`), à côté des
  boutons de validation et d'abandon. Le **mode sélection** reste donc dédié au seul déplacement,
  exactement comme décrit. L'alternative serait de poser la corbeille **à côté des flèches**, dans
  le mode sélection, qui deviendrait « le mode où l'on agit sur une carte entière » — mais il
  faudrait alors entrer dans un mode nommé « déplacer » pour supprimer.
- **H-C8 — Où vivent les flèches** — hypothèse retenue : les flèches sont rendues par la **liste qui
  porte la carte sélectionnée**, sous ses cartes, pas dans une barre flottante en pied d'écran.
  Quand la carte change de liste, les flèches **suivent**. À renverser si une barre fixe en bas
  d'écran paraît plus confortable au doigt.
- **H-C9 — Choix de la note à référencer** — hypothèse retenue : une liste des notes **filtrable par
  titre**, dans l'esprit du `CategorySelector` existant (saisie + propositions), plutôt qu'un écran
  de sélection dédié ou une navigation vers l'écran des notes. Le même geste sert à la création
  (`US2`) et au rattachement ultérieur (`US4`).
- **H-C10 — Texte de la carte** — hypothèse retenue : **texte simple**, mono- ou multi-ligne, sans
  mise en forme ni blocs. Le contenu riche est le rôle de la **note référencée** ; dupliquer
  l'éditeur de notes sur une carte n'apporterait rien et doublerait le périmètre.
- **H-C11 — Longueur du texte et nombre de cartes** — hypothèse retenue : **aucune limite** haute ni
  sur la longueur du texte d'une carte, ni sur le nombre de cartes d'une liste. Le texte long est
  simplement affiché sur plusieurs lignes.
- **H-C12 — Sort de l'écran après enregistrement** — **question ouverte, héritée de `H-L6` /
  `D-L16`**. Le lot précédent a maintenu le **retour à la liste des tableaux** « pour ne pas changer
  deux choses à la fois », en notant que cela « deviendra franchement pénible au lot cartes ». Nous
  y sommes : composer plusieurs cartes et être éjecté du tableau à chaque enregistrement est un vrai
  inconfort. `US9` garde le retour à la liste par défaut — **à confirmer ou à renverser** (rester
  sur le tableau, le bouton « Retour » devenant la seule sortie).
- **H-C13 — Maquette** — **question ouverte** : `D-L20` a acté que **le code fait foi** et qu'aucune
  nouvelle maquette n'était produite pour les listes. Ce lot introduit cependant un **mode** (donc
  deux états d'écran) et une **carte** à dessiner. Faut-il une `MAQUETTE_KANBAN_CARTES.html` avant
  de partir sur l'approche et le plan de test, ou travaille-t-on directement depuis le code
  existant ?
- **H-C14 — Changement de schéma** — hypothèse retenue : une table `kanban_cards` créée par un
  nouveau script de migration, gardée par son `isTable` comme les étapes de `D-L15`. Le `PRAGMA
  foreign_keys = ON` nécessaire aux cascades est **déjà en place** (`D-L14`), ce qui rend `ON DELETE
  CASCADE` (liste parente) et `ON DELETE SET NULL` (note référencée) effectifs sans travail
  d'infrastructure supplémentaire. Après ce lot : `npm run build` puis `npx cap sync` **obligatoires**.
