# Feature --- Calendrier : visualisation des mois, navigation et affichage des événements

**Date :** 2026-11-15\
**Statut :** brouillon --- à valider\
**Écran concerné :** calendrier\
**Route de référence proposée :** `/calendar/YYYY-MM`

------------------------------------------------------------------------

## 1. Explication du développement à réaliser

Family Notes propose trois univers de contenu : **notes**, **kanbans**
et **calendrier**.

Ce lot concerne exclusivement la consultation du calendrier : afficher
un mois, naviguer entre les mois, accéder directement à une période et
visualiser les événements qui y sont associés.

Le périmètre comprend quatre fonctionnalités :

1.  **Visualisation mensuelle** --- construire et afficher une grille
    fixe de 6 semaines × 7 jours, alignée du lundi au dimanche.
2.  **Navigation mensuelle** --- passer au mois précédent ou suivant, y
    compris lors d'un changement d'année, avec synchronisation de l'URL.
3.  **Sélection d'une période** --- choisir directement un mois et une
    année depuis l'en-tête du calendrier.
4.  **Visualisation des événements** --- afficher dans chaque journée
    les événements qui lui sont associés, avec un traitement adapté
    lorsque leur nombre ou leur titre dépasse l'espace disponible.

Tout ce qui implique de **créer**, **modifier** ou **supprimer** un
événement est hors périmètre. Ce lot ne définit ni popup d'édition, ni
service d'écriture, ni liaison entre un événement et une note.

La grille conserve la structure existante du composant `Calendar` : 6
semaines × 7 jours, en-têtes `L M M J V S D`, flèches de navigation et
thème « Mes Notes ». Le travail complète le comportement et le rendu
existants sans imposer une réorganisation interne du code.

Les classes CSS existantes `.other-month`, `.today` et `.selected` sont
à réutiliser si elles correspondent aux comportements décrits
ci-dessous.

------------------------------------------------------------------------

## 2. Notions de date à distinguer

Le calendrier doit distinguer explicitement trois notions :

  -----------------------------------------------------------------------
  Notion                              Définition
  ----------------------------------- -----------------------------------
  **Date du jour**                    Date réelle déterminée par le
                                      système au moment de l'affichage.

  **Période affichée**                Mois et année actuellement
                                      présentés dans la grille.

  **Date sélectionnée**               Jour éventuellement choisi par
                                      l'utilisateur dans la grille.
  -----------------------------------------------------------------------

Ces notions sont indépendantes. Par exemple, l'utilisateur peut
consulter janvier 2025 alors que nous sommes en novembre 2026, et
sélectionner le 12 janvier 2025.

La date du jour reste identifiée même lorsque le mois affiché est
différent. La date sélectionnée ne doit pas être confondue avec la date
du jour.

La sélection d'une date ne déclenche pas, dans ce lot, l'ouverture d'une
popup ni une action de gestion d'événement.

------------------------------------------------------------------------

## 3. Périmètre

### 3.1 Inclus dans ce lot

-   **Vue mensuelle :** grille fixe de 6 semaines × 7 jours, alignée
    lundi--dimanche, avec les en-têtes `L M M J V S D`.
-   **Calcul des dates :** nombre de jours correct pour chaque mois, y
    compris février en année bissextile.
-   **Positionnement :** premier jour du mois placé dans la bonne
    colonne.
-   **Mois adjacents :** les cases nécessaires au début et à la fin de
    la grille affichent les dates réelles du mois précédent ou suivant.
-   **Grille complète :** les 42 cases représentent toujours une date
    réelle. Il n'y a pas de case vide ou fictive.
-   **Distinction visuelle :** les dates appartenant aux mois adjacents
    sont visuellement atténuées, notamment au moyen de la classe
    `.other-month`.
-   **Date du jour :** la date réelle du jour est visuellement
    identifiable, notamment au moyen de la classe `.today`.
-   **Date sélectionnée :** lorsqu'une date est sélectionnée, elle est
    visuellement identifiable, notamment au moyen de la classe
    `.selected`.
-   **Sélection des dates adjacentes :** les dates des mois adjacents
    sont de véritables dates interactives. Leur sélection sélectionne
    cette date et fait de son mois la période affichée.
