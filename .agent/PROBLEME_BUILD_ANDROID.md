# Build APK Android avec Angular + Capacitor + Docker

Ce document décrit la procédure pour générer un APK Android à partir de l'application Angular en utilisant **uniquement Docker**, sans avoir besoin d'installer Node.js, Capacitor, Gradle ou Android Studio sur la machine hôte.

---

## 1. Architecture du projet

Le projet utilise :

* Angular pour le frontend
* Capacitor pour transformer l'application Angular en application Android
* Gradle pour compiler l'application Android
* Docker pour fournir l'environnement de build

Exemple d'organisation :

```text
Family-notes/
└── frontend/
    ├── src/
    ├── android/
    ├── package.json
    ├── angular.json
    ├── capacitor.config.ts
    └── Dockerfile.build
```

---

# 2. Dockerfile de build

Le conteneur utilisé pour le build est construit avec :

```powershell
docker build -t family-notes-builder -f Dockerfile.build frontend
```

Cette commande doit être exécutée depuis le dossier :

```text
Family-notes/
```

Elle construit l'image Docker :

```text
family-notes-builder
```

---

# 3. Problème rencontré

Lors de la compilation Android avec :

```bash
./gradlew assembleDebug
```

Gradle retournait une erreur du type :

```text
Execution failed for task ':app:checkDebugDuplicateClasses'.

Duplicate class kotlin.collections.jdk8.CollectionsJDK8Kt found in modules
kotlin-stdlib-1.8.22.jar

and

kotlin-stdlib-jdk8-1.6.21.jar
```

Le problème venait d'un conflit entre plusieurs versions de Kotlin.

Le projet utilisait notamment :

```text
kotlin-stdlib:1.8.22
```

alors qu'une dépendance transitivement utilisée par le projet apportait :

```text
kotlin-stdlib-jdk8:1.6.21
kotlin-stdlib-jdk7:1.6.21
```

Le graphe de dépendances permettait notamment d'identifier :

```text
kotlinx-coroutines-android:1.6.4
        ↓
kotlin-stdlib-jdk8:1.6.21
```

alors qu'une autre partie du projet utilisait Kotlin 1.8.22.

---

# 4. Diagnostic avec Gradle

Pour identifier la dépendance responsable, on peut utiliser :

```bash
./gradlew app:dependencyInsight \
  --dependency kotlin-stdlib-jdk8 \
  --configuration debugRuntimeClasspath
```

Pour analyser directement les coroutines :

```bash
./gradlew app:dependencyInsight \
  --dependency kotlinx-coroutines-android \
  --configuration debugRuntimeClasspath
```

Ces commandes permettent de voir quelle dépendance introduit une ancienne version de Kotlin.

---

# 5. Correction du conflit Kotlin

Le fichier :

```text
frontend/android/gradle.properties
```

n'avait pas besoin d'être modifié.

Il contenait simplement :

```properties
org.gradle.jvmargs=-Xmx1536m
android.useAndroidX=true
```

Le fichier :

```text
frontend/android/build.gradle
```

n'avait également pas besoin d'être modifié.

La correction a été effectuée dans :

```text
frontend/android/app/build.gradle
```

Après le bloc `dependencies`, ajouter :

```gradle
configurations.all {
    resolutionStrategy.eachDependency { DependencyResolveDetails details ->
        if (details.requested.group == 'org.jetbrains.kotlin') {
            details.useVersion '1.8.22'
        }
    }
}
```

Cette configuration demande à Gradle d'utiliser Kotlin `1.8.22` lorsqu'une dépendance demande une version différente de Kotlin.

---

# 6. Exemple du fichier app/build.gradle

La partie concernée ressemble maintenant à :

```gradle
dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    implementation "androidx.coordinatorlayout:coordinatorlayout:$androidxCoordinatorLayoutVersion"
    implementation "androidx.core:core-splashscreen:$coreSplashScreenVersion"
    implementation project(':capacitor-android')
    testImplementation "junit:junit:$junitVersion"
    androidTestImplementation "androidx.test.ext:junit:$androidxJunitVersion"
    androidTestImplementation "androidx.test.espresso:espresso-core:$androidxEspressoCoreVersion"
    implementation project(':capacitor-cordova-android-plugins')
}

configurations.all {
    resolutionStrategy.eachDependency { DependencyResolveDetails details ->
        if (details.requested.group == 'org.jetbrains.kotlin') {
            details.useVersion '1.8.22'
        }
    }
}
```

---

# 7. Pourquoi ne pas supprimer le dossier Android ?

Il peut être tentant de supprimer :

```text
frontend/android/
```

et de recréer la plateforme.

Cependant, dans ce cas précis, cela ne résolvait pas le problème car l'erreur venait du **graphe de dépendances Gradle**, et non d'une plateforme Android corrompue.

