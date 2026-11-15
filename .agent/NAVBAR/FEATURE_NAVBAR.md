---
name: navbar
description: Barre de navigation partagée entre la liste des notes et la liste des kanbans — trois onglets Notes / Kanbans / Calendrier, le dernier visible mais inactif tant que le calendrier n'est pas livré.
status: validé le 2026-11-14
date: 2026-11-14
---

# Explication du développement à réaliser

L'application compte aujourd'hui deux écrans de liste — « Mes Notes » (`/notes`) et « Mes Kanbans »
(`/kanban`) — et **aucun moyen de passer de l'un à l'autre**. Les deux routes existent bien dans
`app.routes.ts`, mais rien dans l'interface n'y conduit : la seule façon d'atteindre la liste des
kanbans est de saisir son adresse, ce qui est impossible dans l'application Android. La page Kanban
est donc livrée mais inatteignable pour l'utilisateur. Ce manque était déjà identifié dans
`.agent/KANBAN/CRUD/FEATURE_KANBAN_CRUD.md` (**son** hypothèse H5, laissée ouverte, et « menu de
navigation global » explicitement renvoyé à un lot ultérieur) : c'est ce lot-ci. Attention à la
lecture : les hypothèses `H1` à `H8` citées dans la suite appartiennent **au présent document** et
sont listées en fin de page ; leur numérotation est indépendante de celle du document kanban.

Nous ajoutons une **barre de navigation** présentant **trois onglets** :

- **Notes** — mène à la liste des notes ;
- **Kanbans** — mène à la liste des tableaux kanban ;
- **Calendrier** — **affiché mais inactif** dans ce lot.

L'onglet Calendrier est volontairement présent dès maintenant, dans son état désactivé, pour deux
raisons : l'utilisateur voit tout de suite les trois univers prévus par le plan global
(`PLAN_GLOBAL.md` §2.A, §2.B, §2.C), et surtout **la barre n'aura pas à être retouchée** le jour où
le calendrier sera branché — il suffira de l'activer. Le module calendrier n'est en effet pas en
état d'être ouvert : le composant `Calendar` est encore largement en chantier (son calcul de jours
est commenté) et sa route exige un paramètre de mois (`calendar/:selectedMonthDate`) dont personne
ne décide aujourd'hui la valeur.

La barre est un **composant partagé unique**, intégré dans les **deux écrans de liste seulement**.
Les écrans d'édition (éditeur de note, éditeur de tableau) et le calendrier n'en reçoivent pas dans
ce lot : ce sont des écrans de travail que l'on quitte par un retour, pas des destinations de
premier niveau. Un seul composant, donc un seul endroit à modifier et une barre rigoureusement
identique d'un écran à l'autre, sur le modèle des composants déjà partagés (`ConfirmDialog`,
`NotePicker`, dans `frontend/src/app/core/components/`).

Ce lot n'introduit **aucune donnée nouvelle** : pas de table, pas de service, pas de préférence
persistée. La barre lit la route courante pour savoir quel onglet mettre en évidence, et déclenche
une navigation vers une route qui existe déjà.

Côté ergonomie, la barre est une **barre basse fixée en bas de l'écran**, convention des
applications mobiles et emplacement que le pouce atteint naturellement (H1). Le **bouton flottant
« + »** des deux listes, aujourd'hui ancré dans ce même coin bas, **reste flottant et remonte
au-dessus de la barre** (H2) : il garde sa forme et son rôle, la barre ne reprend aucune action
propre à un écran. La réserve de place en bas des deux listes est recalculée en conséquence — ce qui
corrige au passage un défaut **déjà présent** sur la liste des kanbans, où le « + » recouvre la
dernière carte faute de réserve suffisante. Les onglets portent des **libellés textuels seuls**,
sans icône (H4).

# Périmètre

**Inclus :**

- Un composant de barre de navigation partagé, rangé avec les autres composants partagés.
- Trois onglets : **Notes**, **Kanbans**, **Calendrier**, en **libellés textuels seuls**.
- Barre **basse, fixée en bas de l'écran**, respectant la zone système du téléphone.
- Navigation vers `/notes` et vers `/kanban` depuis n'importe lequel des deux écrans de liste.
- Mise en évidence de l'onglet correspondant à l'écran affiché.
- Onglet **Calendrier visible mais inactif** : il ne navigue pas, il n'est pas atteignable au
  clavier et il est annoncé comme désactivé aux technologies d'assistance.
