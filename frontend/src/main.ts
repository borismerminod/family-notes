import { bootstrapApplication } from '@angular/platform-browser';
import { defineCustomElement as defineJeepSqlite } from 'jeep-sqlite/dist/components/jeep-sqlite';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Enregistre le custom element <jeep-sqlite> (moteur SQLite/WASM pour le web).
// On utilise le build "standalone" (dist/components) plutôt que jeep-sqlite/loader :
// le loader lazy fait charger deux fois le runtime Stencil avec Vite (une copie
// dans le bundle + une copie pré-optimisée par optimizeDeps), ce qui provoque
// « Couldn't find host element ... unknown to this Stencil runtime » et
// « WebStore is not open yet ». Le build standalone n'a qu'un seul runtime.
defineJeepSqlite();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
