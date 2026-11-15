# Plan de tests — Calendrier : visualisation, navigation et affichage des événements

**Date :** 2026-11-15  
**Statut :** à valider  
**Feature de référence :** `CALENDAR/FEATURE_CALENDRIER.md`  
**Approche de développement :** `CALENDAR/APPROCHE_CALENDRIER.md`

---

## 1. Objectif

Ce document définit les cas de test nécessaires pour valider la fonctionnalité de consultation du calendrier.

Les tests sont classés par composant ou service afin de faciliter leur implémentation et leur maintenance.

Les comportements attendus sont vérifiés indépendamment de l'implémentation technique, sauf lorsque le test concerne explicitement un service ou un helper.

Les fonctionnalités couvertes sont :

- Construction et affichage de la grille mensuelle.
- Navigation entre les mois.
- Sélection d'une date.
- Synchronisation avec l'URL et l'historique du navigateur.
- Chargement et affichage des événements.
- Tri et regroupement des événements.
- Gestion des titres longs et des journées chargées.
- Gestion des états de chargement et d'erreur.
- Respect des dates civiles et des années bissextiles.

---

## 2. Conventions de test

### 2.1 Identification

Chaque cas de test possède un identifiant unique :

- `T001`, `T002`... : tests du service `CalendarService`.
- `T010`, `T011`... : tests des helpers de dates et de calendrier.
- `T020`, `T021`... : tests du composant `Calendar`.
- `T040`, `T041`... : tests du composant `CalendarDayComponent`.
- `T050`, `T051`... : tests du routage et de l'historique.
- `T060`, `T061`... : tests d'intégration.

### 2.2 Environnement de test

Les tests doivent pouvoir être exécutés avec des données maîtrisées.

Les dates utilisées dans les tests doivent être fixes afin de ne pas dépendre de la date réelle d'exécution.

Les appels à la base de données et les services externes au composant testé doivent être simulés lorsque cela est pertinent.

### 2.3 Données de référence

Sauf indication contraire, les tests utilisent les données suivantes :

| Donnée | Valeur |
|---|---|
| Date courante | 15 novembre 2026 |
| Mois initial | Novembre 2026 |
| Route initiale | `/calendar/2026-11` |
| Nombre de semaines | 6 |
| Nombre de jours par semaine | 7 |
| Nombre total de cases | 42 |
| Premier jour de la semaine | Lundi |

---

# 3. Tests du service CalendarService

**Responsabilité :** récupération des événements depuis SQLite, conversion des résultats en modèles `CalendarEvent` et transmission des erreurs.

Les tests de cette section concernent principalement :

- `getEventsFromRangedDate()`
- `mapRowToEvent()`
- La récupération des événements sur une plage de dates.

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T001 | Vérifier la récupération des événements sur une plage de dates correspondant à une grille mensuelle. | Le service retourne les événements compris dans la plage demandée. |
| T002 | Vérifier que la plage de récupération inclut les dates des mois adjacents présentes dans la grille. | Les événements des dates précédant et suivant le mois affiché sont également récupérés. |
| T003 | Vérifier la récupération des événements lorsque plusieurs événements sont associés à une même date. | Tous les événements correspondants sont retournés, sans perte ni duplication. |
| T004 | Vérifier la récupération des événements lorsqu'aucun événement n'existe dans la plage demandée. | Le service retourne une collection vide, sans considérer cette situation comme une erreur. |
| T005 | Vérifier que les événements retournés sont correctement convertis en objets `CalendarEvent`. | Les propriétés `id`, `title`, `date`, `start_time`, `end_time` et `noteIds` sont correctement renseignées selon les données disponibles. |
| T006 | Vérifier que les dates des événements sont conservées au format de date civile `YYYY-MM-DD`. | La date retournée correspond exactement à la date stockée en base, sans décalage lié au fuseau horaire. |
| T007 | Vérifier le comportement du service lorsque la requête SQLite échoue. | L'erreur est correctement remontée à la couche appelante afin que le composant puisse afficher son état d'erreur. |
| T008 | Vérifier que les événements situés exactement aux limites de la plage demandée sont récupérés. | Les événements correspondant à la première et à la dernière date de la plage sont correctement pris en compte. |

