# Feature — Module Calendrier (vue mensuelle + gestion des événements)

**Date :** 2026-11-15  
**Statut :** brouillon — à valider  
**Écrans concernés :** calendrier (`/calendar/:selectedMonthDate`), popup d'événements du jour

---

## Explication du développement à réaliser

Family Notes propose aujourd'hui deux univers de contenu — **notes** et **kanbans** — reliés par une barre de navigation commune. Le **calendrier** est le troisième univers, prévu dans le plan global (`PLAN_GLOBAL.md` §2.B), mais il n'est pas encore livrable : l'onglet « Calendrier » de la barre est présent mais désactivé, et le composant `Calendar` ne permet aujourd'hui que d'afficher, case par case, les **titres** des événements d'un mois — sans données persistées ni moyen de saisir ou modifier un événement.

Ce lot livre le calendrier dans sa forme attendue : une **vue mensuelle**, inspirée d'un calendrier classique (lundi–dimanche), qui donne une visibilité mensuelle sur les événements. Chaque case liste les événements du jour ; si un jour en regroupe trop pour tenir dans la case, la liste est tronquée avec un indicateur du nombre restant.

Le calendrier reste une **vue de consultation** : on y voit ses activités, on clique sur une case pour gérer les événements de cette date, puis on revient au mois. La saisie et la modification d'un événement se font dans une **popup** ouverte depuis le clic sur une case. Cette popup liste les événements existants du jour avec leurs détails — **texte**, **date**, **heure de début** et **heure de fin** (toutes deux facultatives sous réserve des règles de cohérence ci-dessous) — et permet éventuellement de lier l'événement à une note de l'application. Depuis cette même popup, l'utilisateur peut **ajouter**, **modifier** ou **supprimer** un événement directement, sans quitter le calendrier.

La navigation se fait **mois à mois** avec des flèches précédent/suivant, et on garde la possibilité de se rendre directement à une période : un **sélecteur de mois dans l'en-tête** permet de choisir un mois avec son année.

La grille conserve la structure existante de 6 semaines × 7 jours, les en-têtes `L M M J V S D`, les flèches de navigation et le thème « Mes Notes ». Ce lot enrichit cette structure existante ; il ne la remplace pas.

---

## Périmètre

### Inclus dans ce lot

- **Vue au mois :** grille 6 semaines × 7 jours, alignée lundi–dimanche (en-têtes `L M M J V S D`), avec débordement classique des mois adjacents et cases vides distinguées visuellement.
- **Navigation mensuelle :** boutons précédent et suivant, avec gestion correcte des changements d'année.
- **Sélection directe d'une période :** sélecteur permettant d'atteindre un mois et son année.
- **Rendu d'un jour :** liste des titres des événements du jour ; troncature si trop nombreux, avec indicateur du nombre restant.
- **Mise en évidence :** distinction visuelle du jour courant et des jours appartenant au mois affiché.
- **Affichage de l'heure :** l'heure de début d'un événement s'affiche dans sa case si elle est renseignée.
- **Clic sur une date :** toute case correspondant à une date réelle est cliquable, y compris les jours visibles du mois précédent ou suivant. La popup ouverte correspond à la date réellement cliquée. Les cases vides de la grille ne sont pas cliquables.
- **Popup d'événements :** liste des événements de la date sélectionnée avec texte, date et heures ; ajout, modification et suppression depuis cette popup.
- **Fermeture de la popup :** bouton de fermeture explicite. Si l'utilisateur ferme la popup alors qu'une saisie ou une modification n'a pas été enregistrisée, les changements non enregistrés sont abandonnés.
- **Lien à une note :** un événement peut être lié à une note existante de l'application, selon la cardinalité qui sera confirmée dans les décisions ouvertes.
- **Choix du mois par défaut :** le composant se positionne sur le mois indiqué dans l'URL si celle-ci contient une date valide, sinon sur le mois courant.
- **Synchronisation URL :** le mois affiché est reflété dans l'URL (`/calendar/YYYY-MM`) et l'ouverture d'une URL de mois affiche le mois correspondant.
- **Données :** persistance locale des événements dans SQLite, avec migration et opérations de lecture/écriture adaptées au modèle du projet.

