# Analyse de l'impact de la refonte des catégories sur les tests de `NotesService`

Ce document détaille les tests unitaires qui seront impactés par la migration de la structure des catégories (remplacement de `category: string` par `category_id: string` et utilisation d'un objet `Category` dans le modèle `Note`).

## 1. Tests de lecture (`getAllNotes` et `getNoteById`)

Ces tests échoueront car le format de retour de la méthode `mapRowToNote` change. L'objet `Note` ne contiendra plus une propriété `category` de type `string`, mais un objet `Category`.

*   **`mappe les lignes DB (updated_at -> updatedAt) et décode les blocs`**
    *   **Impact :** L'assertion `expect(first.category).toBe('Personnel')` échouera.
    *   **Correction nécessaire :** Utiliser une structure de type `expect(first.category.name).toBe('Personnel')` et mettre à jour le mock `ROW_A`.
*   **`renvoie la note mappée quand la ligne existe`**
    *   **Impact :** La structure de l'objet retourné change, ce qui rend les tests incomplets si la catégorie n'est pas vérifiée.

## 2. Tests d'écriture (`createNote` et `updateNote`)

Ces tests échoueront car ils vérifient l'envoi de la *valeur* de la catégorie (le nom) dans la requête SQL, alors que le service devra désormais envoyer l'ID de la catégorie.

*   **`createNote` $\rightarrow$ `déclenche un INSERT avec titre et catégorie (paramètres liés)`**
    *   **Impact :** L'assertion `expect(params).toContain('Travail')` échouera car le paramètre envoyé à la base de données sera désormais l'ID (ex: `cat-travail`) et non le nom.
*   **`updateNote` $\rightarrow$ `déclenche un UPDATE ciblant le bon id avec le JSON des blocs`**
    *   **Impact :** 
        *   La vérification du SQL (`writeStatements()`) échouera car la colonne dans la clause `SET` passera de `category = ?` à `category_id = ?`.
        *   L'assertion sur les paramètres devra être mise à jour pour vérifier l'envoi de l'ID de la catégorie.

## 3. Infrastructure de test (Mocks et Helpers)

La structure même de la préparation des tests devra être refondue.

*   **L'objet `dbRow` et les constantes `ROW_A`, `ROW_B`, `ROW_C`**
    *   **Impact :** Ils utilisent actuellement `category: '...'`. Pour simuler une réponse de base de données après migration, ils devront utiliser `category_id: '...'` et inclure les colonnes de jointure (comme `category_name` et `category_color`) que le service utilisera lors du `LEFT JOIN`.
*   **Les types `NoteDraft` et `NoteUpdate`**
    *   **Impact :** Leurs définitions dépendent du modèle `Note`. Comme `Note.category` change de type (`string` $\rightarrow$ `Category`), ces types devront être mis à jour pour refléter la nouvelle structure.

---
*Note : Cette analyse est destinée à préparer la mise à jour du fichier `frontend/src/app/core/services/notes-service.spec.ts` lors de l'implémentation de la migration.*
