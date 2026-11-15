# Approche de développement — Calendrier : visualisation, navigation et affichage des événements

**Date :** 2026-11-15  
**Statut :** brouillon révisé — à valider  
**Spécification de référence :** `CALENDAR/CALENDAR_FEATURE.md`

**Documents de référence :**
- `CALENDAR/ETAT_CALENDRIER.md`
- `CALENDAR/FEATURE_CALENDRIER.md`
- `DIAGRAMME_CLASSES_NOTES.md` (§1–2)
- `PLAN_GLOBAL.md` (§2.B)

> **But de ce document :** décrire comment réaliser la visualisation mensuelle, la navigation et l'affichage des événements définis dans la spécification. Ce document décrit l'approche technique, sans produire le code final ni les tests. Il précède `plan_test`.

---

## 0. Décisions de cadrage

Les décisions suivantes guident la conception et l'implémentation.

### 0.1. Navigation mensuelle par flèches et saisie directe du mois

L'en-tête du calendrier propose trois moyens d'accéder à une période :

- Une flèche « Mois précédent ».
- Une flèche « Mois suivant ».
- Un champ de saisie de période permettant de choisir directement un mois et une année.

Le champ est un **sélecteur de mois et d'année**, et non un champ permettant de choisir un jour précis.

Un contrôle HTML de type `input type="month"` est à privilégier s'il est compatible avec l'ergonomie et les navigateurs ciblés. Il fournit une valeur au format `YYYY-MM`.

La période choisie est synchronisée avec le paramètre de route Angular `:selectedMonth` :

- Route : `/calendar/:selectedMonth`
- Exemple : `/calendar/2026-11`
- Valeur du paramètre : `2026-11`

Il s'agit d'un **paramètre de chemin de route**, et non d'un paramètre de query string tel que `?selectedMonth=2026-11`.

Les flèches et le champ de saisie utilisent le même mécanisme de navigation : ils mettent à jour `:selectedMonth`, puis le calendrier se reconstruit à partir de la période portée par l'URL.

**L'URL est la source de vérité du mois affiché.**

### 0.2. Chargement des événements sur les 42 dates visibles

La grille mensuelle comporte toujours 42 dates réelles. Elle peut donc inclure des dates du mois précédent et du mois suivant.

Les événements doivent être chargés sur l'intervalle complet de la grille, du premier au dernier jour affiché, en une seule requête lorsque la couche de données le permet.

Il ne faut pas limiter la récupération au seul mois civil indiqué dans l'URL.

La méthode existante `getEventsFromRangedDate()` peut être réutilisée si elle permet de rechercher sur un intervalle arbitraire. Sinon, elle devra être adaptée ou complétée.

### 0.3. Lecture seule

Le calendrier reste en consultation seule.

Aucun état ni mécanisme de création, modification ou suppression d'événement n'est ajouté.

### 0.4. Distinction entre période affichée, date sélectionnée et date du jour

Trois notions doivent rester distinctes :

- **Période affichée :** le mois et l'année déterminés par `:selectedMonth` dans l'URL.
- **Date sélectionnée :** date éventuellement choisie par l'utilisateur dans la grille ; elle est gérée dans l'état du composant.
- **Date du jour :** date civile locale du jour, utilisée pour le repère visuel « aujourd'hui ».

La sélection d'une date ne modifie pas systématiquement la période dans l'URL.

Exception : si l'utilisateur sélectionne une date appartenant au mois précédent ou suivant visible dans la grille, le calendrier navigue vers le mois de cette date et met à jour l'URL.

---

## 1. Entités et relations

| Élément | Rôle | Statut | Attributs / responsabilités clés |
|---|---|---|---|
| `CalendarEvent` | Modèle d'événement (`calendar-event.model.ts`) | Existant | `id`, `title`, `date` (`YYYY-MM-DD`), `start_time`, `end_time`, `noteIds[]` |
| `CalendarDay` | Représentation d'une date de la grille | Existant | `date` (`YYYY-MM-DD`), `events: CalendarEvent[]` |
| `CalendarService` | Accès aux événements SQLite | Existant à vérifier / modifier | `getEventsFromDate(date)`, `getEventsFromRangedDate(...)`, `mapRowToEvent(row)` |
| `SqliteService` | Couche d'accès à la base | Existant | `runQuery(errMsg, fn)`, `db.query(sql, params)` |
| `Calendar` | Composant de la grille (`app-calendar`) | À modifier | période issue de la route, 42 `CalendarDay`, date sélectionnée, date du jour, navigation |
| `CalendarDayComponent` | Affichage d'une date (`app-calendar-day`) | À modifier si nécessaire | date, événements, états visuels |
| `Router` / `ActivatedRoute` | Routage Angular | Existant | lecture de `selectedMonth`, navigation et historique |

### Relations principales

