# Plan Global du Projet : Family-notes

## 1. Vision et Philosophie
- **Approche "Local-First"** : Les données appartiennent à l'utilisateur et résident en priorité sur son appareil. La fluidité de l'interface est prioritaire (zéro latence d'entrée).
- **Privacy-First (Vie Privée)** : Confidentialité maximale. Pas de serveur central stockant les données en clair. Chiffrement de bout en bout.
- **Indépendance** : L'application doit rester pleinement fonctionnelle hors connexion (sauf pour la synchronisation).

## 2. Fonctionnalités Principales

### A. Gestion de Notes (Rich Text)
- **Formatage avancé** : Gras, italique, souligné, listes à puces, choix de couleurs de police.
- **Contenu multimédia** : Support des images et des liens cliquables.
- **Intégration Vidéo** : Lecture de vidéos directement depuis un lien.
- **Organisation** : Gestion par catégories.

### B. Planning & Calendrier
- **Événements** : Création d'événements sur un calendrier.
- **Lien avec les Notes** : Possibilité de lier un événement à une note existante.
- **Notifications** : Rappels via notifications sur téléphone.

### C. Système Kanban
- **Tableaux de cartes** : Création de listes et de cartes.
- **Interaction** : Déplacement fluide des cartes d'une liste à une autre (Drag & Drop).

### D. Assistant IA Local (SLM)
- **Technologie** : Modèle de langage léger (Small Language Model) tournant localement sur l'appareil (via NPU/GPU mobile).
- **Capacités (Function Calling) :**
    - **Édition de contenu** : Résumer des notes, reformuler, corriger.
    - **Gestion du Planning** : Créer, modifier ou déplacer des événements par commande textuelle/vocale.
    - **Organisation du Kanban** : Déplacer des cartes, regrouper des tâches, créer des listes intelligentes.

## 3. Architecture Technique & Synchronisation

### A. Stack Technologique
- **Framework Web** : **Angular** (pour la réactivité via RxJS et une architecture modulaire robuste).
- **Conteneur Mobile** : **Capacitor** (pour l'accès aux API natives : Caméra, Notifications, Bluetooth/Wi-Fi P2P, SQLite).
- **Gestion des flux de données** : **RxJS** (essentiel pour la synchronisation en temps réel et la réactivité de l'interface).
- **Stockage Local** : **SQLite** via plugin Capacitor (base de données robuste et chiffrée sur l'appareil).

### B. Modèle de données
- **CRDT (Conflict-free Replicated Data Types)** : Utilisation de structures de données permettant la fusion automatique des modifications sans conflit lors de la synchronisation.

### C. Stratégie de Synchronisation (Hybride Mesh-Relay)
- **Mode Local (P2P)** : Synchronisation directe entre les membres de la famille via le réseau local (Wi-Fi ou Bluetooth).
- **Mode Distant (Relais Chiffré)** : Utilisation de relais passifs de type "Zero-Knowledge" pour permettre la synchronisation à distance sans compromettre la confidentialité (les données transitent mais ne sont pas lisibles par le relais).

## 4. Roadmap de Développement

1. **Étape 1 : Modélisation des données** (Définition des structures techniques pour les Notes, Événements, Cartes et les schémas d'interaction pour l'IA).
2. **Étape 2 : Design de l'interface (UI/UX)** (Maquettes de l'application mobile).
3. **Étape 3 : Développement du moteur de notes** (Éditeur de texte riche).
4. **Étape 4 : Développement du module Planning et Kanban**.
5. **Étape 5 : Implémentation du moteur de synchronisation** (CRDT + couches de transport P2P/Relay).