### Hors périmètre (lots ultérieurs)

- **Synchronisation multi-membres** des événements (partage familial via P2P/relais) : ce lot se limite au stockage local SQLite.
- **Notifications et rappels** d'événements.
- **Partage d'un événement** avec un membre de la famille au-delà du stockage local.
- **Navigation par paliers d'années** dédiée, au-delà du mécanisme permettant de choisir directement un mois et son année.
- **Rendu chronologique avancé** (événements empilés ou positionnés proportionnellement à leur heure) : un affichage simple par ordre reste suffisant pour ce lot.
- **Événements récurrents** et événements s'étendant sur plusieurs jours, sous réserve de confirmation du choix de périmètre indiqué dans les décisions ouvertes.

---

## User Stories

### US1 — Voir un mois au complet, avec ses événements par jour

**En tant qu'** utilisateur de Family Notes,  
**je veux** voir un calendrier au format mois (lundi–dimanche) avec, dans chaque case, la liste des événements du jour,  
**afin d'** avoir une visibilité mensuelle sur mes activités sans ouvrir chaque jour.

**Critères d'acceptation :**

- La grille affiche 6 semaines × 7 jours, alignée lundi–dimanche (en-têtes `L M M J V S D`).
- Les cases correspondant à des dates réelles des mois précédent et suivant sont affichées comme débordement et distinguées visuellement des jours du mois affiché.
- Les cases vides éventuelles de la grille sont distinguées visuellement et ne représentent pas une date.
- Chaque case correspondant à une date réelle liste les titres des événements de cette date.
- Les jours des mois adjacents restent cliquables ; cliquer sur l'un d'eux ouvre la popup de cette date.
- Le nombre de jours par mois est correct, y compris février en année bissextile (28 ou 29 jours).
- La navigation précédent/suivant change correctement le mois affiché.
- Passer de décembre à janvier, ou inversement, ne casse pas l'affichage ni le calcul de l'année.
- Les événements sont présentés dans un ordre cohérent et identique dans la case et dans la popup ; la règle de tri est précisée dans les décisions ouvertes.

### US2 — Naviguer entre les mois

**En tant qu'** utilisateur,  
**je veux** me déplacer d'un mois à l'autre avec des flèches,  
**afin d'** explorer mon planning au-delà du mois affiché.

**Critères d'acceptation :**

- Les boutons précédent et suivant changent le mois affiché et mettent à jour la grille.
- La navigation traverse correctement les changements d'année.
- Le mois affiché reste synchronisé avec l'URL (`/calendar/YYYY-MM`) : changer de mois met à jour l'URL, et ouvrir une URL de mois valide affiche le bon mois.
- Une URL contenant un mois invalide ou inexploitable conduit à l'affichage du mois courant, sans erreur bloquante.

### US3 — Atteindre directement un mois et son année

**En tant qu'** utilisateur,  
**je veux** sélectionner un mois précis dans l'en-tête,  
**afin de** me rendre directement à la période qui m'intéresse sans cliquer mois par mois.

**Critères d'acceptation :**

- Un sélecteur dans l'en-tête permet de choisir un mois et une année.
- La sélection provoque l'affichage immédiat du mois choisi.
- L'URL est mise à jour pour refléter le nouveau mois (`/calendar/YYYY-MM`).
- Le mois courant (mois correspondant à la date du jour) peut être distingué visuellement dans le sélecteur ou dans l'interface.
- La sélection du mois déjà affiché ne provoque pas de rechargement ni de changement visuel inutile.
- La plage d'années proposée par le sélecteur reste à préciser.

### US4 — Repérer le jour d'aujourd'hui

**En tant qu'** utilisateur,  
**je veux** identifier rapidement le jour actuel sur le calendrier,  
**afin de** me situer dans le mois sans compter les cases.

**Critères d'acceptation :**

- Le jour courant est mis en évidence sur la case correspondant à la date du jour.
- La mise en évidence du jour courant ne doit pas être confondue avec une éventuelle sélection de date.
- Si aujourd'hui n'appartient pas au mois affiché, aucun autre jour ne reçoit la mise en évidence du jour courant.

### US5 — Consulter et ajouter un événement depuis une case