- Intégration de la barre dans **`note-list`** et dans **`kanban-list`**, et dans ces deux écrans
  uniquement.
- **Remontée du bouton flottant « + »** au-dessus de la barre, sur les deux listes.
- **Recalcul de la réserve de place en bas des deux listes** sur la hauteur de la barre plus celle
  du « + », ce qui inclut la **correction du recouvrement déjà constaté** sur la liste des kanbans
  (`frontend/src/app/kanban-list/kanban-list.css:88` ne réserve que 24 px, contre 110 px sur la
  liste des notes : le « + » y masque donc déjà la dernière carte, barre ou pas).
- Cohabitation vérifiée avec ce que chaque écran porte déjà : bouton flottant « + » (les deux
  listes), champ de recherche (notes), compteur de tableaux (kanbans), popup de confirmation de
  suppression (les deux), états chargement / vide / erreur.

**Hors périmètre (lots ultérieurs) :**

- **Activation de l'onglet Calendrier** et choix du mois ouvert par défaut : c'est le lot du
  calendrier, qui n'aura à modifier que l'état de cet onglet.
- Barre de navigation dans l'éditeur de note, dans l'éditeur de tableau et dans le calendrier.
- Quatrième onglet (assistant IA, réglages…), badges de notification, compteurs sur les onglets.
- **Icônes d'onglet** : aucune n'est produite dans ce lot, qui s'en tient aux libellés (H4).
- **Message éphémère au toucher de l'onglet Calendrier** : aucun mécanisme de ce genre n'est
  introduit (H3).
- Mémorisation du dernier onglet visité pour le rouvrir au démarrage : `/` continue de rediriger
  vers `/notes`.
- Animation de transition entre les deux listes.
- Geste de balayage horizontal pour changer d'onglet.
- Menu latéral, fil d'Ariane, bouton de retour matériel Android : inchangés.
- Refonte visuelle des deux écrans de liste : seule l'insertion de la barre est au programme.
- **Thème sombre de la liste des notes** : `note-list.css` n'en a aucun, contrairement à
  `kanban-list.css:32`, et ce lot ne l'ajoute pas ; la barre y hérite du thème clair de l'écran.

# User Stories

**US1 : Passer d'une liste à l'autre**

- **En tant qu'** utilisateur de Family Notes,
- **je veux** basculer de la liste de mes notes à la liste de mes tableaux kanban en une touche,
- **afin d'** atteindre mes tableaux sans avoir à saisir une adresse, ce qui est aujourd'hui
  impossible sur le téléphone.
- **Critères d'acceptation :**
    - La barre est visible sur la liste des notes et sur la liste des kanbans.
    - Depuis la liste des notes, toucher l'onglet **Kanbans** affiche la liste des kanbans.
    - Depuis la liste des kanbans, toucher l'onglet **Notes** affiche la liste des notes.
    - Toucher l'onglet de l'écran **déjà affiché** ne provoque aucun effet visible : pas de
      rechargement de la liste, pas de perte de la recherche en cours.
    - L'écran d'arrivée est pleinement fonctionnel : sa liste se charge, son bouton « + » et ses
      actions de carte répondent comme s'il avait été ouvert directement.
    - Le bouton de retour matériel ramène à l'écran précédemment affiché.

**US2 : Savoir sur quel onglet je me trouve**

- **En tant qu'** utilisateur,
- **je veux** voir quel onglet correspond à l'écran affiché,
- **afin de** me repérer dans l'application.
- **Critères d'acceptation :**
    - Sur la liste des notes, l'onglet **Notes** est mis en évidence ; sur la liste des kanbans,
      c'est l'onglet **Kanbans**.
    - Un seul onglet est mis en évidence à la fois.
    - La mise en évidence ne repose pas uniquement sur la couleur : elle reste perceptible sans
      distinction fine des couleurs.
    - L'onglet actif est annoncé comme tel aux technologies d'assistance.
    - La mise en évidence suit l'écran réellement affiché, y compris lorsque l'écran est atteint
      autrement que par la barre (ouverture directe de la route, retour matériel).