- `Calendar` injecte `CalendarService` pour lire les événements.
- `Calendar` utilise `ActivatedRoute` pour observer `selectedMonth`.
- `Calendar` utilise `Router` pour naviguer vers une autre période.
- `CalendarService` s'appuie sur `SqliteService`.
- `Calendar` projette exactement 42 composants `CalendarDayComponent`, chacun représentant une date réelle.

Le modèle `CalendarDay` ne doit plus être nullable dans la grille : les 42 cases sont construites à partir de dates valides.

---

## 2. État de l'existant et travaux à réaliser

La construction de la grille semble déjà prise en charge par les fonctions existantes (`fillCalendarArray`, `getWeekDayNumber`, `computeDayNumberFromMonth`, `estBissextile`).

Il faudra néanmoins vérifier leur comportement et les adapter pour garantir 42 dates réelles, sans cases `null`.

Les travaux à réaliser sont les suivants :

1. Construire les 42 dates de la grille.
2. Calculer les bornes exactes de l'intervalle visible.
3. Récupérer les événements de cet intervalle en une seule requête.
4. Regrouper les événements par date civile.
5. Trier les événements de chaque journée.
6. Synchroniser la période affichée avec le paramètre de route.
7. Gérer la date sélectionnée et la date du jour indépendamment.
8. Afficher les événements sans débordement.
9. Ajouter le sélecteur de mois/année et les deux flèches de navigation.
10. Gérer les états de chargement et d'erreur.

Les styles existants (`.other-month`, `.today`, `.selected`) pourront être réutilisés après vérification.

---

## 3. Approche par lots

### Lot A — Construction de la grille et chargement des événements sur les 42 dates

*User stories : US1, US5, US6*

**Responsabilité :** construire les 42 dates visibles, puis charger les événements couvrant exactement cet intervalle.

#### Algorithme proposé

1. Lire et valider la période `YYYY-MM` depuis `:selectedMonth`.
2. Si le paramètre est absent ou invalide, utiliser le mois courant et remplacer l'URL par une route valide, sans ajouter une entrée d'historique inutile.
3. Construire les 42 dates civiles de la grille, du lundi de la première semaine au dimanche de la sixième semaine.
4. Déterminer :
   - `startDate` : date civile de la première case ;
   - `endDate` : date civile de la dernière case.
5. Charger les événements compris dans l'intervalle `[startDate, endDate]` en une seule requête.
6. Regrouper les événements en mémoire dans une structure de type `Map<string, CalendarEvent[]>`, avec la date complète `YYYY-MM-DD` comme clé.
7. Pour chacune des 42 dates, construire un `CalendarDay` contenant sa date et les événements correspondants, ou un tableau vide.
8. Appliquer le tri défini dans le Lot B.

#### Accès aux données

Vérifier la signature et le comportement de `getEventsFromRangedDate()` :

- Si elle accepte déjà deux bornes, la réutiliser.
- Si elle ne prend qu'un mois, l'adapter pour accepter `startDate` et `endDate`, ou créer une méthode dédiée telle que `getEventsBetweenDates(startDate, endDate)`.
- Utiliser une requête SQL bornée et paramétrée, en respectant le format de date stocké (`YYYY-MM-DD`).

La requête doit inclure les événements du premier et du dernier jour de la grille.

#### Cas particuliers

- Mois sans événement : les 42 dates sont affichées, avec des listes d'événements vides.
- Erreur de récupération : la grille reste visible et un état d'erreur est présenté.
- Dates des mois adjacents : leurs événements sont chargés et affichés comme ceux des dates du mois principal.
- Requête en cours : les données d'une ancienne période ne doivent pas être affichées comme si elles appartenaient à la nouvelle période.

### Lot B — Tri déterministe des événements

*User story : US5*

**Responsabilité :** garantir le même ordre d'affichage pour les événements d'une même date.

Créer un helper pur, par exemple `sortEvents(events)`, qui applique les règles suivantes :

1. Les événements ayant une heure de début sont affichés avant ceux sans heure.
2. Les événements avec heure sont triés par `start_time` croissante.
3. Les événements sans heure sont triés selon un critère secondaire déterministe.
4. En cas d'égalité, utiliser un critère stable, par exemple l'identifiant `id`.

Le tri est appliqué à chaque groupe de date après le regroupement du Lot A.

### Lot C — Synchronisation de la période avec l'URL et navigation mensuelle

*User story : US2*

**Responsabilité :** faire de `:selectedMonth` la référence unique du mois affiché et gérer la navigation avec les flèches.

#### Route

Conserver une route de la forme :

`/calendar/:selectedMonth`

Exemple :

`/calendar/2026-11`

Le paramètre `selectedMonth` transporte une valeur au format `YYYY-MM`. Il ne s'agit pas d'une date complète ni d'un query parameter.

#### Flèches précédent / suivant