**En tant qu'** utilisateur,  
**je veux** cliquer sur une case pour ouvrir les détails des événements de cette date et y ajouter un nouvel événement,  
**afin de** gérer mon planning directement depuis le calendrier.

**Critères d'acceptation :**

- Cliquer sur une case correspondant à une date réelle ouvre une popup associée à cette date, y compris si cette date appartient au mois précédent ou suivant affiché dans la grille.
- La popup liste les événements existants de cette date avec leur texte, leur date et leurs heures de début/fin si elles sont renseignées.
- Si la date ne contient aucun événement, la popup propose directement un moyen de créer le premier événement.
- La popup comporte un bouton de fermeture explicite.
- Fermer la popup sans avoir enregistré les changements abandonne les saisies ou modifications en cours.
- La popup permet d'ajouter un événement avec un texte obligatoire, une date et des heures de début/fin facultatives au format `HH:mm`.
- Le texte ne peut pas être vide ou composé uniquement d'espaces.
- Les règles de cohérence des horaires sont appliquées :
  - si aucune heure n'est renseignée, l'événement est valide ;
  - si une heure de début est renseignée sans heure de fin, l'événement est valide ;
  - si une heure de fin est renseignée, une heure de début est obligatoire ;
  - lorsque les deux heures sont renseignées, l'heure de fin doit être strictement postérieure à l'heure de début ;
  - les heures doivent respecter le format `HH:mm`.
- Un événement appartient à une date civile ; les règles concernant les événements multi-jours restent à confirmer.
- Le nombre d'événements affichés dans une case est limité ; un indicateur « +N autres » signale les événements non affichés.
- L'ajout est persisté et le calendrier reflète immédiatement le nouvel événement, sans rechargement complet de la page.
- En cas d'échec de sauvegarde, un message explicite est présenté à l'utilisateur, la saisie est conservée et l'événement n'est pas affiché comme sauvegardé.
- Après correction ou nouvelle tentative, l'utilisateur peut relancer l'enregistrement.

### US6 — Modifier et supprimer un événement depuis la popup

**En tant qu'** utilisateur,  
**je veux** modifier ou supprimer un événement directement depuis la popup,  
**afin de** corriger mon planning sans quitter le calendrier.

**Critères d'acceptation :**

- Chaque événement listé est identifiable individuellement.
- La modification met à jour le texte, la date et les heures ; elle se fait dans un mode édition de la popup.
- Les mêmes règles de validation du texte et des horaires que lors de la création sont appliquées.
- Si la date d'un événement est modifiée, l'événement est déplacé vers cette nouvelle date et n'apparaît plus dans la liste de son ancienne date.
- La suppression demande une confirmation avant d'être exécutée.
- La suppression retire définitivement l'événement de la base et de l'affichage.
- Supprimer un événement ne supprime jamais la note éventuellement associée.
- Après modification ou suppression, le calendrier reflète immédiatement le nouvel état.
- En cas d'échec de modification ou de suppression, un message explicite est affiché et l'interface ne prétend pas que l'opération a réussi.

### US7 — Lier un événement à une note existante

**En tant qu'** utilisateur,  
**je veux** associer un événement à une note de l'application,  
**afin de** relier mon planning à mes notes.

**Critères d'acceptation :**

- La popup propose un sélecteur de notes existantes ainsi qu'une option « Aucune ».
- Le lien choisi est enregistré avec l'événement et reste présent après sauvegarde puis rechargement.
- L'absence de note sélectionnée est valide : un événement peut exister sans lien.
- La liste du sélecteur reflète les notes réellement présentes ; elle est vide, hormis l'option « Aucune », si aucune note n'existe.
- La suppression d'une note liée ne doit pas entraîner la suppression de l'événement ; le comportement exact du lien résiduel doit être défini selon le modèle de données retenu.
- Le nombre de notes pouvant être associées à un même événement reste à confirmer.

### US8 — Afficher l'heure d'un événement dans le calendrier

**En tant qu'** utilisateur,  
**je veux** voir l'heure d'un événement dans sa case,  
**afin de** situer chronologiquement mon activité.

**Critères d'acceptation :**

