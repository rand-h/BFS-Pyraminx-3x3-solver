// Using Fetch API
async function saveDataToFlask(key, data) {
    const response = await fetch('/save-data', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            key: key,
            data: data
        })
    });
    
    const result = await response.json();
    console.log(result);
}

window.saveDataToFlask = saveDataToFlask;




/**
 * Envoie l'état actuel du Pyraminx à l'API Flask et retourne la séquence de résolution
 * 
 * @param {Object} pyraminxState - Objet avec les faces FRONT, LEFT, RIGHT, BOTTOM
 *                                 chaque face étant un tableau de 9 chaînes de couleurs en MAJUSCULES
 *                                 Exemple :
 *                                 {
 *                                   FRONT:  ["ROUGE", "ROUGE", ...],
 *                                   LEFT:   ["BLEU", "BLEU", ...],
 *                                   RIGHT:  ["VERT", "VERT", ...],
 *                                   BOTTOM: ["JAUNE", "JAUNE", ...]
 *                                 }
 * @param {string} apiBaseUrl - URL de base de ton serveur Flask (ex: "http://localhost:5000")
 * 
 * @returns {Promise<Object>} Résultat contenant status + sequence + move_count ou erreur
 */

async function solvePyraminx(pyraminxState, apiBaseUrl = "") {
    // 1. On s'assure que l'URL se termine bien par /
    const base = apiBaseUrl.endsWith("/") ? apiBaseUrl : apiBaseUrl + "/";

    // 2. On garde exactement le même format que celui stocké dans la session Flask
    //    (les clés en majuscules et les couleurs en majuscules → ton code Python fait .lower() après)
    const payload = {
        // On envoie directement le patron 4×9, exactement comme il est mis en session côté back
        pyraminx_patron: {
            FRONT:  pyraminxState.FRONT,
            RIGHT:  pyraminxState.RIGHT,
            LEFT:   pyraminxState.LEFT,
            BOTTOM: pyraminxState.BOTTOM
        }
    };

    //console.log(payload);

    try {
        const response = await fetch(`${base}api/solve`, {
            method: "POST",
            credentials: "include",        // très important si tu utilises Flask-Session (cookies)
            headers: {
                "Content-Type": "application/json",
                // Si tu as une protection CSRF avec Flask-WTF, ajoute le token ici :
                // "X-CSRFToken": getCookie("csrf_token")
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            // Erreurs 400 / 500 renvoyées par ton endpoint
            console.error("Erreur API :", data);
            throw new Error(data.error || data.message || "Erreur inconnue");
        }

        // Succès → ton back renvoie { status: "solved", sequence: "...", move_count: X }
        if (data.status === "solved") {
            //console.log(`Résolu en ${data.move_count} coups !`);
            return {
                success: true,
                sequence: data.sequence,      // ex: "R L' U r" 
                moveCount: data.move_count,
                start_face: data.setup.face_to_front
            };
        } else {
            // Cas où le solver a renvoyé "ERREUR ..." (status: "error_solving")
            throw new Error(data.message || "Le solver a échoué");
        }

    } catch (err) {
        console.error("Exception lors de l'appel à /api/solve :", err);
        return {
            success: false,
            error: err.message || "Erreur réseau ou serveur"
        };
    }
}

window.solvePyraminx = solvePyraminx;











// --- UTILITAIRE INDEXEDDB (POUR GRAND STOCKAGE) ---
const ImageDB = {
    dbName: 'PyraminxDB',
    storeName: 'Images',
    dbVersion: 1,
    db: null,

    // Ouvre la connexion
    async open() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };
            
            request.onerror = (event) => reject("Erreur ouverture DB: " + event.target.errorCode);
        });
    },

    // Sauvegarder une image (Blob ou Base64)
    async setItem(key, imageBlob) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(imageBlob, key);

            request.onsuccess = () => resolve(true);
            request.onerror = () => reject("Erreur sauvegarde");
        });
    },

    // Récupérer une image
    async getItem(key) {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result); // Retourne le Blob ou null
            request.onerror = () => reject("Erreur lecture");
        });
    },

    // Récupérer TOUTES les images (pour le téléchargement global)
    async getAll() {
        await this.open();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.getAll(); // Récupère les valeurs
            const requestKeys = store.getAllKeys(); // Récupère les clés

            request.onsuccess = () => {
                const values = request.result;
                const keys = requestKeys.result;
                // On recombine en objet { "FRONT": blob, "LEFT": blob... }
                const result = {};
                keys.forEach((key, i) => result[key] = values[i]);
                resolve(result);
            };
            request.onerror = () => reject("Erreur lecture globale");
        });
    }
};