**US3 : Voir l'onglet Calendrier, annoncé mais encore inactif**

- **En tant qu'** utilisateur,
- **je veux** voir que l'application prévoit un calendrier, même s'il n'est pas encore disponible,
- **afin de** savoir ce qui arrive et de ne pas chercher une fonctionnalité absente.
- **Critères d'acceptation :**
    - L'onglet **Calendrier** est **affiché** dans la barre, à côté des deux autres.
    - Il est visuellement **désactivé** (grisé, atténué) et se distingue sans ambiguïté des deux
      onglets actifs.
    - Le toucher **ne produit aucun effet** : l'écran affiché ne change pas, et **rien** n'apparaît
      — ni message, ni erreur, ni retour visuel d'appui (H3). L'état grisé est le seul signal.
    - Il n'est pas atteignable par la navigation au clavier et il est annoncé comme désactivé aux
      technologies d'assistance.
    - Il n'est **jamais** mis en évidence comme onglet actif.
    - Son activation future ne demande aucune autre modification de la barre que la levée de cet
      état désactivé : ni libellé à changer, ni onglet à insérer, ni mise en page à revoir.

**US4 : Retrouver la même barre, au même endroit, sur les deux écrans**

- **En tant qu'** utilisateur,
- **je veux** que la barre se présente exactement de la même façon sur les deux listes,
- **afin de** ne pas avoir à réapprendre la navigation d'un écran à l'autre.
- **Critères d'acceptation :**
    - Les trois onglets apparaissent dans le **même ordre** et avec les **mêmes libellés** sur les
      deux écrans.
    - La barre est **fixée en bas de l'écran** sur les deux écrans, à la même hauteur et avec les
      mêmes dimensions (H1).
    - Elle **ne défile pas avec la liste** : elle reste à sa place, et donc atteignable sans faire
      défiler la page, quelle que soit la longueur de la liste.
    - Elle se comporte correctement dans les états particuliers des deux écrans : chargement, liste
      vide, erreur de chargement, bandeau d'erreur de suppression.
    - Elle ne recouvre pas la popup de confirmation de suppression et ne la rend pas inopérante.
    - Elle respecte les zones réservées du téléphone — en particulier **la zone système basse**,
      dont elle tient compte dans sa hauteur : aucun onglet n'est partiellement masqué ni
      inatteignable, sur un appareil avec barre de navigation système comme sur un appareil sans.
    - Sur chaque écran, la barre **suit le thème de cet écran**. Le thème sombre n'est vérifiable que
      sur la liste des kanbans : celle des notes n'a pas de thème sombre et ce lot ne le lui ajoute
      pas. En thème clair, la barre s'affiche correctement sur les deux écrans.

**US5 : Continuer à utiliser les actions propres à chaque écran**

- **En tant qu'** utilisateur,
- **je veux** que la barre n'empêche rien de ce que je faisais déjà sur ces deux écrans,
- **afin de** ne pas perdre une fonctionnalité en gagnant la navigation.
- **Critères d'acceptation :**
    - Le bouton flottant « + » des deux listes **reste flottant** et **remonte au-dessus de la
      barre** (H2) : il garde sa forme ronde, sa taille et son ancrage à droite, et c'est toujours
      lui — et non un bouton porté par la barre — qui ouvre la création.
    - Le « + » est **entièrement visible et touchable**, et **ne chevauche aucun onglet** : la barre
      ne le recouvre pas, il ne recouvre pas la barre.
    - La réserve de place en bas de **chacune des deux listes** est au moins égale à **la hauteur de
      la barre, plus celle du « + » remonté, plus la zone système basse**. Conséquence chiffrée :
      les 110 px que la liste des notes réserve aujourd'hui (`note-list.css:81`) ne suffisent plus
      et doivent être augmentés d'autant, et les **24 px** de la liste des kanbans
      (`kanban-list.css:88`) sont **corrigés dans ce lot** — c'est aujourd'hui un défaut déjà
      visible, le « + » masquant la dernière carte sur cet écran.
    - Le **dernier élément** de chaque liste est, après ce recalcul, consultable et touchable **en
      entier** quand on déroule jusqu'en bas : ni la barre ni le « + » ne le tronquent. À vérifier
      sur les deux écrans.
    - Sur la liste des notes, le champ de **recherche** reste visible et utilisable, et le clavier
      virtuel ouvert ne casse pas la mise en page de la barre.
    - Sur la liste des kanbans, le **compteur de tableaux** reste visible.
    - L'icône corbeille de chaque carte reste touchable, sans que la barre n'intercepte le toucher.