- L'heure de début, si elle est renseignée, s'affiche à côté du titre dans la case.
- Un événement sans heure de début n'affiche pas d'heure.
- L'heure affichée est cohérente avec la valeur saisie (`HH:mm`) après sauvegarde et rechargement.
- La troncature et l'indicateur « +N autres » restent lisibles lorsque les événements comportent une heure.
- L'ordre d'affichage dans la case est le même que dans la popup.

---

## Règles transverses et cas particuliers

- **Dates civiles :** la date d'un événement représente un jour du calendrier. Son affichage ne doit pas être décalé d'un jour par une conversion de fuseau horaire ou UTC.
- **Date sans événement :** une case correspondant à une date réelle reste cliquable même si aucun événement n'y est associé.
- **Date avec plusieurs événements :** la popup permet de consulter l'ensemble des événements de la date, même si la case mensuelle n'en affiche qu'une partie.
- **Dernier événement supprimé :** après suppression du dernier événement d'une date, la case reste présente comme jour normal, mais ne contient plus d'événement.
- **Échec de persistance :** aucune opération qui a échoué ne doit être présentée comme réussie ; le message d'erreur ne doit pas faire perdre les données saisies.
- **Fermeture de popup :** la fermeture par le bouton dédié abandonne toute modification non enregistrée.

---

## Décisions ouvertes / hypothèses à confirmer

Les points suivants ne sont pas considérés comme définitivement décidés dans cette version.

- **H1 — Choix du mois par défaut.** Le composant se positionne sur le mois de l'URL si celle-ci contient un mois valide (`/calendar/YYYY-MM`), sinon sur le mois courant. Aucune mémorisation supplémentaire n'est prévue.
- **H2 — Sélecteur de mois et d'année.** Le sélecteur doit permettre de choisir une période complète (mois + année). La plage d'années proposée et la forme exacte du contrôle restent à préciser.
- **H3 — Lien à une note.** Le lien est réalisé via un sélecteur des notes existantes (+ option « Aucune »), plutôt qu'un champ de saisie libre.
- **H4 — Nombre de notes associées.** À confirmer : un événement peut-il être lié à une seule note ou à plusieurs notes ? Le modèle actuellement évoqué comporte un champ `noteIds` au pluriel, tandis que le besoin fonctionnel est formulé au singulier.
- **H5 — Événements multi-jours.** À confirmer : un événement est-il toujours rattaché à une seule date, ou doit-il pouvoir s'étendre sur plusieurs jours ? La présente version décrit principalement des événements rattachés à une date.
- **H6 — Tri des événements.** Proposition : événements avec heure de début d'abord, triés par heure croissante ; événements sans heure ensuite ; utiliser un critère secondaire stable pour départager les événements ayant la même heure. Le même ordre doit être appliqué dans les cases et dans la popup.
- **H7 — Seuil de troncature.** Proposition : afficher environ 3 événements dans une case, puis un indicateur « +N autres ». Le seuil exact dépendra de la place disponible et reste à confirmer. Cliquer sur la case ou sur l'indicateur ouvre la popup de la date.
- **H8 — Bouton « Aujourd'hui ».** À confirmer : souhaite-t-on un bouton permettant de revenir directement au mois courant après une navigation vers un autre mois ?
- **H9 — Longueur du texte.** Le texte est obligatoire et ne peut pas être vide ou composé uniquement d'espaces. Une longueur maximale reste à définir.
- **H10 — Suppression d'une note liée.** Proposition : la suppression de la note ne supprime pas l'événement ; le lien est retiré ou devient nul proprement. Le comportement précis dépendra du modèle de données.
- **H11 — Périmètre des données.** Stockage local SQLite uniquement pour ce lot ; la synchronisation multi-membres est reportée.

---

## Points d'attention pour la réalisation

- Le calendrier doit rester cohérent avec les conventions et services déjà utilisés dans Family Notes.
- La persistance des événements doit être intégrée au mécanisme de migrations SQLite du projet.
- Les opérations de création, modification et suppression doivent être persistées avant que l'interface ne présente leur résultat comme acquis.
- Les erreurs de persistance doivent être gérées explicitement, sans perte de la saisie en cours.
- Cette spécification décrit le comportement attendu ; elle ne prescrit pas l'organisation interne du code ni le choix détaillé des composants techniques.