-   **Navigation mensuelle :** boutons précédent/suivant, avec traversée
    correcte des changements d'année.
-   **Retour à aujourd'hui :** une action permet de revenir rapidement
    au mois contenant la date du jour.
-   **Synchronisation URL :** la période affichée est reflétée dans
    l'URL au format `/calendar/YYYY-MM`.
-   **Sélecteur de période :** un contrôleur dans l'en-tête permet de
    choisir un mois et une année.
-   **Affichage des événements :** les événements sont affichés dans la
    case correspondant à leur date civile, y compris dans les cases des
    mois adjacents.
-   **Ordre des événements :** les événements d'une journée sont
    affichés dans un ordre déterministe défini dans cette spécification.
-   **Troncature :** les titres trop longs et les listes trop nombreuses
    sont tronqués sans déborder des cases ; un indicateur `+N autres`
    signale les événements non affichés.
-   **États de chargement :** l'affichage distingue le chargement, la
    disponibilité et l'échec de récupération des événements.
-   **Lecture seule :** aucune création, modification ou suppression
    d'événement n'est possible dans ce lot.

### 3.2 Hors périmètre (lots ultérieurs)

-   **Gestion des événements :** création, modification et suppression,
    notamment depuis une popup.
-   **Liaison à une note :** association ou dissociation d'un événement
    avec une note.
-   **Synchronisation multi-membres :** partage familial des événements
    via P2P/relais.
-   **Notifications et rappels** d'événements.
-   **Événements récurrents** ou s'étendant sur plusieurs jours : dans
    ce lot, un événement est rattaché à une date civile unique.
-   **Rendu chronologique avancé :** positionnement proportionnel à
    l'heure ou représentation sous forme de planning horaire.
-   **Consultation détaillée d'une journée ou d'un événement :** aucune
    popup ou vue détaillée n'est imposée par cette feature.

------------------------------------------------------------------------

## 4. Règles fonctionnelles détaillées

### 4.1 Construction de la grille mensuelle

-   La grille contient toujours 42 cases, soit 6 semaines de 7 jours.
-   La semaine commence le lundi et se termine le dimanche.
-   Chaque case représente une date civile réelle.
-   Les jours du mois précédent et du mois suivant complètent la grille
    lorsque nécessaire.
-   Il n'existe pas de case vide : les 42 cases sont remplies par des
    dates du mois affiché ou des mois adjacents.
-   Le nombre de jours de chaque mois doit être exact.
-   Les années bissextiles doivent être prises en charge.
-   Les dates des mois adjacents sont visuellement différenciées, mais
    restent fonctionnelles.

### 4.2 Sélection d'une date

-   L'utilisateur peut sélectionner une date représentée dans la grille.
-   La date sélectionnée est visuellement identifiable.
-   Une seule date est sélectionnée à la fois.
-   La date du jour et la date sélectionnée peuvent être identiques ; le
    rendu doit alors permettre de comprendre les deux états sans
    ambiguïté.
-   La sélection d'une date appartenant au mois adjacent met à jour la
    période affichée sur le mois de cette date.
-   La sélection ne déclenche aucune création, modification ou
    suppression d'événement.
-   Aucune popup ni vue détaillée n'est ouverte dans le cadre de ce lot.

### 4.3 Navigation entre les mois

-   Le bouton précédent affiche le mois immédiatement antérieur à la
    période affichée.
-   Le bouton suivant affiche le mois immédiatement postérieur à la
    période affichée.
-   Le passage de janvier à décembre et de décembre à janvier met à jour
    l'année correctement.
-   Chaque changement de période actualise la grille et les événements
    correspondants.
-   La navigation ne modifie aucune donnée d'événement.

### 4.4 Sélecteur de mois et d'année

-   Le sélecteur permet de choisir directement un mois et une année.
-   Les 12 mois sont accessibles dans l'ordre chronologique.
-   La période actuellement affichée est clairement indiquée.
-   La sélection d'une nouvelle période actualise immédiatement la
    grille et les événements.
-   La sélection de la période déjà affichée ne provoque pas de
    changement inutile.
-   Un contrôle « Aujourd'hui » permet de revenir au mois contenant la
    date du jour.
-   Les contrôles sont accessibles au clavier et possèdent des libellés
    accessibles explicites.

