# Commandes utiles pour le projet Family-notes

> **Toutes les commandes se lancent depuis la racine du dépôt** et montent `frontend` dans le
> conteneur. C'est là que vivent `package.json`, `angular.json`, `capacitor.config.ts` et le
> dossier `android` — il n'y a pas de `package.json` à la racine.
>
> `${PWD}` et `${HOME}` sont valides en bash comme en PowerShell : les commandes se collent telles
> quelles dans les deux.

## 1. Configuration Capacitor & Android (à faire une seule fois)

Déjà fait sur ce projet : `frontend/android` et `frontend/capacitor.config.ts` sont dans le dépôt.
Conservé pour mémoire :

```powershell
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts sh -c "npm install @capacitor/core @capacitor/cli @capacitor/android && npx cap init 'Family Notes' com.familynotes.app --web-dir dist/project_tmp/browser && npx cap add android"
```

> `--web-dir` vaut `dist/project_tmp/browser` : depuis Angular 17, le build écrit dans un
> sous-dossier `browser/`. C'est la valeur présente dans `capacitor.config.ts`.

## 2. Build du Frontend (Angular)

Compile le projet et génère les fichiers statiques dans `frontend/dist/project_tmp/browser`.

```powershell
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npm run build
```

## 3. Build Mobile (Android APK)

### 3.1 Construire l'image de build (à faire une seule fois)

```powershell
docker build -t family-notes-builder -f frontend/Dockerfile.build frontend
```

**Note :** la première exécution est longue (SDK Android à télécharger).

### 3.2 Préparer le keystore de debug (à faire une seule fois)

Ce qui compte, c'est le montage `-v "${HOME}/.android:/root/.android"` de l'étape 3.3 : Gradle y
conserve le `debug.keystore` d'un build à l'autre. Docker crée le dossier hôte s'il manque, donc la
commande ci-dessous n'est utile **que sous Linux**, où il serait créé en root et deviendrait
inaccessible à adb et Android Studio :

```bash
mkdir -p ~/.android
```

Si Android Studio ou adb sont installés, le dossier existe déjà avec sa clé : il n'y a rien à faire,
et l'APK sera signé avec la même clé que celle utilisée depuis Android Studio.

Sans ce montage, Gradle **régénère une clé de signature à chaque build**.
L'APK suivant n'a alors plus la même signature que celui installé sur le téléphone : Android refuse
la mise à jour (`INSTALL_FAILED_UPDATE_INCOMPATIBLE`) et impose une désinstallation, **ce qui efface
les notes enregistrées sur l'appareil**.

### 3.3 Générer l'APK

```bash
docker run --rm -v "${PWD}/frontend:/app" -v "${HOME}/.android:/root/.android" -v family-notes-gradle:/root/.gradle family-notes-builder bash -c "npm ci && npm run build && npx cap sync android && cd android && gradle --no-daemon assembleDebug; chown -R $(id -u):$(id -g) /app /root/.android"
```

> Le `chown` final n'est utile que **sous Linux** : le conteneur tourne en root, et sans lui
> `node_modules`, `dist`, `.angular/cache` et le keystore se retrouvent root sur l'hôte — ce qui
> casse ensuite les commandes locales (`ng build`, `ng serve`, `adb`). Il est séparé par `;` pour
> s'exécuter même si le build échoue. `$(id -u)` est évalué par votre shell avant `docker run`.

- `~/.android` monté : même clé de signature d'un build à l'autre (cf. 3.2). Attention, le premier
  APK produit après ce changement peut encore être refusé si celui déjà installé a été signé par une
  clé jetable d'un build précédent — sauvegardez la base avant de désinstaller (cf. 3.4) ;
- volume `family-notes-gradle` : sans lui, Gradle retélécharge toutes ses dépendances à chaque build ;
- `npm ci` plutôt que `npm install` : le `package-lock.json` est présent, l'installation est
  reproductible ;
- `npx cap sync` est **obligatoire** : c'est lui qui copie dans l'APK le build web *et* les assets
  `assets/migrations/*.sql` que l'application charge au démarrage pour migrer son schéma. Sans eux,
  l'app démarre mais n'affiche plus les notes ;
