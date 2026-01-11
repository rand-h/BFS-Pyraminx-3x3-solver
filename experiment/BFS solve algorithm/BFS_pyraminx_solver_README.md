

Rapport Technique : Solveur de Pyraminx Optimisé
================================================

1. Vue d'ensemble du système

----------------------------

Le système développé est un solveur de Pyraminx basé sur une approche par **pré-calcul (lookup table)**. L'objectif est de déterminer la séquence de mouvements optimale pour revenir à un état résolu à partir de n'importe quel état mélangé.

Le fonctionnement se divise en deux phases distinctes :

1. **La Génération :** Exploration de l'espace des états et création de dictionnaires de correspondance.

2. **La Résolution :** Utilisation des dictionnaires pour déduire le chemin inverse vers la solution.

* * *

2. Phase de Génération (Pré-calcul)

-----------------------------------

### Algorithme de recherche

La génération des combinaisons utilise un algorithme de recherche en largeur (**BFS - Breadth-First Search**).

* **Principe :** Partir de l'état résolu et explorer tous les états voisins, niveau par niveau.

* **Stockage :** Chaque état visité est enregistré comme clé dans un dictionnaire, avec pour valeur le mouvement inverse permettant de revenir à l'état précédent. Cela garantit mathématiquement que le chemin trouvé est le plus court possible.

### Optimisation : Multiprocessing

La génération des états pour toutes les orientations possibles des centres (permutations de couleurs) est une tâche lourde en calcul.

* **Implémentation :** Utilisation du module `multiprocessing`.

* **Gain :** La charge de travail est répartie sur l'ensemble des cœurs logiques du processeur (CPU). Chaque processus calcule un fichier de combinaisons distinct en parallèle, réduisant le temps total de génération proportionnellement au nombre de cœurs disponibles.

* * *

3. Optimisation du Stockage (I/O)

---------------------------------

Initialement stockées au format JSON (texte), les données ont été migrées vers un format binaire pour améliorer les performances d'entrées/sorties.

### Transition JSON vers Pickle (.pkl)

* **Problème du JSON :** Le format texte nécessite une analyse syntaxique (parsing) coûteuse lors du chargement de fichiers volumineux (plusieurs centaines de mégaoctets).

* **Solution Binaire :** Utilisation du module `pickle` (sérialisation d'objets Python).

* **Performance :** Le temps de chargement initial a été réduit d'environ **50%** (passage observé de ~20s à ~10s). La lecture binaire est plus directe et ne nécessite pas de conversion de type complexe.

* * *

4. Phase de Résolution (`solveIt`)

----------------------------------

La fonction de résolution intègre plusieurs stratégies pour assurer rapidité et robustesse.

### A. Gestion des Pointes (Tips)

Les 4 pointes du Pyraminx sont triviales et indépendantes du reste du puzzle. Elles ne sont pas incluses dans l'arbre BFS pour limiter la taille des fichiers.

* **Traitement :** Une fonction algorithmique dédiée (`apply_tip_fixes`) détecte et aligne les pointes avant la recherche principale.

### B. Mise en Cache Mémoire (RAM Caching)

Pour éviter de recharger les fichiers volumineux depuis le disque dur à chaque demande de résolution :

* **Mécanisme :** Implémentation d'un dictionnaire global `MEMORY_CACHE`.

* **Comportement :**
  
  1. Lors de la première requête, le fichier `.pkl` est chargé du disque et stocké en RAM.
  
  2. Pour toutes les requêtes suivantes, les données sont lues instantanément depuis la mémoire vive.

* **Gain :** Le temps de résolution passe de plusieurs secondes (lecture disque) à **quelques millisecondes** (lecture RAM).

### C. Stratégie de Recherche et Robustesse

L'algorithme de résolution ne se contente pas de chercher une clé dans un dictionnaire, il gère les incohérences potentielles des données générées.

1. **Sélection Prédictive :** Le système analyse les couleurs des centres de l'état mélangé pour deviner quel fichier de solution charger (ex: `rbgy.pkl`).

2. **Backtracking Sécurisé :** Une boucle remonte les mouvements enregistrés jusqu'à trouver la balise `"START"`.
   
   * _Sécurité :_ Un compteur d'itérations (`max_iterations`) interrompt la recherche si une boucle infinie est détectée dans le graphe des mouvements.

3. **Mécanisme de Repli (Fallback) :** Si le fichier prédit est corrompu (boucle) ou si l'état n'y figure pas, le solveur déclenche automatiquement une **recherche globale**. Il scanne alors les autres fichiers `.pkl` disponibles jusqu'à trouver une solution valide.

* * *

5. Synthèse des Performances

----------------------------

| **Composant**  | **Technologie / Méthode** | **Impact sur la performance**                              |
| -------------- | ------------------------- | ---------------------------------------------------------- |
| **Calcul**     | Multiprocessing           | Accélération linéaire de la génération des fichiers.       |
| **Chargement** | Format Binaire (`pickle`) | Chargement disque 2x plus rapide que le JSON.              |
| **Latence**    | Cache Mémoire (RAM)       | Résolution instantanée (< 0.01s) après le premier essai.   |
| **Fiabilité**  | Fallback Automatique      | Garantie de résolution même en cas de données imparfaites. |
