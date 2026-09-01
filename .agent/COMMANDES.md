# Commandes utiles pour le projet Family-notes

## 1. Configuration Capacitor & Android (À faire une seule fois)
Cette commande installe Capacitor dans votre projet et prépare le dossier Android. Elle est conçue pour fonctionner dans un dossier qui contient déjà un projet Angular.

```powershell
docker run --rm -v "${PWD}:/app" -w /app node:20-alpine sh -c "npm install @capacitor/core @capacitor/cli @capacitor/android && npx cap init 'Family Notes' com.familynotes.app --web-dir dist/project_tmp && npx cap add android"
```

## 2. Build du Frontend (Angular)
Compile le projet Angular et génère les fichiers statiques dans `dist/project_tmp`.

```powershell
docker run --rm -v "${PWD}:/app" -w /app node:20-alpine npm run build
```

## 3. Build Mobile (Android APK)
Utilise l'image de build pour compiler l'APK de debug.

**Note :** La première exécution est longue car elle doit construire l'image Docker contenant le SDK Android.

### 1. Construire l'image de build (À faire une seule fois)
```powershell
docker build -t family-notes-builder -f frontend/Dockerfile.build frontend
```

### 2. Générer l'APK (À chaque fois que vous voulez un nouvel APK)
```powershell
docker run --rm -v "${PWD}:/app" family-notes-builder bash -c "npm install && npm run build && npx cap sync && cd android && ./gradlew assembleDebug"
```

**L'APK sera disponible dans :** `frontend/android/app/build/outputs/apk/debug/app-debug.apk`

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