---

# 4. Tests des helpers de dates et de calendrier

**Responsabilité :** calcul des dates, construction de la grille, gestion des mois adjacents et tri déterministe des événements.

Cette section concerne notamment les fonctions existantes :

- `fillCalendarArray()`
- `getWeekDayNumber()`
- `computeDayNumberFromMonth()`
- `estBissextile()`

Elle concerne également les éventuels helpers ajoutés pour le regroupement et le tri des événements.

## 4.1 Construction de la grille

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T010 | Vérifier la construction de la grille pour un mois standard de 30 jours. | La grille contient 42 dates consécutives, correctement positionnées du lundi au dimanche. |
| T011 | Vérifier la construction de la grille pour un mois de 31 jours. | Le nombre de jours est correct et les dates des mois adjacents complètent la grille. |
| T012 | Vérifier la construction de la grille pour février d'une année non bissextile. | Février contient 28 jours et la grille est complétée correctement. |
| T013 | Vérifier la construction de la grille pour février d'une année bissextile. | Février contient 29 jours et la grille est complétée correctement. |
| T014 | Vérifier la construction de la grille lorsque le premier jour du mois tombe un lundi. | Le premier jour du mois apparaît dans la première colonne, sans décalage inutile. |
| T015 | Vérifier la construction de la grille lorsque le premier jour du mois tombe un dimanche. | Le premier jour du mois apparaît dans la dernière colonne de la première semaine. |
| T016 | Vérifier que les 42 cases de la grille représentent des dates réelles et consécutives. | Aucune case n'est vide ou ne représente une date fictive. |
| T017 | Vérifier la construction de la grille lors d'un changement d'année. | Les dates de décembre et de janvier sont correctement calculées et ordonnées. |

## 4.2 Tri des événements

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T018 | Vérifier le tri de plusieurs événements possédant des heures de début différentes. | Les événements sont classés par heure de début croissante. |
| T019 | Vérifier le tri lorsque certains événements ne possèdent pas d'heure de début. | Les événements possédant une heure apparaissent avant ceux qui n'en possèdent pas. |
| T020 | Vérifier le tri lorsque plusieurs événements possèdent la même heure de début. | Le critère secondaire défini, par exemple l'identifiant, garantit un ordre déterministe. |
| T021 | Vérifier le tri lorsque plusieurs événements ne possèdent pas d'heure de début. | Leur ordre reste déterministe grâce au critère secondaire. |
| T022 | Vérifier le tri d'une collection vide ou contenant un seul événement. | Le helper retourne un résultat valide sans erreur. |

## 4.3 Regroupement des événements par date

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T023 | Vérifier le regroupement de plusieurs événements associés à des dates différentes. | Chaque événement est associé à la bonne date civile. |
| T024 | Vérifier le regroupement de plusieurs événements associés à une même date. | Tous les événements sont regroupés dans la collection de cette journée. |
| T025 | Vérifier le regroupement d'événements appartenant aux mois adjacents. | Les événements sont associés à leur date réelle, même si celle-ci n'appartient pas au mois affiché. |
| T026 | Vérifier le regroupement lorsque la collection d'événements est vide. | Toutes les dates de la grille possèdent une collection d'événements vide. |

---

# 5. Tests du composant Calendar

**Responsabilité :** orchestration de la vue mensuelle, navigation, sélection, synchronisation avec l'URL et chargement des événements.

Le composant `Calendar` est responsable de l'assemblage de la grille et de la transmission des données aux composants `CalendarDayComponent`.

