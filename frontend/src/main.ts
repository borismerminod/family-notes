import { bootstrapApplication } from '@angular/platform-browser';
import { defineCustomElements as defineJeepSqlite } from 'jeep-sqlite/loader';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Enregistre le custom element <jeep-sqlite> (moteur SQLite/WASM pour le web)
defineJeepSqlite(window);

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