# Questions ouvertes / hypothèses

Les quatre points d'ergonomie posés à l'ouverture de ce lot ont été **tranchés le 2026-11-14** ;
plus aucune question n'est en attente dans ce document.

- **H1 — Emplacement de la barre** — *tranchée le 2026-11-14* : **barre basse, fixée en bas de
  l'écran**, tenant compte de la zone système basse du téléphone (`--safe-bottom`, déjà déclarée
  dans les deux feuilles de style). C'est la convention des applications mobiles et l'emplacement
  que le pouce atteint naturellement. L'alternative écartée — une rangée d'onglets sous l'en-tête
  `header.topbar` — aurait empilé un troisième bandeau collant sur la liste des notes (titre 30 px
  + recherche) et éloigné les onglets du pouce.
- **H2 — Cohabitation avec le bouton flottant « + »** — *tranchée le 2026-11-14* : le « + » **reste
  flottant et remonte au-dessus de la barre**. Les deux listes l'ancrent aujourd'hui en bas à droite
  (`frontend/src/app/note-list/note-list.css:187`,
  `frontend/src/app/kanban-list/kanban-list.css:201`), là même où se pose désormais la barre. La
  réserve de place en bas des deux listes est recalculée sur la hauteur de la barre plus celle du
  « + ». Écartées : l'intégration du « + » comme action centrale de la barre — qui aurait donné à un
  composant partagé une action différente selon l'écran, contre H6 et US4 — et son déplacement dans
  l'en-tête, qui éloigne l'action principale du pouce.
- **H3 — Retour au toucher sur l'onglet Calendrier** — *tranchée le 2026-11-14* : **aucun retour,
  aucun message**. L'état grisé parle de lui-même, et aucun mécanisme de message éphémère n'est
  introduit (l'application n'en possède aucun : ses seuls retours sont la popup `ConfirmDialog` et
  le bandeau `.action-error` de la liste des kanbans).
- **H4 — Libellés seuls ou icônes** — *tranchée le 2026-11-14* : **libellés textuels seuls**, aucune
  icône d'onglet. Le dossier `frontend/public/icons/` ne contient que `alert`, `edit`, `kanban`,
  `plus`, `search` et `trash` ; une barre à icônes aurait exigé d'en produire deux nouvelles (notes,
  calendrier), ce que ce lot ne fait pas. Le choix ne ferme rien : les libellés restant la source de
  vérité de chaque onglet, des icônes pourront leur être **ajoutées** plus tard sans toucher à la
  navigation ni aux libellés — ce serait un lot d'habillage, hors de celui-ci.
- **H5 — Emplacement du composant dans le code.** Tranché sans question : le composant va dans
  `frontend/src/app/core/components/`, comme `ConfirmDialog` et `NotePicker`, puisqu'il est partagé
  par deux écrans. Le détail du découpage relève de l'approche de développement.
- **H6 — Intégration par écran plutôt que dans la coquille d'application.** Tranché sans question :
  la barre est posée dans les gabarits de `note-list` et de `kanban-list`, et non dans `app.html`
  (qui ne contient que `<router-outlet />`). C'est la seule façon de la limiter aux deux écrans de
  liste sans introduire de règle d'affichage par route. À reconsidérer le jour où une troisième
  destination de premier niveau apparaîtra.
- **H7 — Libellés des onglets.** « Notes », « Kanbans », « Calendrier », au pluriel pour les deux
  premiers par cohérence avec les titres d'écran existants (« Mes Notes », « Mes Kanbans »).
- **H8 — Aucune préférence persistée.** La barre ne retient rien : `/` redirige toujours vers
  `/notes`, et l'application rouvre donc sur la liste des notes.