## 5.1 Initialisation et affichage

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T027 | Vérifier l'ouverture du calendrier avec une route valide `/calendar/2026-11`. | Le calendrier affiche novembre 2026 et construit la grille correspondante. |
| T028 | Vérifier l'ouverture du calendrier sans période valide dans l'URL. | Le calendrier affiche le mois courant sans erreur bloquante. |
| T029 | Vérifier que le composant initialise une grille de 42 jours. | Les 42 dates sont transmises aux composants de journée. |
| T030 | Vérifier l'affichage des en-têtes de semaine. | Les jours sont affichés dans l'ordre lundi, mardi, mercredi, jeudi, vendredi, samedi et dimanche. |
| T031 | Vérifier l'affichage des dates appartenant aux mois adjacents. | Les dates sont présentes dans la grille et sont visuellement différenciées du mois affiché. |

## 5.2 Date du jour et date sélectionnée

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T032 | Vérifier l'identification de la date du jour lorsque le mois affiché contient cette date. | La date du jour reçoit l'état visuel `.today`. |
| T033 | Vérifier l'identification de la date du jour lorsque le mois affiché est différent du mois courant. | La date du jour reste identifiable si elle est présente dans la grille des 42 dates. |
| T034 | Vérifier la sélection d'une date appartenant au mois affiché. | La date sélectionnée reçoit l'état visuel `.selected`. |
| T035 | Vérifier la sélection successive de deux dates différentes. | Une seule date conserve l'état `.selected` : la dernière date sélectionnée. |
| T036 | Vérifier la sélection de la date du jour. | Les états `.today` et `.selected` peuvent être présents simultanément sans ambiguïté visuelle. |
| T037 | Vérifier la sélection d'une date appartenant au mois précédent ou suivant. | La date est sélectionnée et le calendrier affiche le mois auquel elle appartient. |
| T038 | Vérifier qu'une sélection de date ne déclenche aucune opération d'écriture. | Aucune création, modification ou suppression d'événement n'est effectuée. |
| T039 | Vérifier la sélection d'une date qui ne possède aucun événement. | La date est sélectionnée normalement, même si elle ne contient aucun événement. |

## 5.3 Navigation mensuelle

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T040 | Vérifier le passage au mois suivant depuis novembre 2026. | Le calendrier affiche décembre 2026 et l'URL devient `/calendar/2026-12`. |
| T041 | Vérifier le passage au mois précédent depuis novembre 2026. | Le calendrier affiche octobre 2026 et l'URL devient `/calendar/2026-10`. |
| T042 | Vérifier le passage au mois suivant depuis décembre. | Le calendrier affiche janvier de l'année suivante et l'année est correctement mise à jour dans l'URL. |
| T043 | Vérifier le passage au mois précédent depuis janvier. | Le calendrier affiche décembre de l'année précédente et l'année est correctement mise à jour dans l'URL. |
| T044 | Vérifier plusieurs navigations successives vers les mois suivants et précédents. | La période affichée reste cohérente avec chaque navigation et l'URL est actualisée à chaque changement. |

## 5.4 Sélecteur de période et retour à aujourd'hui

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T045 | Vérifier l'affichage du sélecteur de mois et d'année. | Le sélecteur permet de consulter et de choisir une période. |
| T046 | Vérifier la sélection d'un mois différent dans la même année. | Le calendrier affiche immédiatement le mois sélectionné et l'URL est mise à jour. |
| T047 | Vérifier la sélection d'un mois appartenant à une autre année. | Le calendrier affiche la période choisie et l'URL respecte le format `/calendar/YYYY-MM`. |
| T048 | Vérifier la sélection de la période déjà affichée. | Aucun changement inutile de période ou d'historique n'est effectué. |
| T049 | Vérifier l'utilisation du bouton « Aujourd'hui » depuis une période éloignée. | Le calendrier revient au mois contenant la date réelle du jour et l'URL est mise à jour. |