- `gradle` et non `./gradlew` : le dépôt ne contient pas `android/gradle/wrapper/gradle-wrapper.jar`
  (et `gradlew` n'a pas le bit d'exécution), donc le wrapper est inutilisable. Gradle 8.11.1 est
  installé dans l'image de build, à la même version que
  `android/gradle/wrapper/gradle-wrapper.properties`.

**L'APK est généré dans :** `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

### 3.4 Installer sur le téléphone

```powershell
adb install -r frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

`-r` réinstalle **en conservant les données** (donc les notes). Si l'installation échoue pour cause
de signature, c'est le keystore qui a changé (cf. 3.2) — ne désinstallez pas sans avoir sauvegardé :

```powershell
adb exec-out run-as com.familynotes.app cat databases/family_notesSQLite.db > sauvegarde_notes.db
```

(`run-as` ne fonctionne que sur un build debug.)

## 4. Pièges connus

- **Droits root sur les fichiers générés.** Les conteneurs tournent en root : `npm ci` et les builds
  lancés via Docker laissent `frontend/node_modules`, `frontend/.angular/cache` et `frontend/dist`
  appartenant à `root`, ce qui fait ensuite échouer un `ng build` ou un `ng serve` lancé localement
  (`EACCES: permission denied, rmdir …`). Sous Linux, ajouter `-u "$(id -u):$(id -g)"` aux
  `docker run` (et `-e HOME=/tmp/home` avec les montages adaptés pour les commandes Gradle). Pour
  réparer l'existant : `sudo chown -R $USER frontend/node_modules frontend/.angular frontend/dist`.
- **Version de Node.** Angular CLI 21 exige `^20.19.0 || ^22.12.0 || >=24.0.0`. L'image de build est
  en Node 22 LTS ; pour les commandes ponctuelles, utiliser `node:lts` plutôt que `node:20-alpine`,
  dont les anciennes révisions (< 20.19) sont refusées.
- **Wrapper Gradle absent.** `android/gradle/wrapper/gradle-wrapper.jar` n'est pas versionné et
  `android/gradlew` n'est pas exécutable : `./gradlew` échoue (`Could not find or load main class
  org.gradle.wrapper.GradleWrapperMain`). Les builds passent par le `gradle` de l'image, qui ignore
  `gradle-wrapper.properties` — c'est donc la version du Dockerfile qui fait foi. Si vous ouvrez
  `frontend/android` dans Android Studio, il réclamera le wrapper : laissez-le le régénérer, ou
  lancez une fois `gradle wrapper --gradle-version 8.11.1` dans le conteneur et versionnez le
  résultat.
- **Versions Capacitor.** `@capacitor/core`, `@capacitor/android` et les plugins sont en **8.x**
  (leur `peerDependencies` exige `@capacitor/core >= 8.0.0`), alors que `@capacitor/cli` est resté en
  **7.6.9**. Le projet natif a donc été généré par le template v7 : `android/variables.gradle` est
  passé à `compileSdkVersion = 36` et `android/build.gradle` à AGP **8.9.1** pour satisfaire
  `androidx.browser:browser:1.9.0` (tiré par `@capacitor/browser@8`), sans quoi le build échoue sur
  `checkDebugAarMetadata`. `targetSdkVersion` reste à 35 : la monter changerait le comportement
  d'exécution, ce n'est pas nécessaire ici. Pour aligner proprement : `npm i @capacitor/cli@^8`
  puis `npx cap migrate` — attention, AGP 8.11+ exigerait Gradle 8.13, donc il faudrait monter la
  version de Gradle dans le Dockerfile.
- **Fichiers binaires absents du dépôt.** `android/` a été versionné sans aucun de ses fichiers
  binaires : `gradle/wrapper/gradle-wrapper.jar`, `res/drawable*/splash.png` et les icônes
  `res/mipmap-*/ic_launcher*.png`. Le build échouait sur `resource drawable/splash not found` ; les
  images ont été restaurées depuis le template officiel
  (`node_modules/@capacitor/cli/assets/android-template.tar.gz`). Si d'autres ressources binaires
  manquent un jour, c'est là qu'il faut les reprendre.
- **Après tout changement de schéma SQL.** Les scripts de `frontend/public/assets/migrations/` sont
  embarqués par le build : un `npm run build` suivi de `npx cap sync` est nécessaire pour qu'ils
  arrivent sur l'appareil (cf. `scripts/README.md`).

## Docker Compose

Commandes pour gérer l'environnement complet (DB, Backend, Frontend).

**Lancer l'environnement :**
```powershell
docker-compose up --build
```

**Arrêter l'environnement :**
```powershell
docker-compose down
```

**Voir les logs en temps réel :**
```powershell
docker-compose logs -f
```

## 5. Génération Angular (via Docker)

Pour générer des fichiers Angular sans installer l'Angular CLI localement :

**Générer un service :**
```powershell
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx @angular/cli generate service <chemin/nom-du-service>
```

**Générer un composant :**
```powershell
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx @angular/cli generate component <chemin/nom-du-composant>
```

**Générer une classe (modèle) :**
```powershell
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx @angular/cli generate class <chemin/nom-du-modele>
```

*Note : pour ne pas générer de fichiers de tests (`.spec.ts`), ajoutez `--skip-tests`.*

**Lancer l'application en dev :**
```powershell
docker run --rm -it -p 4200:4200 -v "${PWD}/frontend:/app" -w /app node:lts npx ng serve --host 0.0.0.0
```

**Faire le build :**
```powershell
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx ng build
```

**Construire et lancer un conteneur pour le dev :**
```powershell
docker build --target development -t family-notes-web ./frontend

