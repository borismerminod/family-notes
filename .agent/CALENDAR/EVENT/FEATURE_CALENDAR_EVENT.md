---
name: calendar_event
description: Gestion des événements d'une date depuis le calendrier — toucher une case ouvre une popup qui liste les événements du jour triés par heure (ceux sans heure en bas), et permet d'en ajouter, modifier, supprimer ou déplacer vers une autre date, chacun fait d'un texte, d'heures facultatives et d'une référence facultative vers une note choisie avec NotePicker ; un seul bouton « Enregistrer » persiste le tout et ferme la popup.
status: validé
date: 2026-11-19
---

# Explication du développement à réaliser

Le lot précédent (`CALENDAR/CALENDAR_FEATURE`) a livré le **calendrier en lecture seule** : une
grille mensuelle de 42 dates réelles, la navigation entre les mois, le sélecteur de période,
« Aujourd'hui », et l'affichage des événements de chaque jour, triés et tronqués avec un indicateur
`+N autres`. Il a aussi livré la **sélection d'une date**, mais il a volontairement dit qu'elle
« n'ouvre pas de popup et ne déclenche aucune opération d'écriture ». Rien ne permet donc encore de
créer un événement : la table `events` existe dans la base livrée, mais l'application ne sait que la
lire.

Ce lot rend le calendrier **éditable**. Toucher une case du calendrier ouvre une **popup
d'événements** pour la date de cette case. La popup affiche **tous** les événements de la date, même
ceux que la case cachait derrière `+N autres`, ou un **état vide** s'il n'y en a aucun. Depuis cette
popup, l'utilisateur **ajoute**, **modifie** et **supprime** les événements de la date, puis
**enregistre** le tout d'un seul geste.

Un **événement** est fait de :

- une **date**, **obligatoire**. C'est la date civile à laquelle il appartient. Pour un nouvel
  événement, c'est par défaut la date de la case touchée. Elle reste modifiable, ce qui permet de
  **déplacer** l'événement vers un autre jour ;
- une **heure de début** et une **heure de fin**, toutes deux **facultatives**, au format `HH:mm`.
  Une heure de fin demande une heure de début, et la fin doit être strictement après le début. Ce
  sont les règles que la table `events` impose déjà ;
- un **texte**, **obligatoire**, qui décrit l'événement. C'est ce texte qui s'affiche dans la case
  du calendrier ;
- une **référence vers une note** de l'application, **facultative**. Elle reprend exactement le
  principe des cartes kanban (`KANBAN/EDITION_CARTES`) : la note est choisie avec le composant
  `NotePicker` déjà en place, l'événement affiche son **titre**, et toucher cette référence
  **ouvre la note** dans l'éditeur de notes. L'événement porte le *quand*, la note porte le
  *contenu* : « Réunion parents-profs » peut renvoyer à la note qui liste les questions à poser.

Dans la popup, les événements sont **triés par heure** : ceux qui ont une heure de début viennent
d'abord, par heure croissante, et ceux **sans heure** sont **en bas de la liste**. C'est la règle
déjà appliquée dans les cases de la grille (`CALENDAR_FEATURE` §4.6). La case et la popup présentent
donc toujours les événements dans le même ordre.

L'**enregistrement est groupé**, comme pour un tableau kanban. Les gestes faits dans la popup
(ajouter, modifier, supprimer) composent un **état en attente**, et **rien n'est écrit en base**
avant que l'utilisateur touche **« Enregistrer »**. Ce bouton persiste toute la composition, ferme
la popup, et le calendrier affiche aussitôt le nouvel état. Ce choix permet de saisir plusieurs
événements d'une même journée sans attendre une écriture à chaque geste. La contrepartie est qu'une
composition peut être perdue : si l'utilisateur cherche à **quitter la popup** alors que des
changements ne sont pas enregistrés, un **avertissement** le prévient avant que ces changements
soient abandonnés. C'est la même garantie que le bouton « Retour » de l'éditeur de tableau.