## 5.5 Chargement des événements

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T050 | Vérifier le chargement des événements lors de l'ouverture d'un mois. | Les événements de la plage représentée par les 42 dates sont récupérés et regroupés dans les bonnes journées. |
| T051 | Vérifier le chargement des événements après une navigation vers un autre mois. | Les événements de la nouvelle grille remplacent ceux de la période précédente. |
| T052 | Vérifier le chargement des événements après une sélection de date appartenant à un mois adjacent. | Les événements correspondant à la nouvelle période affichée sont chargés. |
| T053 | Vérifier l'affichage d'un mois ne contenant aucun événement. | La grille reste normalement affichée et aucune erreur n'est signalée. |
| T054 | Vérifier que les événements ne sont pas affichés dans une mauvaise journée. | Chaque événement apparaît uniquement dans la case correspondant à sa date civile. |

## 5.6 Chargement et erreurs

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T055 | Vérifier l'affichage du calendrier pendant la récupération des événements. | La grille est consultable indépendamment du chargement des événements. |
| T056 | Vérifier l'affichage des événements après une récupération réussie. | Les événements sont affichés dans les journées correspondantes et l'état de chargement disparaît. |
| T057 | Vérifier le comportement lorsque la récupération des événements échoue. | La grille reste consultable et un état d'erreur discret est présenté. |
| T058 | Vérifier la distinction entre une récupération réussie sans résultat et une récupération en erreur. | Un mois vide n'est pas présenté comme une erreur de récupération. |
| T059 | Vérifier la navigation vers un autre mois pendant qu'une récupération est encore en cours. | Les résultats d'une ancienne période ne remplacent pas les événements de la période actuellement affichée. |

---

# 6. Tests du composant CalendarDayComponent

**Responsabilité :** affichage individuel d'une journée, de ses événements et des différents états visuels.

Le composant reçoit un objet `CalendarDay` contenant une date et une collection d'événements.

## 6.1 Affichage d'une journée

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T060 | Vérifier l'affichage d'une journée sans événement. | Le numéro du jour est affiché et aucun indicateur d'événement n'apparaît. |
| T061 | Vérifier l'affichage d'une journée contenant un seul événement. | Le titre de l'événement est affiché dans la case correspondante. |
| T062 | Vérifier l'affichage d'une journée contenant plusieurs événements. | Les événements sont affichés dans l'ordre reçu par le composant. |
| T063 | Vérifier l'affichage d'une date appartenant à un mois adjacent. | La classe `.other-month` est appliquée et les événements de la date restent visibles. |

## 6.2 États visuels

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T064 | Vérifier l'affichage d'une journée correspondant à la date du jour. | La classe `.today` est appliquée. |
| T065 | Vérifier l'affichage d'une journée correspondant à la date sélectionnée. | La classe `.selected` est appliquée. |
| T066 | Vérifier l'affichage d'une journée qui est à la fois la date du jour et la date sélectionnée. | Les deux états sont correctement représentés sans conflit visuel. |
| T067 | Vérifier l'affichage d'une journée appartenant à un mois adjacent et correspondant à la date du jour. | Les états `.other-month` et `.today` sont correctement combinés. |

## 6.3 Troncature et nombre d'événements

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T068 | Vérifier l'affichage d'un événement dont le titre dépasse la largeur disponible. | Le titre est tronqué visuellement et ne déborde pas de la case. |
| T069 | Vérifier que la troncature d'un titre ne modifie pas la donnée d'origine. | Le titre complet reste présent dans l'objet `CalendarEvent`. |
| T070 | Vérifier l'affichage d'une journée contenant plus d'événements que le nombre autorisé à l'affichage. | Le nombre maximal d'événements défini est affiché et les événements restants sont représentés par `+N autres`. |
| T071 | Vérifier l'exactitude du nombre indiqué dans `+N autres`. | Le nombre correspond exactement aux événements non affichés. |
| T072 | Vérifier l'affichage d'une journée contenant exactement le nombre maximal d'événements visibles. | Aucun indicateur `+N autres` n'apparaît. |
| T073 | Vérifier l'affichage d'une journée très chargée en événements. | Le contenu reste contenu dans les limites de la case et ne déborde pas sur les journées voisines. |