docker run --rm -it -p 4200:4200 -v "${PWD}/frontend:/app" -v /app/node_modules family-notes-web
```

**Lancer les tests :**
```powershell
docker run --rm -it -v "${PWD}/frontend:/app" -w /app node:lts npx ng test --watch=false

docker run --rm -it -v "${PWD}/frontend:/app" -w /app node:lts npx ng test --watch=false --filter="fonctionATester"
```

## 6. Synchronisation des Plugins (Capacitor)

Après avoir installé un nouveau plugin (ex. `@capacitor-community/sqlite`), synchroniser Capacitor
pour que les changements arrivent dans les dossiers natifs :

```powershell
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts npx cap sync
```

## 7. Publication web (GitHub Pages)

L'application tourne aussi dans un navigateur : `jeep-sqlite` fournit SQLite en WebAssembly
(`sql.js`), sans backend. GitHub Pages la sert depuis un **sous-dossier**, pas depuis la racine du
domaine :

```
https://borismerminod.github.io/family-notes/
```

Tout ce qui suppose la racine (`/`) casse donc une fois en ligne (cf. 7.4).

### 7.1 Build pour Pages

```bash
docker run --rm -v "${PWD}/frontend:/app" -w /app node:lts sh -c "npx ng build --base-href /family-notes/ && cp dist/project_tmp/browser/index.html dist/project_tmp/browser/404.html"
```

- `--base-href /family-notes/` remplace au build le `<base href="/" />` de `src/index.html`, qu'il
  ne faut **pas** modifier : l'APK et `ng serve` en ont besoin tel quel ;
- la copie en `404.html` gère les routes profondes : Pages ne connaît que les vrais fichiers, et un
  rafraîchissement sur `/family-notes/notes/edit/3` renverrait une 404. Pages sert alors
  `404.html`, c'est-à-dire l'application, et le routeur Angular reprend la main. L'autre solution
  est `withHashLocation()` dans `app.config.ts` (URL en `/#/notes`) ;
- le `cp` se fait **dans** le conteneur : `dist` appartient à root sur l'hôte (cf. §4).

### 7.2 Tester le build en local sous le même sous-dossier

Monter le build dans `/srv/family-notes` reproduit le chemin de Pages :

```bash
docker run --rm -p 8080:8080 -v "${PWD}/frontend/dist/project_tmp/browser:/srv/family-notes" -w /srv node:lts npx http-server -p 8080 -c-1
```