window.ImageDB = ImageDB;








/**
 * Envoie l'image au serveur uniquement pour la sauvegarder (Endpoint dédié)
 */
async function saveImageToServer(faceName, imageBlob) {
    const formData = new FormData();
    formData.append('file', imageBlob, `${faceName}.jpg`);
    formData.append('face_name', faceName);

    try {
        const response = await fetch('/api/save-image', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log(`✅ Image ${faceName} archivée sur le serveur.`);
            // Mise à jour visuelle immédiate (fonction helper définie plus bas)
            updateImagePreview(faceName, result.image_url);
        } else {
            console.warn("Erreur sauvegarde image:", result.error);
        }
    } catch (e) {
        console.error("Erreur connexion sauvegarde:", e);
    }
}


window.saveImageToServer = saveImageToServer;


/**
 * Helper pour afficher l'image dans le HTML
 */
function updateImagePreview(faceName, url) {
    // Adaptez l'ID selon votre HTML (ex: <img id="img_FRONT">)
    // Ou créez les éléments dynamiquement dans une galerie
    const imgElement = document.getElementById(`img_${faceName}`); 
    
    // Exemple si vous avez une div "previewArea"
    if (imgElement) {
        imgElement.src = url;
        imgElement.style.display = 'block';
    } else {
        // Optionnel : Si l'élément n'existe pas, on peut l'ajouter à la galerie
        // addImageToGallery(url, faceName); // Si vous avez gardé cette fonction
    }
}

window.updateImagePreview = updateImagePreview;



/**
 * Demande à l'API l'URL de l'image sauvegardée pour une face donnée.
 * @param {string} faceName - Le nom de la face (FRONT, LEFT, etc.)
 * @returns {Promise<string|null>} L'URL de l'image ou null si pas trouvée.
 */
async function getImageFromServer(faceName) {
    try {
        // 1. On appelle l'API qui liste les images existantes
        const response = await fetch('/api/get-saved-images');
        const result = await response.json();

        // 2. On vérifie si notre face est dans la liste
        if (result.success && result.images && result.images[faceName]) {
            console.log(`Image trouvée pour ${faceName}: ${result.images[faceName]}`);
            return result.images[faceName]; // Retourne l'URL (ex: /static/uploads/FRONT.jpg?t=123)
        } else {
            console.warn(`Aucune image sauvegardée trouvée pour ${faceName}`);
            return null;
        }
    } catch (error) {
        console.error("Erreur lors de la récupération de l'image:", error);
        return null;
    }
}

window.getImageFromServer = getImageFromServer;



function generateShareLink() {
    // 1. On prépare l'objet d'action
    const actionData = {
        action: 'RESTORE_STATE',
        payload: state, // Votre variable globale contenant les couleurs
        timestamp: Date.now()
    };

    // 2. Conversion en JSON string
    const jsonString = JSON.stringify(actionData);

    // 3. Encodage en Base64 (btoa)
    // C'est ça qui donne le "eyJjdXJyZW50RmFjZ..."
    const encodedData = btoa(jsonString);

    // 4. Construction de l'URL
    const fullUrl = `${window.location.origin}${window.location.pathname}?s=${encodedData}`;

    // 5. Copier dans le presse-papier ou afficher
    console.log("Lien généré :", fullUrl);
    
    // Petit hack pour copier dans le presse-papier
    navigator.clipboard.writeText(fullUrl).then(() => {
        alert("Lien copié dans le presse-papier !");
    });
}

window.generateShareLink = generateShareLink;

// Ajoutez un bouton HTML <button onclick="generateShareLink()">Partager</button>








// Remplacez tout le contenu de vos fonctions encrypt/decrypt par ceci :

/**
 * Version simple (XOR) compatible avec une clé "texte"
 */
async function encrypt(text, key) {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result); // Conversion en Base64 pour l'URL
}

/**
 * Version simple (XOR) pour déchiffrer
 */
async function decrypt(encodedText, key) {
    const text = atob(encodedText); // Décodage Base64
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

window.encrypt = encrypt;

window.decrypt = decrypt;