---

# 7. Tests du routage et de l'historique navigateur

**Responsabilité :** synchronisation entre la période affichée et l'URL, gestion des routes invalides et restauration des périodes précédemment consultées.

Cette section concerne l'intégration de `Router` et `ActivatedRoute` avec le composant `Calendar`.

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T074 | Vérifier l'ouverture directe d'une URL valide `/calendar/2026-11`. | Le calendrier affiche novembre 2026. |
| T075 | Vérifier l'ouverture d'une URL contenant un mois inférieur à 01. | Le calendrier revient au mois courant sans erreur bloquante. |
| T076 | Vérifier l'ouverture d'une URL contenant un mois supérieur à 12. | Le calendrier revient au mois courant sans erreur bloquante. |
| T077 | Vérifier l'ouverture d'une URL contenant un format de période invalide. | Le calendrier revient au mois courant sans erreur bloquante. |
| T078 | Vérifier que la navigation mensuelle met à jour l'URL. | L'URL reflète toujours la période actuellement affichée. |
| T079 | Vérifier que la sélection d'une nouvelle période dans le sélecteur met à jour l'URL. | L'URL correspond à la période sélectionnée. |
| T080 | Vérifier que le retour à aujourd'hui met à jour l'URL. | L'URL correspond au mois courant. |
| T081 | Vérifier que chaque changement explicite de période crée une entrée d'historique. | Le navigateur permet de revenir aux périodes précédemment consultées. |
| T082 | Vérifier que l'ouverture initiale du calendrier ne crée pas d'entrée d'historique supplémentaire. | L'historique initial du navigateur est conservé. |
| T083 | Vérifier le retour navigateur après plusieurs changements de mois. | Le calendrier restaure la période précédemment affichée. |
| T084 | Vérifier l'avance navigateur après un retour vers une période précédente. | Le calendrier restaure la période suivante précédemment consultée. |
| T085 | Vérifier que la restauration d'une période via l'historique ne crée pas une nouvelle entrée. | L'historique n'est pas pollué par des entrées supplémentaires lors d'un retour ou d'une avance navigateur. |

---

# 8. Tests d'intégration

**Responsabilité :** vérifier le fonctionnement conjoint du service, des helpers, du composant principal, des composants de journée et du routage.

Ces tests permettent de vérifier les parcours fonctionnels complets.

| ID | Cas de test | Résultat attendu |
|---|---|---|
| T086 | Vérifier l'ouverture du calendrier sur un mois contenant plusieurs événements. | La grille est construite, les événements sont récupérés, regroupés, triés et affichés dans les bonnes journées. |
| T087 | Vérifier l'ouverture d'un mois contenant des événements sur des dates appartenant aux mois adjacents. | Les événements sont visibles dans les cases correspondantes, même lorsque celles-ci appartiennent à un autre mois. |
| T088 | Vérifier la navigation vers le mois suivant puis vers le mois précédent. | La grille, les événements et l'URL sont correctement actualisés à chaque navigation. |
| T089 | Vérifier la sélection d'une date appartenant au mois adjacent. | La date est sélectionnée, le mois correspondant devient la période affichée et les événements sont actualisés. |
| T090 | Vérifier l'utilisation du sélecteur pour accéder directement à une période éloignée. | La période sélectionnée est affichée, les événements sont chargés et l'URL est synchronisée. |
| T091 | Vérifier l'utilisation du bouton « Aujourd'hui » après consultation de plusieurs périodes. | Le calendrier revient au mois courant et affiche correctement la date du jour. |
| T092 | Vérifier le comportement du calendrier lorsqu'un mois ne contient aucun événement. | La grille reste complète et fonctionnelle, sans message d'erreur. |
| T093 | Vérifier le comportement du calendrier lorsque le service de récupération des événements échoue. | La grille reste visible, la navigation reste possible et l'erreur est signalée. |
| T094 | Vérifier le comportement du calendrier lorsque deux chargements successifs se terminent dans un ordre différent de leur lancement. | Seuls les événements correspondant à la période actuellement affichée sont conservés. |
| T095 | Vérifier la consultation d'un mois de février d'une année bissextile contenant plusieurs événements. | Le 29 février existe dans la grille et les événements correspondants sont affichés à la bonne date. |
| T096 | Vérifier la consultation d'un mois lors d'un changement d'année. | Les dates, événements, période affichée et URL restent cohérents. |
| T097 | Vérifier que la sélection d'une date et la navigation mensuelle ne déclenchent aucune écriture en base. | Les données d'événements restent inchangées. |