Puis ouvrir `http://localhost:8080/family-notes/`. Dans la console du navigateur, aucune requête vers
`/assets/...` sans le préfixe `/family-notes/` ne doit apparaître (wasm, migrations, base de
départ). Le repli sur `404.html` n'est pas reproduit ici : il est servi à la racine de `/srv`, pas
dans le sous-dossier. Les routes profondes se vérifient donc en ligne.

### 7.3 Déploiement automatique (GitHub Actions)

Le workflow est en place : [`.github/workflows/pages.yml`](../.github/workflows/pages.yml). Il se
déclenche à chaque `push` sur `main`, et à la main depuis l'onglet *Actions* (*Run workflow*). Il
enchaîne :

1. **job `build`** : checkout, Node **22** (cf. « Version de Node » au §4) avec le cache npm, puis
   dans `frontend/` : `npm ci`, `ng build --base-href "/<nom du dépôt>/"` et la copie `404.html`
   du 7.1. Le build est ensuite envoyé avec `actions/upload-pages-artifact`. Le base href est tiré
   du nom du dépôt : renommer le dépôt ne casse rien ;
2. **job `deploy`** : publication avec `actions/deploy-pages`, dans l'environnement
   `github-pages`. L'URL du site s'affiche sur le résumé du run.

**Réglage unique, à faire sur GitHub** : *Settings → Pages → Build and deployment → Source :
**GitHub Actions***. Sans lui, le job `deploy` échoue.

Pas de Docker dans le workflow : la règle « tout passe par Docker » vaut pour la machine de dev, pas
pour les runners GitHub.

### 7.4 Pièges propres au web

- **`jeep-sqlite` charge le wasm depuis `/assets` en dur**, c'est la valeur par défaut de son
  attribut `wasmpath`. Sous Pages, `sql-wasm.wasm` serait introuvable et SQLite ne démarrerait
  pas. **Corrigé** : `DatabaseService.initializeWebStore()` pose `wasmpath="assets"` (relatif, donc
  résolu par rapport au `<base href>`) sur l'élément `<jeep-sqlite>` avant son ajout au DOM.
- **`copyFromAssets` lit `/assets/databases/databases.json` en dur**, et ce chemin n'est pas
  réglable. Au premier lancement, la copie de la base de départ échoue
  (`CopyFromAssets: no databases.json file in /assets/databases folder`). **Corrigé** dans
  `DatabaseService.copySeedDatabase()` : sur le web, la base est chargée avec
  `getFromHTTPRequest('assets/databases/family_notesSQLite.db', false)`.
  `jeep-sqlite` passe par la même routine de copie que `copyFromAssets`, mais avec l'URL fournie,
  qui est relative et suit donc le `<base href>`. La base est enregistrée sous le même nom,
  `family_notesSQLite.db`. Sur Android, on garde `copyFromAssets`, car une URL relative n'y a
  pas de sens.
- **Pas d'URL absolue dans les CSS de composant.** `url("/icons/trash.svg")` ignore le
  `<base href>` : sous Pages, le navigateur cherche `borismerminod.github.io/icons/…`, et l'icône
  disparaît (le « + » d'ajout, la corbeille…). **Corrigé** : les icônes sont référencées par un
  chemin relatif au fichier CSS, vers le dossier `public` (`url("../../../public/icons/trash.svg")`
  depuis `src/app/<composant>/`). Le build copie alors le SVG dans `media/` et réécrit l'URL en
  `./media/trash-<hash>.svg`, qui suit le `<base href>`. Toute nouvelle icône doit suivre la même
  règle.
- **Les migrations, elles, sont déjà relatives** (`assets/migrations`, dans
  `SchemaMigrationService`) : elles suivent le `<base href>` sans rien changer.
- **Les données restent dans le navigateur** (IndexedDB) : une base par navigateur et par appareil,
  sans lien avec celle de l'APK. Vider les données du site efface les notes.
- **Le site est public**, même avec un dépôt privé (sauf offre Enterprise). Seul le code est exposé,
  puisque les notes restent sur l'appareil. Un dépôt privé demande une offre payante pour avoir Pages.