Comme pour les cartes, une **note supprimée** depuis l'écran des notes ne doit jamais faire
disparaître un événement : l'événement **reste**, avec sa date, ses heures et son texte, et seule sa
**référence** est vidée.

# Périmètre

**Inclus :**

- **Ouverture de la popup** au toucher de n'importe quelle case de la grille, y compris une case d'un
  mois adjacent. Dans ce cas, le comportement déjà livré est conservé : la date est sélectionnée et
  son mois devient la période affichée. La popup s'ouvre en plus, pour la date réellement touchée.
- **En-tête de la popup** : la date concernée, en clair (par exemple « jeudi 19 novembre 2026 »).
- **Liste des événements** de la date, **tous** affichés (sans troncature `+N autres`), triés par
  heure de début croissante, ceux sans heure en bas, avec un critère secondaire stable. Chaque
  événement affiche son texte, ses heures quand elles sont renseignées, et le titre de sa note quand
  il en référence une.
- **État vide** explicite quand la date n'a aucun événement, avec le geste de création visible.
- **Ajouter** un événement : texte, date (pré-remplie avec la date de la popup), heures de début et
  de fin facultatives, note facultative.
- **Modifier** un événement existant : ses quatre champs et sa note.
- **Déplacer** un événement vers une autre date en modifiant sa date.
- **Lier** un événement sans note à une note via `NotePicker`, ou **retirer** le lien d'un événement
  qui en a une. Il n'y a **pas de remplacement direct** : pour changer de note, l'utilisateur retire
  la note liée, puis en lie une autre.
- **Ouvrir la note référencée** dans l'éditeur de notes, avec l'avertissement si des changements
  sont en attente.
- **Supprimer** un événement, après confirmation par la popup `ConfirmDialog` déjà utilisée ailleurs.
- **Validation** du texte (non vide) et des heures (format, fin ⇒ début, fin > début). Un événement
  invalide **bloque l'enregistrement** et le problème est signalé sur l'événement concerné.
- **Enregistrement groupé** par un bouton « Enregistrer » : il persiste les ajouts, modifications et
  suppressions de la popup, ferme la popup, et met à jour la grille sans recharger la page.
- **Avertissement à la sortie** quand des changements ne sont pas enregistrés. Il se déclenche à la
  fermeture de la popup et avant l'ouverture d'une note.
- **Échec d'enregistrement** : la popup reste ouverte, la composition est conservée, un message
  explicite est affiché, et l'utilisateur peut réessayer.
- **Modèle de données** : la référence facultative vers une note est ajoutée aux événements par un
  **fichier `.sql` de migration** dans `frontend/public/assets/migrations/`, joué au démarrage par
  `SchemaMigrationService`. La suppression de la note référencée vide la référence et garde
  l'événement.
- **Écriture des événements** dans la couche de données (création, mise à jour, suppression), écrite
  en TDD comme le reste de la couche.

**Hors périmètre (lots ultérieurs) :**

- **Événements multi-jours** et **événements récurrents** : un événement appartient à une seule date
  civile.
- **Plusieurs notes** pour un même événement : la référence est unique et facultative.
- **Création d'une note depuis un événement** : la note doit déjà exister pour être référencée.
- **Aperçu du contenu** de la note dans la popup : toucher la référence ouvre la note.
- **Texte riche** sur un événement : c'est du texte simple.
- **Autres propriétés** d'un événement : couleur, catégorie, lieu, participants, rappel, pièce
  jointe.
- **Notifications et rappels**.
- **Annuler / rétablir** dans la popup.
- **Enregistrement automatique** à chaque geste : l'enregistrement reste explicite.
- **Duplication** d'un événement.
- **Glisser-déposer** d'un événement d'une case à une autre : le déplacement passe par le champ
  date.
- **Bouton « retour » matériel d'Android** : il n'est pas intercepté, donc la composition peut être
  perdue par ce geste. C'est le même trou connu que pour l'éditeur de tableau.
- **Partage et synchronisation** multi-membres (P2P, relais).

# User Stories