La plage d'années proposée par le sélecteur doit être cohérente avec les
conventions de l'application ; elle ne doit pas être arbitrairement
limitée par cette feature.

### 4.5 Synchronisation avec l'URL et historique du navigateur

La route de référence est `/calendar/YYYY-MM`, où `YYYY` représente
l'année sur quatre chiffres et `MM` le mois sur deux chiffres (`01` à
`12`).

-   À l'ouverture d'une URL valide, le calendrier affiche le mois
    indiqué.
-   Si la route ne contient pas de période valide ou si le mois est
    invalide, le calendrier affiche le mois courant sans erreur
    bloquante.
-   Toute navigation vers un autre mois met à jour l'URL.
-   Le sélecteur de période met également l'URL à jour.
-   Le retour à aujourd'hui met l'URL à jour.
-   La navigation mensuelle et la sélection explicite d'une période
    créent une entrée d'historique navigateur afin que les boutons
    précédent/suivant du navigateur restaurent les périodes consultées.
-   L'initialisation de la page ne doit pas ajouter inutilement une
    entrée d'historique.
-   Un changement d'URL déclenché par l'historique du navigateur doit
    restaurer la période correspondante sans créer une nouvelle entrée
    d'historique.

Le format de route doit être harmonisé avec la convention de routage
existante. Si l'application utilise actuellement
`/calendar/:selectedMonthDate`, cette convention doit être examinée et
remplacée ou adaptée de façon cohérente ; les deux formats ne doivent
pas coexister de manière ambiguë.

### 4.6 Affichage et tri des événements

-   Chaque case représentant une date affiche les événements associés à
    cette date.
-   Les événements des dates appartenant aux mois adjacents sont
    également affichés.
-   Un événement est associé à une date civile unique dans le périmètre
    de ce lot.
-   Les événements sont triés par heure de début croissante lorsqu'une
    heure est définie.
-   Les événements sans heure sont affichés après les événements ayant
    une heure.