- La flèche précédente calcule le mois précédant la période courante et navigue vers `/calendar/YYYY-MM`.
- La flèche suivante calcule le mois suivant et navigue vers `/calendar/YYYY-MM`.
- Chaque navigation met à jour l'URL et déclenche le chargement de la nouvelle grille.
- Chaque action explicite de navigation crée une entrée d'historique normale du navigateur.

#### Synchronisation avec le routeur

Le composant doit observer les changements de `selectedMonth` via `ActivatedRoute` (par exemple avec `paramMap` observable).

Le chargement doit être déclenché par le changement du paramètre de route, et non uniquement par l'initialisation du composant. Cela permet de gérer correctement :

- Les clics sur les flèches.
- Le sélecteur de mois/année.
- Les boutons précédent/suivant du navigateur.
- L'accès direct à une URL partagée ou saisie dans la barre d'adresse.

Le retour/avance du navigateur doit restaurer la période correspondant à l'URL sans provoquer une nouvelle navigation supplémentaire.

#### Protection contre les réponses asynchrones obsolètes

Si l'utilisateur navigue rapidement entre plusieurs mois, une réponse de requête lancée pour une ancienne période ne doit pas remplacer les données de la période la plus récente.

Utiliser un mécanisme d'annulation ou d'ignorance des réponses obsolètes adapté aux pratiques du projet.

### Lot D — Sélection d'une date et repère « aujourd'hui »

*User stories : US1, US4*

**Responsabilité :** distinguer visuellement la date sélectionnée et la date civile du jour.

#### Date du jour

- Calculer la date civile locale au format `YYYY-MM-DD`.
- Ne pas utiliser directement `new Date().toISOString().slice(0, 10)` pour obtenir la date locale : `toISOString()` convertit l'instant en UTC et peut produire un décalage de jour.
- Réutiliser une fonction utilitaire du projet si elle existe ; sinon, créer une fonction explicite de formatage de date locale.
- Appliquer la classe `.today` à la date correspondante si elle est présente dans les 42 cases.

#### Date sélectionnée

- Une seule date peut être sélectionnée à la fois.
- La sélection est conservée dans l'état du composant ; elle n'est pas encodée dans `:selectedMonth` dans le périmètre actuel.
- Un clic sur une date du mois affiché met à jour la sélection visuelle, sans modifier la période dans l'URL.
- Un clic sur une date d'un mois adjacent sélectionne cette date et navigue vers le mois auquel elle appartient. Le paramètre `selectedMonth` est alors mis à jour.
- Les classes `.today` et `.selected` sont indépendantes et peuvent être présentes simultanément sur la même date.

Les dates adjacentes restent de vraies dates interactives, avec leurs événements.

### Lot E — Affichage des événements, troncature et indicateur « +N autres »

*User story : US5*

**Responsabilité :** afficher les événements dans chaque case sans débordement visuel.

#### Titres longs

- Limiter l'espace occupé par les événements dans une case.
- Utiliser une troncature visuelle (par exemple ellipsis) sans modifier le titre stocké.
- Vérifier le comportement sur différentes tailles d'écran et densités d'événements.

#### Nombre d'événements affichés

- Définir une capacité d'affichage (`CAP`) adaptée à la hauteur réelle d'une case.
- Afficher au maximum `CAP` événements.
- Si le nombre total dépasse `CAP`, afficher un indicateur `+N autres`, avec `N = total - CAP`.
- Réserver explicitement l'espace nécessaire à cet indicateur afin qu'il ne soit pas lui-même coupé ou masqué.
- Le nombre indiqué doit être exact.
- Les cases des mois adjacents appliquent les mêmes règles d'affichage.

### Lot F — Sélecteur direct de mois et d'année

*User story : US3*

**Responsabilité :** permettre à l'utilisateur de se rendre directement à un mois et une année sans parcourir les mois avec les flèches.

#### Contrôle de saisie

Ajouter dans l'en-tête un champ de sélection du mois et de l'année. Un contrôle HTML `input type="month"` est une option à privilégier si son rendu natif convient à l'application.

- La valeur du contrôle est au format `YYYY-MM`.
- Le contrôle ne permet pas de sélectionner un jour.
- À l'initialisation et à chaque changement de route, sa valeur reflète le paramètre `selectedMonth`.
- Lorsque l'utilisateur choisit un mois, naviguer vers `/calendar/YYYY-MM` avec la valeur choisie.
- Ne pas déclencher de navigation si la période choisie est déjà celle affichée.
- Valider la valeur avant navigation.

Le contrôle, les flèches et la route doivent toujours représenter la même période. Éviter de maintenir une deuxième source de vérité indépendante dans le champ.

#### Accessibilité