**US1 : Ouvrir la popup d'une date depuis le calendrier**
- **En tant qu'** utilisateur de Family Notes,
- **je veux** toucher une case du calendrier pour ouvrir les événements de cette date,
- **afin de** gérer ma journée sans quitter le calendrier.
- **Critères d'acceptation :**
    - Toucher une case ouvre une popup associée à la **date de cette case**.
    - Toucher une case d'un **mois adjacent** ouvre la popup de cette date. La sélection et le
      changement de période déjà livrés sont conservés.
    - La date touchée reste **sélectionnée** dans la grille (classe `.selected`) pendant que la
      popup est ouverte.
    - L'**en-tête** de la popup indique la date en clair, sans décalage de jour dû à un fuseau
      horaire.
    - Une date **sans événement** ouvre la popup avec un **état vide** explicite et le geste de
      création d'un événement.
    - Une date **avec des événements** les affiche **tous**, y compris ceux que la case masquait
      derrière `+N autres`.
    - La popup porte un geste de **fermeture** explicite. Sans changement en attente, la fermeture
      est immédiate et ne demande rien.

**US2 : Voir les événements d'une date dans l'ordre**
- **En tant qu'** utilisateur,
- **je veux** voir les événements de la date triés par heure,
- **afin de** lire ma journée dans l'ordre chronologique.
- **Critères d'acceptation :**
    - Chaque événement affiche son **texte**.
    - Un événement avec une heure de début affiche cette heure. S'il a aussi une heure de fin, il
      affiche la plage (par exemple `09:00 – 10:30`).
    - Un événement **sans heure** n'affiche aucune heure, ni emplacement vide.
    - Un événement qui **référence une note** affiche le **titre** de cette note, distinct de son
      propre texte. Un événement sans note n'affiche rien de plus.
    - Les événements **avec heure** sont listés d'abord, par heure de début **croissante**.
    - Les événements **sans heure** sont listés **en bas**, après tous les événements avec heure.
    - À heure égale, ou entre événements sans heure, un **critère secondaire stable** garantit un
      ordre déterministe.
    - L'ordre de la popup est **le même** que celui de la case du calendrier.

**US3 : Ajouter un événement**
- **En tant qu'** utilisateur,
- **je veux** ajouter un événement à la date, avec un texte, des heures facultatives et une note
  facultative,
- **afin de** noter une activité dans mon planning.
- **Critères d'acceptation :**
    - Un geste **« Ajouter un événement »** est toujours visible dans la popup, liste vide ou non.
    - La **date** du nouvel événement est pré-remplie avec la date de la popup.
    - Le **texte** est saisi par l'utilisateur. Les espaces de début et de fin sont retirés, et les
      espaces intérieurs sont conservés.
    - Les **heures** de début et de fin sont facultatives, au format `HH:mm`.
    - La **note** est facultative et se choisit dans le même geste (`US5`).
    - Plusieurs événements peuvent être ajoutés **à la suite** avant d'enregistrer.
    - Deux événements de la même date peuvent porter le **même texte** et référencer la **même
      note**.
    - L'ajout **n'écrit rien en base** : il crée un changement en attente (`US8`, `US9`).
    - Renoncer à la saisie d'un nouvel événement **ne crée aucun événement**.

**US4 : Modifier un événement, ou le déplacer vers une autre date**
- **En tant qu'** utilisateur,
- **je veux** corriger le texte, les heures ou la date d'un événement existant,
- **afin d'** ajuster mon planning sans supprimer puis recréer l'événement.
- **Critères d'acceptation :**
    - Toucher un événement de la liste ouvre sa saisie, qui part de ses **valeurs actuelles**.
    - Valider remplace les valeurs de **cet** événement, et de lui seul.
    - Les règles de saisie sont les mêmes qu'à la création (`US3`, `US7`).
    - Après une modification d'heure, l'événement prend sa **place triée** dans la liste (`US2`).
    - **Changer la date** déplace l'événement : après enregistrement, il n'apparaît plus dans la case
      de son ancienne date et apparaît dans celle de sa nouvelle date, si celle-ci est visible dans
      la grille.
    - La modification **n'écrit rien en base** avant l'enregistrement.

