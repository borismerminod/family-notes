# CLAUDE.md

**Tout ce qu'il faut savoir sur ce projet est dans [`.agent/AGENT.md`](../.agent/AGENT.md).**

Lis ce fichier **avant toute chose**, à chaque nouvelle session : c'est le point d'entrée du dépôt.
Il indique où trouver :

1. **les commandes pour lancer le projet** — tout passe par Docker, rien ne s'exécute sur l'hôte
   (ni Node, ni Angular CLI) ;
2. **les procédures de développement par fonctionnalité** — les documents de conception rangés en
   `.agent/<FONCTIONNALITE>/<SOUS_FONCTIONNALITE>` (par exemple `.agent/KANBAN/CRUD`) ;
3. **les skills lançables** — un dossier par skill dans `.agent/skill/`, à consulter avant
   d'improviser une procédure ;
4. **les règles d'implémentation** — stack Angular 21 / Vitest / Capacitor, SOLID, clean code,
   nommage, lisibilité et placement des commentaires.

Ne reconstruis pas ces informations depuis le code : `.agent/AGENT.md` et les documents qu'il cite
font foi.