---

# 9. Synthèse de couverture

| Composant / Service | Tests | Fonctionnalités couvertes |
|---|---|---|
| `CalendarService` | T001 à T008 | Récupération des événements, mapping SQL, dates civiles, erreurs |
| Helpers de dates et calendrier | T010 à T017 | Construction de la grille, mois adjacents, années bissextiles |
| Helpers de tri et regroupement | T018 à T026 | Tri déterministe et association événement/date |
| `Calendar` | T027 à T059 | Initialisation, sélection, navigation, événements, chargement et erreurs |
| `CalendarDayComponent` | T060 à T073 | Affichage des journées, états visuels, troncature et indicateur `+N autres` |
| Routage / Historique | T074 à T085 | URL, routes invalides, historique navigateur |
| Intégration | T086 à T097 | Parcours fonctionnels complets |

**Total : 88 cas de test.**

---

# 10. Points d'attention pour l'implémentation des tests

- Les tests du `CalendarService` doivent vérifier le comportement de la récupération des données sans dépendre de la présentation.
- Les tests des helpers doivent rester indépendants d'Angular et de SQLite.
- Les tests du composant `Calendar` doivent simuler les réponses du service afin de maîtriser les données affichées.
- Les tests du `CalendarDayComponent` doivent vérifier les états visuels et les limites d'affichage.
- Les tests de routage doivent vérifier la synchronisation réelle entre le routeur et la période affichée.
- Les tests d'intégration doivent vérifier les interactions entre les différentes couches.

## 10.1 Point particulier : plage de récupération des événements

La grille représente toujours 42 dates réelles, dont certaines peuvent appartenir au mois précédent ou suivant.

La récupération des événements doit donc couvrir l'ensemble de la plage représentée par la grille, et pas uniquement les dates du mois affiché.

Ce point est indispensable pour valider les tests T002, T050, T087 et les autres tests portant sur les événements des mois adjacents.

## 10.2 Point particulier : données absentes et erreurs

Deux situations doivent être distinguées :

- Une récupération réussie qui retourne zéro événement : le calendrier affiche normalement le mois.
- Une récupération qui échoue : le calendrier affiche la grille et signale discrètement l'erreur.

Une collection vide ne doit jamais être assimilée à une erreur de base de données.

## 10.3 Point particulier : dates civiles

Les tests doivent utiliser des dates fixes au format `YYYY-MM-DD`.

Aucune conversion de fuseau horaire ne doit modifier le jour auquel un événement est associé.

---

# 11. Hors périmètre des tests

Les tests suivants ne sont pas inclus dans cette feature :

- Création d'un événement.
- Modification d'un événement.
- Suppression d'un événement.
- Association ou dissociation d'un événement avec une note.
- Gestion des événements récurrents.
- Gestion des événements sur plusieurs jours.
- Notifications et rappels.
- Synchronisation multi-membres.
- Ouverture d'une popup ou d'une vue détaillée d'événement.

Ces fonctionnalités feront l'objet de plans de tests spécifiques dans les lots ultérieurs.