**US5 : Lier un événement à une note, ou défaire ce lien**
- **En tant qu'** utilisateur,
- **je veux** rattacher un événement à une note existante, ou la détacher,
- **afin de** relier mon planning au contenu de mes notes.
- **Critères d'acceptation :**
    - Le choix de la note passe par le composant **`NotePicker`**, comme pour les cartes kanban : les
      notes y sont désignées par leur **titre**, filtrables, avec un état vide quand l'application
      n'en contient aucune.
    - Le geste « **Lier une note** » n'est offert que sur un événement **sans note**. Choisir une note
      la lie à **cet** événement, qui affiche aussitôt son titre.
    - Un événement **avec une note** n'offre **aucun** geste pour en choisir une autre : il offre
      « **Retirer la note** », qui retire la référence. L'événement garde ses autres valeurs et
      redevient un événement sans note, qui offre de nouveau « Lier une note ».
    - Choisir « Aucune note » dans le picker laisse l'événement **sans note**.
    - **Renoncer** au picker laisse la référence **inchangée**.
    - Un événement **sans note** est valide.
    - Lier ou délier **n'écrit rien en base** avant l'enregistrement.
    - Après enregistrement puis réouverture de la popup, la note liée est toujours affichée.

**US6 : Ouvrir la note liée à un événement**
- **En tant qu'** utilisateur,
- **je veux** ouvrir d'un geste la note d'un événement,
- **afin de** passer du planning au contenu sans traverser l'application.
- **Critères d'acceptation :**
    - Sur un événement qui référence une note, un geste **distinct** de celui qui modifie
      l'événement ouvre cette note dans l'**éditeur de notes**.
    - La note ouverte est bien **celle que l'événement référence**.
    - S'il y a des **changements en attente** dans la popup, ce geste affiche d'abord
      l'**avertissement** (`US9`). Confirmer abandonne les changements et ouvre la note. Renoncer
      laisse la popup ouverte, sans perdre la composition.

**US7 : Être empêché d'enregistrer un événement invalide**
- **En tant qu'** utilisateur,
- **je veux** qu'un événement incomplet ou incohérent soit signalé au lieu d'être enregistré,
- **afin de** ne jamais retrouver dans mon calendrier un événement faux.
- **Critères d'acceptation :**
    - Un **texte vide** ou composé uniquement d'espaces rend l'événement invalide.
    - Une **date** absente ou invalide rend l'événement invalide.
    - Aucune heure : l'événement est **valide**.
    - Une heure de début sans heure de fin : l'événement est **valide**.
    - Une heure de **fin sans heure de début** : l'événement est **invalide**.
    - Deux heures renseignées : la fin doit être **strictement postérieure** au début, sinon
      l'événement est invalide.
    - Une heure hors du format `HH:mm` (00:00 à 23:59) rend l'événement invalide.
    - Tant qu'un événement de la popup est invalide, **« Enregistrer » n'écrit rien** : le problème
      est signalé **sur l'événement concerné**, avec un message compréhensible, et la popup reste
      ouverte.

**US8 : Supprimer un événement**
- **En tant qu'** utilisateur,
- **je veux** supprimer un événement de la date,
- **afin de** retirer de mon planning ce qui n'a plus lieu.
- **Critères d'acceptation :**
    - Chaque événement offre un geste de **suppression**.
    - La suppression demande une **confirmation** par `ConfirmDialog`, qui nomme l'événement par son
      texte. Renoncer ne change rien.
    - Une fois confirmée, l'événement **disparaît de la liste** de la popup. Comme les autres gestes,
      la suppression est un changement en attente, persisté par « Enregistrer ».
    - Supprimer un événement ne supprime **jamais** la note qu'il référence.
    - Après enregistrement, une date qui a perdu son dernier événement redevient une case normale,
      sans indicateur d'événement.

**US9 : Enregistrer la popup, ou être averti avant de perdre ses changements**
- **En tant qu'** utilisateur,
- **je veux** enregistrer d'un seul geste tout ce que j'ai fait dans la popup, et être prévenu si je
  m'apprête à le perdre,
