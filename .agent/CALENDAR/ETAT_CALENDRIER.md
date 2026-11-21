# Inventaire du module Calendrier — état des lieux

> **Date :** 2026-11-15 · **rédigé par** l'agent, à la demande de l'utilisateur.
> **Périmètre exploré :** `frontend/src/app/calendar/`, `frontend/src/app/calendar-day/`,
> `frontend/src/app/core/services/calendar-service.ts`, les modèles `core/models/calendar*.model.ts`,
> et l'intégration routeur (`app.routes.ts`) + barre (`core/components/navbar/navbar.ts`).
> **Contexte :** l'onglet « Calendrier » de la barre est présent mais désactivé (cf.
> `.agent/NAVBAR/FEATURE_NAVBAR.md` : « Activation de l'onglet Calendrier… c'est le lot du calendrier »).

Ce document liste ce qui a été **construit** pour le calendrier, organisé par couche, puis recense les
points à combler avant qu'il ne soit activable. Ce n'est pas un plan : c'est un état des lieux.

---

## 1. Arborescence et volume

| Fichier | Rôle | Lignes (TS) |
|---|---|---|
| `calendar/calendar.ts` | Composant principal `Calendar` (`app-calendar`) : construction de la grille, navigation mois à mois | ~192 |
| `calendar/calendar.html` | Gabarit : titre du mois + boutons nav + grille 7 colonnes | ~34 |
| `calendar/calendar.css` | Style « Mes Notes » (carte arrondie, thème violet) | ~60 |
| `calendar/calendar.spec.ts` | Spec minimale (`should create`) | ~18 |
| `calendar-day/calendar-day.ts` | Composant feuille `CalendarDayComponent` (`app-calendar-day`) : affiche un jour et ses événements | ~25 |
| `calendar-day/calendar-day.html` | Gabarit : numéro de jour + liste des titres d'événements | ~14 |
| `calendar-day/calendar-day.css` | Style minimal du composant feuille | ~3 |
| `calendar-day/calendar-day.spec.ts` | Spec minimale (`should create`) | ~18 |
| `core/services/calendar-service.ts` | Service de données SQLite : lecture des événements depuis la table `events` | ~56 |

**Modèles (réutilisés, hors du dossier calendrier) :**
- `core/models/calendar-event.model.ts` — interface `CalendarEvent` (`id`, `title`, `date`, `start_time`, `end_time`, `noteIds`).
- `core/models/calendar-day.model.ts` — interface `CalendarDay` (`date`, `events[]`).
- `core/models/calendar.model.ts` — interface `Calendar` (`days[]`) : **définie mais non utilisée** par le composant (voir §4).

**Intégration transversale :**
- Route `/calendar/:selectedMonthDate` → composant `Calendar` (`app.routes.ts`).
- Onglet « Calendrier » dans `NAVBAR_TABS`, avec `enabled: false`.

---

## 2. Ce qui est fonctionnel