- Donner un libellé explicite au champ.
- Donner des `aria-label` explicites aux flèches.
- Assurer l'utilisation au clavier et un ordre de tabulation cohérent.
- Ne pas dépendre uniquement de la couleur pour distinguer le mois courant, la date sélectionnée et les jours adjacents.

---

## 4. Dates civiles et fuseaux horaires

Les événements utilisent une date civile stockée au format `YYYY-MM-DD`. Le calendrier doit comparer et regrouper ces dates en tant que dates civiles, sans conversion implicite en UTC.

Points de vigilance :

- Construire les dates de grille sans décalage de jour lié au fuseau horaire.
- Comparer les dates au format `YYYY-MM-DD` lorsque cela est cohérent avec le modèle existant.
- Calculer « aujourd'hui » selon la date locale de l'utilisateur.
- Conserver le même sens pour `startDate` et `endDate` lors de la requête SQL.
- Ne pas convertir une date civile en instant UTC simplement pour l'afficher.

Cette règle concerne également les dates des mois adjacents.

---

## 5. États de chargement et d'erreur

Le chargement des événements doit être distinct de la construction de la grille.

- La grille des 42 dates peut être construite dès que la période de route est valide.
- Pendant le chargement, afficher un état discret et compréhensible.
- Ne pas laisser croire que les événements de l'ancienne période appartiennent à la nouvelle.
- En cas d'erreur, conserver la grille et afficher un message d'erreur adapté.
- Distinguer explicitement « aucun événement » d'« événements non chargés à cause d'une erreur ».
- Prévoir une possibilité de relancer le chargement si cela correspond aux conventions de l'application.

---

## 6. Impacts et points d'attention

| Sujet | Point d'attention |
|---|---|
| Performance | Une seule requête pour l'intervalle des 42 dates, plutôt qu'une requête par case. |
| Bornes de recherche | La requête inclut le premier et le dernier jour affichés. |
| Dates adjacentes | Le chargement doit couvrir les mois précédent et suivant visibles dans la grille. |
| Route | `:selectedMonth` est un paramètre de chemin au format `YYYY-MM`, par exemple `/calendar/2026-11`. |
| Historique | Les changements explicites de mois créent une entrée ; le retour/avance du navigateur restaure la route sans nouvelle entrée. |
| Sélection | La date sélectionnée est distincte du mois affiché ; elle n'est pas ajoutée à l'URL dans ce périmètre. |
| Requêtes asynchrones | Une réponse d'un ancien mois ne doit pas écraser les données du mois courant. |
| Fuseau horaire | La date du jour est calculée en date civile locale, pas via une conversion UTC. |
| Modèle | Construire 42 `CalendarDay` non nullables ; éviter de conserver des cases `null`. |
| Données absentes | Si la table `events` ne contient pas de données, le calendrier reste affiché sans événements. |
| Accessibilité | Flèches, sélecteur et dates doivent être accessibles au clavier et correctement nommés. |

---

## 7. Ordre de réalisation conseillé

1. **Lot A + B — Grille, chargement et tri.** Construire les 42 dates réelles, récupérer les événements sur l'intervalle complet, les regrouper et les trier.
2. **Lot C — Route et navigation.** Valider le paramètre `selectedMonth`, les flèches, l'historique et le rechargement à partir de l'URL.
3. **Lot D — Date sélectionnée et aujourd'hui.** Implémenter les états visuels et le comportement des dates adjacentes.
4. **Lot E — Présentation des événements.** Ajouter les règles de troncature et l'indicateur `+N autres`.
5. **Lot F — Sélecteur de mois/année.** Ajouter le contrôle direct et le synchroniser avec la route.

Chaque lot devra être suivi de la préparation des tests correspondants avec `plan_test`, puis de l'implémentation.

---

## 8. Rattachement aux User Stories

| User story | Lots concernés |
|---|---|
| US1 — Visualiser un mois complet | A (42 dates), D (aujourd'hui et sélection) |
| US2 — Naviguer entre les mois | C (flèches, route, historique) |
| US3 — Atteindre directement une période | F (sélecteur mois/année) |
| US4 — Sélectionner une date | D (sélection et navigation depuis une date adjacente) |
| US5 — Afficher les événements | A (chargement et regroupement), B (tri), E (troncature) |
| US6 — Consulter pendant le chargement ou en cas d'erreur | A et §5 (états de chargement et d'erreur) |

---

## 9. Hors périmètre

Les fonctionnalités suivantes restent exclues de cette approche :

- Création, modification ou suppression d'événements.
- Association ou navigation vers une note depuis un événement.
- Synchronisation multi-membres.
- Notifications et rappels.
- Événements récurrents ou multi-jours.
- Affichage chronologique avancé.
- Consultation détaillée d'une journée.
- Persistance ou partage de la date sélectionnée indépendamment du mois affiché.

Le périmètre reste celui d'un calendrier mensuel consultatif, navigable par flèches ou par sélection directe d'un mois et d'une année.