import { Injectable } from '@angular/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { Capacitor } from '@capacitor/core';



@Injectable({
  providedIn: 'root',
})
export class SqliteService {
  protected sqlite: SQLiteConnection
  protected db!: SQLiteDBConnection;
  protected readonly DB_NAME = 'family_notes';
  protected readonly isWeb = Capacitor.getPlatform() === 'web';

  // Promesse résolue une fois la base prête ; toute méthode publique l'attend
  // pour éviter d'accéder à this.db avant la fin de l'initialisation.
  protected ready: Promise<void>;

  constructor()
  {
    this.sqlite = new SQLiteConnection(CapacitorSQLite)
    this.ready = this.initializeDatabase() 
  }

  protected async initializeDatabase(): Promise<void> {
    try {
      if (this.isWeb) 
      {
        await customElements.whenDefined('jeep-sqlite');
        const jeepEl: any =
          document.querySelector('jeep-sqlite') ?? document.createElement('jeep-sqlite');
        if (!jeepEl.isConnected) {
          document.body.appendChild(jeepEl);
        }

        if (typeof jeepEl.componentOnReady === 'function') 
        {
          await jeepEl.componentOnReady();
        }
        await this.sqlite.initWebStore();
      }
      
      const alreadyExists = (await this.sqlite.isDatabase(this.DB_NAME)).result;
      if (!alreadyExists) 
      {
        await this.sqlite.copyFromAssets(false);
      }

      this.db = await this.sqlite.createConnection(this.DB_NAME, false, 'no-encryption', 1, false);
      await this.db.open();
      
      console.log('Base de données initialisée avec succès');
    } catch (err) {
      console.error('Erreur lors de l\'initialisation de la base de données', err);
      throw err;
    }
  }

}