### 2.1 Affichage d'un mois (composant `Calendar`)
- **Construction de la grille** : tableau fixe de **42 cellules** (6 semaines × 7 jours). Les cases du mois courant sont remplies ; les cases des mois précédent/suivant le sont aussi (débordement classique d'un calendrier), et les cases vides avant/après restent `null` → rendues `<div class="empty-cell">`.
- **Calcul du nombre de jours par mois** : `computeDayNumberFromMonth()` gère 28/29 (bissextile via `estBissextile()`, règle grégorienne correcte), 30 et 31.
- **Position du premier jour** : `getWeekDayNumber()` (`(date.getDay() + 6) % 7`) → alignement sur une semaine **lundi-dimanche**, cohérent avec les en-têtes `L M M J V S D`.
- **Remplissage par jour** : `fillCalendarArray()` interroge `getEventsFromDate(day)` pour chaque case remplie et y attache un `CalendarDay`.
- **Navigation** : boutons précédent/suivant dans le gabarit, déclarrant `goToPreviousMonth()` / `goToNextMonth()` qui naviguent vers `/calendar/{mois}`.
- **Synchronisation avec l'URL** : au montage, `paramMap` récupère `:selectedMonthDate`, initialise les mois adjacents et construit la grille (`buildSelectedMonthCalendar()`).

### 2.2 Rendu d'un jour (composant `CalendarDayComponent`)
- Affiche le **numéro de jour** (`{{ dayDate.date | date:'dd/MM' }}`) et, en dessous, une liste `<ul>` des **titres** des événements du jour (`@for … track calendarEvent.id`).

### 2.3 Service de données (`CalendarService`)
- Hérite de `SqliteService`, injecté en racine (`providedIn: 'root'`).
- **`mapRowToEvent(row)`** : mappe une ligne brute (colonnes snake_case) vers `CalendarEvent`, par défaut `start_time`, `end_time` vides et `noteIds = []`.
- **`getEventsFromDate(date)`** : `SELECT * FROM events WHERE date = ?` → événements d'un jour précis. **Utilisé par le composant.**
- **`getEventsFromRangedDate(month_date)`** : `SELECT * FROM events WHERE strftime('%Y-%m', date) = ?` → tous les événements du mois. **Défini mais non appelé** (le composant préfère appeler `getEventsFromDate()` par jour).

---

## 3. Ce qui manque / à combler avant activation

> Ces points sont des constats faits en explorant le code ; aucun n'a été vérifié par exécution.

### 3.1 Données — le plus gros blocage
- **Aucun écrit d'événements** : aucune fonction `insert`/`upsert` sur la table `events`, et **aucune migration ne crée cette table** (seules `kanban_cards`, etc. sont gérées par `SchemaMigrationService`). La table `events` proviendrait donc d'une base seed externe, ou n'existe pas encore → le calendrier n'affichera **aucun événement** tant qu'il n'y en a pas.
- **Aucun chemin de saisie** : rien n'ouvre l'écran d'ajout/modification d'un événement depuis le calendrier (pas de route `/calendar/:mois/new|edit`, ni composant `CalendarEventEditor`).

### 3.2 Fonctionnalités non implémentées dans l'affichage
- **Pas de mise en évidence du jour courant** : les classes `.today` et `.selected` existent en CSS mais **rien ne les applique**.
- **Pas d'heure des événements** : le modèle garde `start_time` / `end_time`, mais le gabarit n'en affiche que le titre.
- **Pas de distinction visuelle du mois courant** : la classe `.other-month` est appliquée, mais il n'existe pas de classe pour mettre en valeur les jours du mois affiché (seule la teinte « autre mois » opère).
- **Aucun clic / navigation intra-jour** : les cellules sont `cursor: pointer` mais ne déclarent aucune action (`calendar-day.ts` n'a ni `output()`, ni routeur d'ouverture).

### 3.3 Code à nettoyer / incohérences
- **`getEventsFromRangedDate()` orphelin** : méthode complète et correcte, jamais appelée → code mort à supprimer ou réemployer (le composant ferait gagner des requêtes en interrogeant le mois une seule fois au lieu de jour par jour).
- **`calendar.model.ts` inutilisé** : l'interface `Calendar { days: readonly CalendarDay[] }` n'est pas utilisée ; le composant manipule directement un tableau `(CalendarDay | null)[]`. Soit on l'adopte (filtrage des `null` pour respecter le modèle), soit on la supprime.
- **Lecture du mois courant via `window.location.pathname`** : `getSelectedMonthDate()` re-décompose l'URL au lieu d'utiliser directement `ActivatedRoute`, alors que `paramMap` fournit déjà la valeur — redondance à supprimer.

### 3.4 Tests insuffisants
- Les specs ne couvrent que `should create` pour chaque composant et le service : **aucun test de logique** (construction de la grille, bissextile, mapping SQL → modèle, navigation). À écrire avant activation.

---

## 4. Récapitulatif par couche

| Couche | État |
|---|---|
| Composants (`Calendar`, `CalendarDay`) | ✅ Structure et logique de rendu d'un mois posées ; ❌ pas d'interaction, pas de « today », pas d'affichage des horaires |
| Templates / styles (`.html`, `.css`) | ✅ Grille 42 cases, en-tête nav, thème « Mes Notes » soigné |
| Service (`CalendarService`) | ⚠️ Lecture par jour et par mois OK ; ❌ méthode de mois orpheline ; **aucun écrit** |
| Modèle `calendar.model.ts` | ⚠️ Défini mais non utilisé |
| Route `/calendar/:selectedMonthDate` | ✅ Existante ; ⚠️ la valeur du paramètre n'est décidée nulle part (choisie par l'URL) |
| Onglet navbar « Calendrier */ | ✅ Présent, ❌ `enabled: false` (cohérent avec le plan : activation réservée à ce lot) |
| Table `events` / migration | ❌ Absente du schéma ; aucun écrit → **blocage principal pour l'affichage réel** |
| Tests | ⚠️ Uniquement « should create » |

---

## 5. Prochaines étapes suggérées (ordre de priorité)

1. **Données** : créer la table `events` dans les migrations (`id`, `title`, `date`, `start_time`, `end_time`, `note_ids`) et ajouter un chemin d'écriture (service + écran d'édition).
2. **Tests** : couvrir le service (mapping SQL → modèle) et le composant (construction de la grille, bissextile, navigation).
3. **Affichage** : appliquer `.today` / `.selected`, afficher les horaires, distinguer visuellement le mois courant.
4. **Nettoyage** : supprimer `getEventsFromRangedDate()` orpheline et l'usage redondant de `window.location.pathname` ; réconcilier avec `calendar.model.ts`.
5. **Activation** : basculer `enabled: true` sur l'onglet navbar une fois les points 1–4 satisfaits.