-   En cas d'égalité ou lorsque plusieurs événements n'ont pas d'heure,
    un critère secondaire stable (par exemple l'identifiant de
    l'événement) garantit un ordre déterministe.
-   Le même ordre doit être conservé à chaque affichage des mêmes
    données.
-   Une date sans événement n'affiche aucun indicateur d'événement.
-   Un mois sans événement conserve une grille normale et fonctionnelle
    ; aucun message global encombrant n'est affiché.
-   L'affichage reste strictement en lecture seule.

### 4.7 Troncature et titres longs

-   Le nombre d'événements visibles dépend de l'espace réellement
    disponible dans la case.
-   Les événements qui ne peuvent pas être affichés sont comptabilisés
    dans un indicateur `+N autres`.
-   Le nombre indiqué correspond exactement au nombre d'événements non
    affichés.
-   Un titre long est tronqué visuellement sur une ligne afin de ne pas
    déborder de sa case.
-   La troncature visuelle ne modifie jamais le titre stocké dans les
    données.
-   Aucun titre ni indicateur ne doit déborder sur les cases voisines.
-   Le rendu doit rester lisible lorsque plusieurs événements sont
    associés à la même journée.

### 4.8 Dates civiles et fuseaux horaires

-   L'association d'un événement à une journée repose sur une date
    civile, et non sur une conversion implicite susceptible de décaler
    le jour.
-   L'affichage d'un événement ne doit pas le faire apparaître la veille
    ou le lendemain à cause d'une conversion de fuseau horaire.
-   Les règles de lecture des dates doivent rester cohérentes avec le
    modèle de données et les conventions déjà utilisées dans Family
    Notes.
-   Cette feature ne définit pas une nouvelle stratégie globale de
    stockage des dates ; elle impose que leur interprétation à
    l'affichage respecte la date civile associée à l'événement.

### 4.9 Chargement et erreur de récupération des événements

-   Le calendrier affiche sa grille indépendamment du chargement des
    événements.
-   Pendant la récupération, un état de chargement des événements peut
    être présenté sans bloquer la navigation dans la grille.
-   Lorsque la récupération réussit, les événements sont affichés dans
    les cases correspondantes.
-   Lorsqu'elle échoue, la grille reste consultable et l'échec est
    signalé de manière discrète et compréhensible.
-   Une erreur de récupération des événements ne doit pas empêcher
    l'affichage du mois ni provoquer une erreur bloquante.
-   L'état d'erreur ne doit pas être confondu avec un mois ne contenant
    aucun événement.

------------------------------------------------------------------------

## 5. User Stories

### US1 --- Visualiser un mois complet

**En tant qu'** utilisateur de Family Notes,\
**je veux** voir une grille complète d'un mois, alignée du lundi au
dimanche,\
**afin d'** avoir une vue mensuelle cohérente, y compris aux limites du
mois.

**Critères d'acceptation :**

-   La grille affiche toujours 6 semaines × 7 jours, avec les en-têtes
    `L M M J V S D`.
-   Le nombre de jours par mois est correct, y compris février en année
    bissextile.
-   Le premier jour du mois apparaît dans la bonne colonne.
-   Les dates des mois précédent et suivant complètent les 42 cases.
-   Les dates des mois adjacents sont visuellement différenciées des
    dates du mois affiché.
-   Aucune case n'est vide ou ne représente une date fictive.
-   Les dates adjacentes restent de véritables dates fonctionnelles.
-   La date du jour est visuellement identifiable, même si elle
    appartient à un autre mois que celui affiché.

### US2 --- Naviguer entre le mois précédent et le mois suivant

**En tant qu'** utilisateur,\
**je veux** me déplacer d'un mois à l'autre avec des boutons de
navigation,\
**afin d'** explorer mon planning au-delà du mois affiché.

**Critères d'acceptation :**

-   Les boutons précédent et suivant changent le mois affiché et
    actualisent la grille.
-   La navigation traverse correctement les changements d'année.
-   Chaque changement de période actualise les événements affichés.
-   Le mois affiché reste synchronisé avec l'URL au format
    `/calendar/YYYY-MM`.
-   Les boutons sont accessibles au clavier et possèdent des
    `aria-label` explicites.
-   Le navigateur peut restaurer les périodes précédemment consultées
    avec ses boutons précédent et suivant.
-   Une URL invalide conduit à l'affichage du mois courant, sans erreur
    bloquante.

### US3 --- Atteindre directement un mois et une année

**En tant qu'** utilisateur,\
**je veux** sélectionner directement un mois et une année dans
l'en-tête,\
**afin de** me rendre à la période qui m'intéresse sans naviguer mois
par mois.

**Critères d'acceptation :**

-   Un contrôleur permet de choisir un mois et une année.
-   La période choisie est affichée immédiatement.
-   L'URL est mise à jour au format `/calendar/YYYY-MM`.
-   La sélection de la période déjà affichée ne provoque pas de
    changement inutile.
-   Le contrôle est accessible au clavier et muni de libellés
    accessibles explicites.
-   La période actuellement affichée est clairement identifiable.
-   Une action « Aujourd'hui » permet de revenir au mois courant.

### US4 --- Sélectionner une date dans le calendrier

**En tant qu'** utilisateur,\
**je veux** pouvoir sélectionner un jour de la grille,\
**afin de** repérer clairement la date sur laquelle je porte mon
attention.

**Critères d'acceptation :**

-   Une date sélectionnée est visuellement identifiable.
-   Une seule date est sélectionnée à la fois.
-   La date du jour et la date sélectionnée restent deux états
    distincts.
-   Une date appartenant à un mois adjacent peut être sélectionnée.
-   La sélection d'une date adjacente affiche le mois auquel cette date
    appartient.
-   La sélection n'ouvre pas de popup et ne déclenche aucune opération
    d'écriture dans ce lot.

### US5 --- Afficher les événements associés aux dates

**En tant qu'** utilisateur,\
**je veux** voir les événements dans les cases des jours concernés,\
**afin de** repérer mes activités sans devoir ouvrir chaque journée.

**Critères d'acceptation :**

-   Chaque date réelle affiche les événements qui lui sont associés.
-   Les événements des dates des mois adjacents sont également affichés.
-   Les événements sont triés par heure croissante ; ceux sans heure
    viennent ensuite.
-   Un critère secondaire stable garantit un ordre déterministe.
-   Si tous les événements ne tiennent pas dans la case, les événements
    visibles sont suivis d'un indicateur `+N autres`.
-   Le nombre restant est exact.
-   Les titres longs sont tronqués visuellement sans débordement.
-   Une date sans événement ne présente aucun indicateur d'événement.
-   Un mois sans événement affiche normalement sa grille.
-   L'affichage des événements reste en lecture seule.

### US6 --- Consulter le calendrier pendant le chargement ou en cas d'erreur

**En tant qu'** utilisateur,\
**je veux** pouvoir consulter la grille même lorsque les événements sont
en cours de récupération ou indisponibles,\
**afin de** ne pas perdre l'accès au calendrier en cas de chargement
lent ou d'erreur.

**Critères d'acceptation :**

-   La grille est affichée indépendamment de la récupération des
    événements.
-   Un état de chargement est présenté lorsque cela est nécessaire.
-   Les événements apparaissent lorsque leur récupération réussit.
-   Une erreur de récupération est signalée sans bloquer le calendrier.
-   L'état d'erreur est distingué d'un mois ne contenant aucun
    événement.

------------------------------------------------------------------------

## 6. Décisions retenues

Les choix suivants constituent la base fonctionnelle proposée pour cette
feature :

  -----------------------------------------------------------------------
  Sujet                               Décision
  ----------------------------------- -----------------------------------
  Structure de la grille              42 cases, soit 6 semaines × 7 jours

  Début de semaine                    Lundi

  Cases des mois adjacents            Dates réelles, visibles,
                                      sélectionnables et avec leurs
                                      événements

  Cases vides                         Aucune ; les 42 cases représentent
                                      une date

  Date du jour                        Visuellement mise en évidence

  Date sélectionnée                   État distinct de la date du jour

  Navigation                          Mois précédent/suivant avec mise à
                                      jour de l'URL

  Accès direct                        Sélecteur de mois et d'année

  Retour au mois courant              Action « Aujourd'hui »

  URL                                 `/calendar/YYYY-MM`

  Historique navigateur               Les changements explicites de
                                      période sont historisés ; les
                                      retours navigateur restaurent la
                                      période sans nouvelle entrée

  Tri des événements                  Heure croissante, événements sans
                                      heure ensuite, critère secondaire
                                      stable

  Troncature                          Selon l'espace disponible, avec
                                      indicateur `+N autres`

  Dates des événements                Dates civiles, sans décalage
                                      involontaire de jour

  Récupération des événements         La grille reste accessible pendant
                                      le chargement et en cas d'erreur

  Gestion des événements              Lecture seule dans ce lot
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 7. Points d'attention pour la réalisation

-   Le calendrier doit rester cohérent avec les conventions, le modèle
    de données et les services déjà utilisés dans Family Notes.
-   La construction de la grille (nombre de jours, alignement,
    débordement) est déjà partiellement en place dans `Calendar` ; ce
    lot doit privilégier l'amélioration de l'existant plutôt qu'une
    réécriture sans nécessité.
-   Les classes CSS `.other-month`, `.today` et `.selected` existent
    déjà ou sont identifiées dans l'état actuel du projet ; leur usage
    réel doit être vérifié avant toute modification.
-   La convention de route existante doit être vérifiée et harmonisée
    avec `/calendar/YYYY-MM`.
-   Le chargement des événements doit réutiliser la source de données
    existante. Aucun service d'écriture ne doit être ajouté pour cette
    feature.
-   La date civile associée à un événement doit être respectée à
    l'affichage, sans conversion de fuseau horaire qui changerait le
    jour.
-   Les contrôles interactifs doivent être utilisables au clavier et
    correctement nommés pour les technologies d'assistance.
-   Ce document décrit les comportements attendus ; il ne prescrit pas
    l'organisation interne du code ni le choix détaillé des composants
    techniques.

------------------------------------------------------------------------

## 8. Hors objectifs de cette feature

Cette feature ne cherche pas à définir un gestionnaire complet
d'événements. Elle fournit uniquement le socle de consultation du
calendrier : visualiser les dates, naviguer entre les périodes,
sélectionner une date et repérer les événements qui y sont associés.

Les interactions avancées avec les événements seront spécifiées dans des
lots ultérieurs.