- **afin de** saisir ma journée en confiance.
- **Critères d'acceptation :**
    - La popup porte un bouton **« Enregistrer »**.
    - « Enregistrer » persiste **tous** les ajouts, modifications, déplacements, liens et suppressions
      de la popup, puis **ferme la popup**.
    - Après un enregistrement réussi, la **grille du calendrier** reflète aussitôt le nouvel état, sans
      recharger la page, y compris pour un événement déplacé vers une autre date visible.
    - Si l'enregistrement **échoue**, la popup **reste ouverte**, la composition est **conservée**, un
      message explicite est affiché, et l'interface ne prétend pas que l'opération a réussi.
      L'utilisateur peut **réessayer**.
    - Un échec n'enregistre **pas à moitié** la composition : après un échec, la base contient soit
      tout l'état précédent, soit tout le nouvel état.
    - Fermer la popup **avec des changements en attente** affiche un **avertissement**. Confirmer
      ferme la popup et **abandonne** ces changements. Renoncer laisse la popup ouverte avec la
      composition intacte.
    - Fermer la popup **sans changement en attente** ne demande rien.
    - Réouvrir la popup d'une date après un abandon montre l'état **enregistré**, sans trace des
      changements abandonnés.

**US10 : Conserver les événements quand leur note est supprimée**
- **En tant qu'** utilisateur,
- **je veux** que supprimer une note ne supprime pas les événements qui la référencent,
- **afin de** ne jamais perdre mon planning par effet de bord.
- **Critères d'acceptation :**
    - Supprimer une note depuis l'écran des notes **garde** tous les événements qui la référencent,
      avec leur date, leurs heures et leur texte.
    - Ces événements deviennent des événements **sans note** : ils n'affichent plus de titre de note
      et n'offrent plus le geste d'ouverture.
    - Les événements existants avant ce lot, qui n'ont aucune note, restent lisibles et modifiables.

# Décisions retenues

Les hypothèses H-EV1 → H-EV7 ont été acceptées par l'utilisateur le 2026-11-19 et deviennent les
décisions D-EV1 → D-EV7.


- **D-EV1 — Popup modale.** La popup couvre le calendrier et la barre de navigation. On ne quitte
  donc la popup que par sa fermeture, par « Enregistrer » ou par l'ouverture d'une note. L'onglet de
  la barre n'a pas besoin de garde.
- **D-EV2 — Suppression en attente.** Une suppression confirmée n'est écrite en base qu'à
  l'enregistrement, comme les autres gestes, et compte comme un changement en attente pour
  l'avertissement de sortie. C'est le parti du kanban.
- **D-EV3 — Événement déplacé avant enregistrement.** Un événement dont on vient de changer la date
  **reste visible** dans la liste de la popup jusqu'à l'enregistrement, avec sa nouvelle date
  affichée, pour que l'utilisateur voie ce qu'il va enregistrer. Il ne quitte la liste qu'après
  enregistrement.
- **D-EV4 — Ordre d'un événement en cours de saisie.** Le tri s'applique aux événements validés.
  Le nouvel événement en cours de saisie n'est pas trié avant que sa saisie soit validée.
- **D-EV5 — Une seule note.** Un événement référence **au plus une** note. Le modèle actuel
  `noteIds: string[]` est à réconcilier avec cette règle dans l'approche.
- **D-EV6 — Longueur du texte.** Pas de longueur maximale dans ce lot. Un texte long est tronqué
  visuellement dans la case (règle déjà livrée) et affiché en entier dans la popup.
- **D-EV7 — Événements de la base livrée.** Les événements déjà présents dans la base livrée
  (`evt-1`…) sont traités comme les autres : modifiables et supprimables.
- **D-EV27 — Pas de changement direct de note.** Décidé par l'utilisateur le 2026-11-19 : un
  événement lié n'offre pas « Changer de note ». Pour changer, on retire la note puis on en lie une
  autre.