Il est donc préférable de conserver le dossier `android` et de corriger les dépendances.

Si le dossier Android doit réellement être recréé, il faut ensuite resynchroniser Capacitor :

```bash
npx cap add android
```

puis :

```bash
npx cap sync android
```

Dans notre cas, cette étape n'était finalement pas nécessaire.

---

# 8. Build complet avec Docker

Depuis le dossier racine du projet :

```text
Family-notes/
```

exécuter :

```powershell
docker run --rm -v "$(pwd)/frontend:/app" family-notes-builder bash -c "npm install && npm run build && npx cap sync android && cd android && chmod +x gradlew && ./gradlew assembleDebug"
```

Cette commande effectue toutes les étapes automatiquement.

---

# 9. Déroulement du build

## Étape 1 — Monter le projet

```powershell
-v "$(pwd)/frontend:/app"
```

Le dossier local :

```text
frontend/
```

est monté dans le conteneur sous :

```text
/app/
```

Les modifications effectuées dans `frontend/` sont donc visibles dans le conteneur.

---

## Étape 2 — Installer les dépendances npm

```bash
npm install
```

Installe les dépendances Angular et Capacitor définies dans :

```text
package.json
```

---

## Étape 3 — Compiler Angular

```bash
npm run build
```

Angular produit le build frontend.

Par exemple :

```text
Output location: /app/dist/project_tmp
```

---

## Étape 4 — Synchroniser Capacitor

```bash
npx cap sync android
```

Cette commande :

* copie le build Angular dans le projet Android ;
* synchronise les plugins Capacitor ;
* met à jour les dépendances Android nécessaires.

---

## Étape 5 — Entrer dans le projet Android

```bash
cd android
```

---

## Étape 6 — Rendre Gradle Wrapper exécutable

```bash
chmod +x gradlew
```

Cela permet d'exécuter :

```bash
./gradlew
```

dans le conteneur Linux.

---

## Étape 7 — Générer l'APK Debug

```bash
./gradlew assembleDebug
```

Gradle compile finalement l'application Android.

---

# 10. Emplacement de l'APK

Après un build réussi, l'APK Debug se trouve normalement dans :

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

Comme le dossier `frontend` est monté depuis la machine hôte, l'APK est directement accessible depuis Windows.

---

# 11. Commande complète à retenir

Pour reconstruire l'application Android :

```powershell
docker run --rm -v "$(pwd)/frontend:/app" family-notes-builder bash -c "npm install && npm run build && npx cap sync android && cd android && chmod +x gradlew && ./gradlew assembleDebug"
```

Puis récupérer :

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

---

# 12. Rebuild de l'image Docker

Si le `Dockerfile.build` est modifié, reconstruire l'image :

```powershell
docker build -t family-notes-builder -f Dockerfile.build frontend
```

Puis relancer le build :

```powershell
docker run --rm -v "$(pwd)/frontend:/app" family-notes-builder bash -c "npm install && npm run build && npx cap sync android && cd android && chmod +x gradlew && ./gradlew assembleDebug"
```

---

# 13. Résumé

Le pipeline final est :

```text
Code Angular
     │
     ▼
docker run
     │
     ├── npm install
     │
     ├── npm run build
     │
     ├── npx cap sync android
     │
     ├── Gradle
     │
     └── ./gradlew assembleDebug
              │
              ▼
       app-debug.apk
```

La machine Windows n'a donc pas besoin d'avoir installé :

* Node.js
* npm
* Angular CLI
* Capacitor CLI
* Java/JDK
* Gradle
* Android SDK
* Android Studio

Tout l'environnement nécessaire au build est fourni par le conteneur Docker.

---

# 14. En cas d'erreur Kotlin

Si l'erreur suivante réapparaît :

```text
Duplicate class kotlin...
```

vérifier en priorité :

```text
frontend/android/app/build.gradle
```

et la présence de :

```gradle
configurations.all {
    resolutionStrategy.eachDependency { DependencyResolveDetails details ->
        if (details.requested.group == 'org.jetbrains.kotlin') {
            details.useVersion '1.8.22'
        }
    }
}
```

Pour diagnostiquer la provenance d'une dépendance :

```bash
./gradlew app:dependencyInsight \
  --dependency kotlin-stdlib-jdk8 \
  --configuration debugRuntimeClasspath
```

ou :

```bash
./gradlew app:dependencyInsight \
  --dependency kotlinx-coroutines-android \
  --configuration debugRuntimeClasspath
```

---

## Commande finale recommandée

Depuis :

```text
Family-notes/
```

```powershell
docker run --rm -v "$(pwd)/frontend:/app" family-notes-builder bash -c "npm install && npm run build && npx cap sync android && cd android && chmod +x gradlew && ./gradlew assembleDebug"
```

APK généré :

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```
