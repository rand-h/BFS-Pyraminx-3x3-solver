// =============================================================================
// NOTE: Ce code suppose que les variables globales suivantes sont disponibles :
// const state = { ... };
// const video = document.getElementById('video');
// const cameraArea = document.getElementById('cameraArea');
// const captureButton = document.getElementById('captureButton');
// const currentFaceTitle = document.getElementById('currentFaceTitle');
// const messageText = document.getElementById('messageText');
// const loadingSpinner = document.getElementById('loadingSpinner');
// const goTo3DButton = document.getElementById('goTo3DButton');
// const updateFace = function(faceName, nineColors) { ... };
// let facesScannedCount = 0;
// let currentFace = null;
// const TOTAL_FACES = 4;
// =============================================================================

// -----------------------------------------------------------------------------
// [NOUVEAU] VARIABLES GLOBALES (issues de la modification du HTML)
// -----------------------------------------------------------------------------
const uploadButton = document.getElementById('uploadButton');
const fileInput = document.getElementById('fileInput');
const uploadedImagePreview = document.getElementById('uploadedImagePreview');
const stopCameraButton = document.getElementById('stopCameraButton');
const editPhoto = document.getElementById('editPhoto');
const saveStateButton = document.getElementById('saveStateButton');
const cameraSelect = document.getElementById('cameraSelect');
const piVideoFeed = document.getElementById('piVideoFeed');
const videoLocal = document.getElementById('video');

// [CONSTANTES]
const VALID_COLORS = ['ROUGE', 'VERT', 'BLEU', 'JAUNE', 'r', 'g', 'b', 'y'];
const IMAGES_STORAGE_KEY = 'pyraminxSavedImages';

// [ETAT]
const imagesState = {
    FRONT: null,
    LEFT: null,
    RIGHT: null,
    BOTTOM: null
};

let image_tmp = null;


// [NOUVEAU] Gestion de Session Persistante
const SESSION_KEY_STORAGE = 'pyraminx_active_session_key';
let activeSessionKey = localStorage.getItem(SESSION_KEY_STORAGE);

if (!activeSessionKey) {
    // Si pas de clé, on en crée une et on la garde pour toujours
    activeSessionKey = 'session_' + new Date().getTime() + '_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem(SESSION_KEY_STORAGE, activeSessionKey);
}
console.log("Clé de session active :", activeSessionKey);

// =============================================================================
// UTILITAIRES & STOCKAGE
// =============================================================================

function blobToCompressedBase64(blob, maxWidth = 600) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = maxWidth / img.width;
                canvas.width = maxWidth;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(blob);
    });
}


/**
 * Sauvegarde automatique et silencieuse de la progression actuelle.
 * Appelée après chaque scan réussi.
 */ 
/*/
function saveProgressAuto() {
    try {
        // 1. Sauvegarde de l'état logique (Couleurs)
        localStorage.setItem('pyraminxSavedState', JSON.stringify(state));
        
        // 2. Sauvegarde de l'état visuel (URLs des images)
        // On ne garde que les faces qui ont une valeur
        localStorage.setItem(IMAGES_STORAGE_KEY, JSON.stringify(imagesState));
        
        console.log("[AUTO-SAVE] Progression sauvegardée.");
    } catch (e) {
        console.warn("[AUTO-SAVE] Espace insuffisant ou erreur:", e);
    }
}
/*/
async function saveProgressAuto() {
    // [SECURITE] Si l'état est vide, on évite d'écraser une sauvegarde potentiellement existante
    let colorsCount = 0;
    for(let f in state) if(!state[f].includes("INCONNU")) colorsCount++;
    
    if (colorsCount === 0) {
        console.warn("[AUTO-SAVE] Annulé : Tentative de sauvegarde d'un état vide.");
        return; 
    }

    try {
        // 1. Sauvegarde Locale (Backup rapide)
        localStorage.setItem('pyraminxSavedState', JSON.stringify(state));
        localStorage.setItem(IMAGES_STORAGE_KEY, JSON.stringify(imagesState));
        
        // 2. Sauvegarde Serveur (Pour la persistance inter-pages)
        // On combine l'état des couleurs ET l'état des images dans un seul objet
        const dataToSave = {
            colors: state,
            images: imagesState
        };

        // On utilise la clé de session fixe
        await saveToServer(activeSessionKey, dataToSave);
        console.log("[AUTO-SAVE] Données synchronisées avec le serveur.");

    } catch (e) {
        console.warn("[AUTO-SAVE] Erreur de sauvegarde :", e);
    }
}


async function saveImagesToLocalStorage(imageBlob) {
    try {
        console.log("[OK] Images sauvegardees dans le navigateur !");
    } catch (e) {
        console.error("Erreur sauvegarde images:", e);
        alert("Attention : Espace de stockage plein.");
    }
}
window.saveImagesToLocalStorage = saveImagesToLocalStorage;

async function restoreImagesFromLocalStorage() {
    if (typeof saved !== 'undefined' && saved) {
        Object.assign(imagesState, saved);
        console.log("[OK] Images restaurees depuis la sauvegarde.");
        return true;
    }
    return false;
}
window.restoreImagesFromLocalStorage = restoreImagesFromLocalStorage;

function downloadImagesBackup() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(imagesState));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "pyraminx_images_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

// =============================================================================
// 1. GESTION DE LA CAMERA
// =============================================================================

let currentMode = 'local';

async function initCameraOptions() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const localVideoDevices = devices.filter(device => device.kind === 'videoinput');
        localVideoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera Locale ${index + 1}`;
            cameraSelect.appendChild(option);
        });
    } catch (err) {
        console.log("Pas de camera locale trouvee ou acces refuse.");
    }
}



async function demanderPermissionSeulement() {
    const warningDiv = document.getElementById('camera-warning');

    try {
        // 1. On demande l'accès (cela déclenche la popup du navigateur)
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });

        // 2. Si on arrive ici, c'est que l'utilisateur a dit OUI.
        // On coupe immédiatement tous les flux (vidéo/audio) pour éteindre la caméra physique.
        stream.getTracks().forEach(track => track.stop());

        console.log("Permission obtenue et enregistrée. Caméra éteinte.");
        
        // On cache le message d'erreur si l'utilisateur a accepté
        if(warningDiv) warningDiv.style.display = 'none';

    } catch (err) {
        // 3. L'utilisateur a refusé ou bloqué
        console.warn("Permission refusée :", err);
        
        // On affiche ton message d'avertissement
        if(warningDiv) warningDiv.style.display = 'block';
    }
}



async function startCamera() {
    const choice = document.getElementById('cameraSelect').value;
    const videoLocal = document.getElementById('video');
    const piVideoFeed = document.getElementById('piVideoFeed');

   

    if (choice === 'pi_camera') {
        currentMode = 'server';
        videoLocal.style.display = 'none';
        piVideoFeed.style.display = 'block';
        stopCameraButton.style.display = 'block';
        stopCameraButton.addEventListener('click', async () => {
            stopLocalCamera();
            await stopRaspberryCamera();
        });
        piVideoFeed.src = "/video_feed?t=" + new Date().getTime();
    } else {
        demanderPermissionSeulement();
        currentMode = 'local';
        piVideoFeed.style.display = 'none';
        piVideoFeed.src = "";
        videoLocal.style.display = 'block';
        stopCameraButton.style.display = 'block';
        stopCameraButton.addEventListener('click', async () => {
            stopLocalCamera();
            await stopRaspberryCamera();
        });
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    deviceId: {
                        exact: choice
                    }
                }
            });
            videoLocal.srcObject = stream;
            videoLocal.play();
        } catch (err) {
            console.error("Erreur camera locale:", err);
        }
    }
}

function stopLocalCamera() {
    const vid = document.getElementById('video');
    if (vid && vid.srcObject) {
        const tracks = vid.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        vid.srcObject = null;
    }
    if (vid) vid.style.display = 'none';
}

async function stopRaspberryCamera() {
    try {
        const response = await fetch('/api/stop_camera', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const data = await response.json();
        if (data.ok) {
            console.log("Camera arretee avec succes");
            const videoImg = document.getElementById('video-stream');
            if (videoImg) {
                videoImg.src = "";
                videoImg.alt = "Camera deconnectee";
            }
        } else {
            alert("Erreur: " + data.message);
        }
    } catch (error) {
        console.error("Erreur lors de l'arret:", error);
    }
}

cameraSelect.addEventListener('change', startCamera);
document.addEventListener('DOMContentLoaded', initCameraOptions);

// =============================================================================
// 2. FONCTIONS DE CAPTURE ET TRAITEMENT
// =============================================================================

function launchScanForFace(faceName) {
    if (!state[faceName].includes("INCONNU") || !state[faceName].includes("MANQUANT")) {
        messageText.innerText = `La face ${faceName} est deja scannee.`;
    }
    currentFace = faceName;
    currentFaceTitle.innerText = `Scan de la Face : ${currentFace}`;
    cameraArea.style.display = 'block';
    messageText.innerText = `Cadrez la face ${currentFace}, capturez ou televersez une photo.`;
}
window.launchScanForFace = launchScanForFace;





/**
 * Lit l'orientation EXIF d'un fichier image (1, 3, 6, ou 8).
 * Retourne 1 si pas d'EXIF ou pas de rotation nécessaire.
 */
function getOrientation(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function(event) {
            const view = new DataView(event.target.result);
            if (view.getUint16(0, false) != 0xFFD8) return resolve(1); // Pas un JPEG
            const length = view.byteLength;
            let offset = 2;
            while (offset < length) {
                const marker = view.getUint16(offset, false);
                offset += 2;
                if (marker == 0xFFE1) { // APP1 marker
                    if (view.getUint32(offset += 2, false) != 0x45786966) return resolve(1);
                    const little = view.getUint16(offset += 6, false) == 0x4949;
                    offset += view.getUint32(offset + 4, little);
                    const tags = view.getUint16(offset, little);
                    offset += 2;
                    for (let i = 0; i < tags; i++) {
                        if (view.getUint16(offset + (i * 12), little) == 0x0112) {
                            return resolve(view.getUint16(offset + (i * 12) + 8, little));
                        }
                    }
                } else if ((marker & 0xFF00) != 0xFF00) break;
                else offset += view.getUint16(offset, false);
            }
            return resolve(1);
        };
        // On ne lit que les premiers 64ko, suffisant pour l'EXIF
        reader.readAsArrayBuffer(file.slice(0, 64 * 1024));
    });
}


/**
 * Convertit n'importe quel fichier image en Blob JPG standardisé.
 * - Gère la transparence (fond blanc)
 * - Gère l'orientation EXIF (photos smartphone)
 */
async function convertToJpgBlob(file) {
    // 1. Récupérer l'orientation avant de charger l'image
    let orientation = 1;
    try {
        orientation = await getOrientation(file);
    } catch (e) {
        console.warn("Impossible de lire l'EXIF, orientation par défaut utilisée.");
    }

    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // 2. Définir la taille du canvas selon l'orientation
            // Si l'image est tournée de 90° (cas 5, 6, 7, 8), on inverse largeur/hauteur
            if (4 < orientation && orientation < 9) {
                canvas.width = img.height;
                canvas.height = img.width;
            } else {
                canvas.width = img.width;
                canvas.height = img.height;
            }

            // 3. Remplir le fond en BLANC (pour PNG transparents)
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 4. Appliquer la rotation correcte au contexte
            switch (orientation) {
                case 2: ctx.transform(-1, 0, 0, 1, img.width, 0); break;
                case 3: ctx.transform(-1, 0, 0, -1, img.width, img.height); break;
                case 4: ctx.transform(1, 0, 0, -1, 0, img.height); break;
                case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
                case 6: ctx.transform(0, 1, -1, 0, img.height, 0); break; // 90° CW (iPhone portrait standard)
                case 7: ctx.transform(0, -1, -1, 0, img.height, img.width); break;
                case 8: ctx.transform(0, -1, 1, 0, 0, img.width); break; // 90° CCW
                default: break;
            }

            // 5. Dessiner l'image
            ctx.drawImage(img, 0, 0);

            // 6. Exporter en JPG
            canvas.toBlob((blob) => {
                URL.revokeObjectURL(url);
                if (blob) resolve(blob);
                else reject(new Error("Erreur conversion Blob"));
            }, 'image/jpeg', 0.90);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Erreur chargement image"));
        };

        img.src = url;
    });
}




async function processImage(faceName, imageBlob) {
    stopLocalCamera();
    await stopRaspberryCamera();

    loadingSpinner.style.display = 'inline-block';
    captureButton.disabled = true;
    uploadButton.disabled = true;
    messageText.innerText = `Analyse de la face ${faceName} en cours...`;

    const formData = new FormData();
    formData.append('file', imageBlob, `${faceName}.jpg`);
    formData.append('face_name', faceName);

    saveImageToServer(IMAGES_STORAGE_KEY, imageBlob);

    try {
        const response = await fetch('/api/scan', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();

        if (response.ok) {
            // --- SUCCES ---
            
            // 1. Mise à jour visuelle du patron (Canvas)
            updateFace(faceName, result.colors);

            // 2. [NOUVEAU] Mise à jour de la mémoire des images
            // On stocke l'URL du serveur pour la persistance légère
            const serverImageUrl = `/static/uploads/${faceName}.jpg?t=${new Date().getTime()}`;
            imagesState[faceName] = serverImageUrl; 

            // 3. [NOUVEAU] Sauvegarde immédiate dans le navigateur
            saveProgressAuto();

            messageText.innerText = `[OK] Face ${faceName} scannee !`;
            messageText.style.color = "lightgreen";

            checkCompletionAndShowSaveButton();
            showControlButtons();

        } else {
            messageText.innerText = `Erreur : ${result.error}`;
            messageText.style.color = "red";
        }
    } catch (error) {
        console.error('Erreur:', error);
        messageText.innerText = "Erreur connexion serveur.";
    } finally {
        loadingSpinner.style.display = 'none';
    }
}

// =============================================================================
// 3. GESTION DE L'INTERFACE UTILISATEUR (UX)
// =============================================================================

const scanControls = document.getElementById('scanControls');
const retakeButton = document.getElementById('retakeButton');
const validateButton = document.getElementById('validateButton');

function showControlButtons() {
    captureButton.style.display = 'none';
    if (scanControls) scanControls.style.display = 'block';
}

if (validateButton) {
    validateButton.addEventListener('click', () => {
        cameraArea.style.display = 'none';
        resetCameraUI();
    });
}

if (retakeButton) {
    retakeButton.addEventListener('click', async () => {
        messageText.innerText = "Relance de la camera...";
        messageText.style.color = "white";
        uploadedImagePreview.style.display = 'none';
        uploadedImagePreview.src = '';
        image_tmp = null;

        const videoLocal = document.getElementById('video');
        const piVideoFeed = document.getElementById('piVideoFeed');

        if (currentMode === 'server') {
            piVideoFeed.style.display = 'block';
            piVideoFeed.src = "/video_feed?t=" + new Date().getTime();
            stopCameraButton.style.display = 'block';
        } else {
            videoLocal.style.display = 'block';
            await startCamera();
        }
        resetCameraUI();
    });
}

function resetCameraUI() {
    if (scanControls) scanControls.style.display = 'none';
    captureButton.style.display = 'inline-block';
    captureButton.disabled = false;
    uploadButton.disabled = false;
    currentFace = null;
}

// =============================================================================
// 4. GESTION DES EVENEMENTS PRINCIPAUX
// =============================================================================

captureButton.addEventListener('click', async () => {
    if (!currentFace) {
        messageText.innerText = "Veuillez d'abord selectionner une face.";
        return;
    }
    if (image_tmp) {
        console.log("Action: Utilisation du fichier uploade ou modifie.");
        processImage(currentFace, image_tmp);
        return;
    }

    const cameraChoice = cameraSelect.value;
    const videoElement = document.getElementById('video');
    const piElement = document.getElementById('piVideoFeed');

    if (cameraChoice === 'pi_camera') {
        console.log("Action: Capture distante sur Raspberry Pi.");
        loadingSpinner.style.display = 'inline-block';
        messageText.innerText = "Demande de capture au robot...";

        try {
            const response = await fetch('/api/scan_server', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    face_name: currentFace
                })
            });
            const result = await response.json();

            if (result.ok) {
                const imgUrl = `/static/uploads/${currentFace}.jpg?t=${new Date().getTime()}`;
                const imgResponse = await fetch(imgUrl);
                const blob = await imgResponse.blob();

                const previewUrl = URL.createObjectURL(blob);
                uploadedImagePreview.src = previewUrl;
                uploadedImagePreview.style.display = 'block';
                piElement.style.display = 'none';

                messageText.innerText = "Photo recue du Pi. Analyse en cours...";
                processImage(currentFace, blob);
            } else {
                messageText.innerText = "Erreur Robot : " + (result.error || "Capture echouee");
                loadingSpinner.style.display = 'none';
            }
        } catch (error) {
            console.error(error);
            messageText.innerText = "Erreur de connexion au Robot.";
            loadingSpinner.style.display = 'none';
        }
    } else {
        if (!videoElement.srcObject) {
            messageText.innerText = "Erreur : La camera locale n'est pas active.";
            return;
        }
        console.log("Action: Capture locale via Canvas.");
        const canvasCapture = document.createElement('canvas');
        const ctxCapture = canvasCapture.getContext('2d');
        canvasCapture.width = videoElement.videoWidth;
        canvasCapture.height = videoElement.videoHeight;
        ctxCapture.drawImage(videoElement, 0, 0, canvasCapture.width, canvasCapture.height);

        uploadedImagePreview.src = canvasCapture.toDataURL('image/jpeg');
        uploadedImagePreview.style.display = 'block';
        videoElement.style.display = 'none';

        canvasCapture.toBlob((blob) => {
            if (blob) {
                messageText.innerText = "Capture locale effectuee. Analyse en cours...";
                processImage(currentFace, blob);
            } else {
                messageText.innerText = "Erreur lors de la conversion de l'image.";
                videoElement.style.display = 'block';
                uploadedImagePreview.style.display = 'none';
            }
        }, 'image/jpeg', 0.9);
    }
});

uploadButton.addEventListener('click', async () => {
    if (!currentFace) {
        messageText.innerText = "Veuillez selectionner une face a scanner d'abord.";
        return;
    }
    stopLocalCamera();
    await stopRaspberryCamera();
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const originalFile = e.target.files[0];
    if (!originalFile || !currentFace) return;

    // Feedback utilisateur
    messageText.innerText = "Conversion en format JPG en cours...";
    if(loadingSpinner) loadingSpinner.style.display = 'inline-block';

    try {
        // --- ETAPE CLE : CONVERSION ---
        const jpgBlob = await convertToJpgBlob(originalFile);

        // Création d'un objet File pour garder un nom cohérent (ex: FRONT.jpg)
        // Cela aide pour les sauvegardes localStorage/Serveur qui attendent un 'name'
        const jpgFile = new File([jpgBlob], `${currentFace}.jpg`, { type: 'image/jpeg' });

        // Mise à jour de la prévisualisation avec le NOUVEAU fichier JPG
        const previewUrl = URL.createObjectURL(jpgFile);
        uploadedImagePreview.src = previewUrl;
        uploadedImagePreview.style.display = 'block';
        if(typeof video !== 'undefined') video.style.display = 'none';

        // Sauvegardes (On sauvegarde la version JPG convertie !)
        await saveImagesToLocalStorage(jpgFile);
        await saveImageToServer(IMAGES_STORAGE_KEY, jpgFile);

        // Configuration du bouton Capturer
        captureButton.onclick = () => {
            if (currentFace && jpgFile) {
                image_tmp = jpgFile; // On stocke le JPG dans la variable temporaire
                processImage(currentFace, jpgFile); // On envoie le JPG au backend
            }
        };

        messageText.innerText = `Image JPG prête pour ${currentFace}. Cliquez sur 'Capturer'.`;
        messageText.style.color = "lightgreen";

    } catch (error) {
        console.error("Erreur conversion image:", error);
        messageText.innerText = "Erreur : Impossible de traiter ce format d'image.";
        messageText.style.color = "red";
    } finally {
        if(loadingSpinner) loadingSpinner.style.display = 'none';
        // Reset de l'input pour pouvoir ré-uploader le même fichier si besoin
        fileInput.value = ''; 
    }
});

/*/
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || !currentFace) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        uploadedImagePreview.src = event.target.result;
        uploadedImagePreview.style.display = 'block';
        video.style.display = 'none';
    };
    reader.readAsDataURL(file);

    await saveImagesToLocalStorage(file);
    await saveImageToServer(IMAGES_STORAGE_KEY, file);

    captureButton.onclick = () => {
        if (currentFace && file) {
            image_tmp = file;
            processImage(currentFace, file);
        }
    };
    messageText.innerText = `Image chargee pour ${currentFace}. Cliquez sur 'Capturer'.`;
});
/*/

goTo3DButton.addEventListener('click', () => {
    saveCurrentState();
    if (facesScannedCount === TOTAL_FACES) {
        window.location.href = '/analyse';
    } else {
        alert("Veuillez scanner les 4 faces pour passer a l'analyse.");
    }
});

saveStateButton.addEventListener('click', saveCurrentState);

// =============================================================================
// 5. GESTION DE L'ETAT ET SAUVEGARDE
// =============================================================================

function checkCompletionAndShowSaveButton() {
    let count = 0;
    for (const face in state) {
        if (!state[face].includes("INCONNU")) {
            count++;
        }
    }
    facesScannedCount = count;

    if (facesScannedCount === TOTAL_FACES) {
        goTo3DButton.style.display = 'block';
        goTo3DButton.disabled = false;
        goTo3DButton.classList.remove("disabled");
        saveStateButton.style.display = 'block';
        saveStateButton.disabled = false;
        saveStateButton.classList.remove("disabled");
        messageText.innerText = "Scan termine ! Cliquez sur 'Voir en 3D & Analyse' ou Sauvegardez l'etat.";
    } else {
        goTo3DButton.style.display = 'none';
        goTo3DButton.disabled = true;
        goTo3DButton.classList.add("disabled");
        saveStateButton.style.display = 'none';
        saveStateButton.disabled = true;
        saveStateButton.classList.add("disabled");
    }
}

function isValidPyraminxState(patron) {
    const requiredFaces = ['FRONT', 'RIGHT', 'LEFT', 'BOTTOM'];
    const VALID_COLORS = ['ROUGE', 'VERT', 'BLEU', 'JAUNE', 'r', 'g', 'b', 'y'];

    for (const face of requiredFaces) {
        if (!patron[face] || !Array.isArray(patron[face]) || patron[face].length !== 9) {
            console.error(`Validation echouee : Face ${face} manquante.`);
            return false;
        }
    }
    for (const face in patron) {
        const colors = patron[face];
        for (const color of colors) {
            const upperColor = color.toUpperCase();
            if (upperColor === 'INCONNU' || upperColor === 'MANQUANT') return false;
            if (!VALID_COLORS.includes(upperColor) && !VALID_COLORS.includes(color)) {
                console.error(`Validation echouee : Couleur '${color}' invalide.`);
                return false;
            }
        }
    }
    return true;
}
window.isValidPyraminxState = isValidPyraminxState;

/*/
async function saveCurrentState() {
    if (facesScannedCount !== TOTAL_FACES) {
        alert("Sauvegarde impossible : Le scan n'est pas complet.");
        return;
    }
    try {
        const stateToSave = state;
        if (!isValidPyraminxState(stateToSave)) {
            alert("Etat invalide : impossible de sauvegarder.");
            return;
        }
        const stateJSON = JSON.stringify(stateToSave);
        localStorage.setItem('pyraminxSavedState', stateJSON);
        console.log("[OK] Etat sauvegarde localement (LocalStorage)");

        const saveKey = generateSaveKey();
        try {
            await saveToServer(saveKey, stateToSave);
            messageText.innerText = "[OK] Etat sauvegarde localement et sur le serveur !";
        } catch (serverError) {
            console.warn("Serveur non disponible:", serverError);
            messageText.innerText = "[OK] Etat sauvegarde localement (serveur non disponible)";
        }
        saveStateButton.disabled = true;
    } catch (e) {
        console.error("Erreur sauvegarde:", e);
        messageText.innerText = "Erreur de sauvegarde.";
    }
}
/*/

// =============================================================================
// MODIFICATION DE LA FONCTION DE SAUVEGARDE MANUELLE
// =============================================================================

async function saveCurrentState() {
    // 1. Validation de base
    // Note : On peut autoriser la sauvegarde même si incomplet si tu veux, 
    // mais gardons ta logique de "Scan Complet" pour l'instant.
    if (facesScannedCount !== TOTAL_FACES) {
        alert("Sauvegarde impossible : Le scan n'est pas complet (4 faces requises).");
        return;
    }

    try {
        // 2. Préparation du "Paquet complet" (Source de vérité)
        const stateToSave = state;
        const imagesToSave = imagesState;

        if (!isValidPyraminxState(stateToSave)) {
            alert("État invalide (couleurs manquantes ou incorrectes) : impossible de sauvegarder.");
            return;
        }

        messageText.innerText = "Sauvegarde en cours sur tous les supports...";
        messageText.style.color = "yellow";
        saveStateButton.disabled = true;

        // ---------------------------------------------------------
        // A. SAUVEGARDE LOCALE (Navigateur) - Instantané
        // ---------------------------------------------------------
        localStorage.setItem('pyraminxSavedState', JSON.stringify(stateToSave));
        localStorage.setItem(IMAGES_STORAGE_KEY, JSON.stringify(imagesToSave));
        console.log("[OK] LocalStorage mis à jour.");

        // ---------------------------------------------------------
        // B. SAUVEGARDE SERVEUR (Fichier/Session) - Robuste
        // ---------------------------------------------------------
        // IMPORTANT : On utilise 'activeSessionKey' pour écraser la session en cours
        // et ne pas créer un doublon avec une clé aléatoire.
        const dataForServer = {
            colors: stateToSave,
            images: imagesToSave
        };

        try {
            await saveToServer(activeSessionKey, dataForServer);
            console.log("[OK] Serveur synchronisé.");
            
            messageText.innerText = "✅ État sauvegardé partout (Local + Serveur) !";
            messageText.style.color = "lightgreen";
        } catch (serverError) {
            console.warn("Serveur non disponible:", serverError);
            messageText.innerText = "⚠️ Sauvegardé en Local uniquement (Serveur hors ligne).";
            messageText.style.color = "orange";
        }

    } catch (e) {
        console.error("Erreur critique sauvegarde:", e);
        messageText.innerText = "Erreur de sauvegarde.";
        messageText.style.color = "red";
    } finally {
        // On réactive le bouton après un court délai pour éviter le spam
        setTimeout(() => {
            saveStateButton.disabled = false;
        }, 2000);
    }
}


function generateSaveKey() {
    const timestamp = new Date().getTime();
    const randomId = Math.random().toString(36).substring(2, 9);
    return `pyraminx_${timestamp}_${randomId}`;
}

/*/
async function saveToServer(key, data) {
    try {
        const response = await fetch('/save-pattern', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                key: key,
                pattern: data,
                metadata: {
                    timestamp: new Date().toISOString(),
                    totalFaces: TOTAL_FACES,
                    facesScanned: facesScannedCount,
                    source: 'web_scanner_v1'
                }
            })
        });
        if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
        const result = await response.json();
        if (result.success) {
            const savedKeys = JSON.parse(localStorage.getItem('pyraminxServerKeys') || '{}');
            savedKeys[key] = {
                timestamp: new Date().toISOString(),
                serverSavedAt: result.saved_at
            };
            localStorage.setItem('pyraminxServerKeys', JSON.stringify(savedKeys));
            console.log("[OK] Sauvegarde serveur reussie");
            return true;
        } else {
            throw new Error(result.error || 'Erreur inconnue');
        }
    } catch (error) {
        console.warn("[ATTENTION] Sauvegarde serveur echouee:", error.message);
        throw error;
    }
}
/*/
async function saveToServer(key, data) {
    try {
        const response = await fetch('/save-pattern', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                key: key,
                // Si data contient .colors (notre nouveau format), on l'utilise, sinon on prend data brut
                pattern: data.colors ? data.colors : data, 
                metadata: {
                    timestamp: new Date().toISOString(),
                    totalFaces: TOTAL_FACES,
                    facesScanned: facesScannedCount,
                    // ON SAUVEGARDE LES IMAGES DANS LES METADATA AUSSI PAR SÉCURITÉ
                    images_backup: data.images ? data.images : imagesState,
                    source: 'web_scanner_v2_persistent'
                }
            })
        });
        
        if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
        const result = await response.json();
        
        if (result.success) {
            console.log(`[SERVEUR] Sauvegarde réussie (Clé: ${key})`);
            return true;
        } else {
            throw new Error(result.error || 'Erreur inconnue');
        }
    } catch (error) {
        console.warn("[SERVEUR] Echec sauvegarde:", error.message);
        throw error; // On propage l'erreur pour saveProgressAuto
    }
}

// =============================================================================
// 6. LOGIQUE DE CHARGEMENT ET URL
// =============================================================================

function loadFromLocalStorage() {
    const savedStateJSON = localStorage.getItem('pyraminxSavedState');
    if (!savedStateJSON) return null;
    try {
        const savedState = JSON.parse(savedStateJSON);
        if (isValidPyraminxState(savedState)) {
            return savedState;
        } else {
            console.warn("Etat LocalStorage invalide.");
            localStorage.removeItem('pyraminxSavedState');
            return null;
        }
    } catch (e) {
        console.error("Erreur deserialisation:", e);
        return null;
    }
}

/*/
function applySavedStateToUI(savedState) {
    // 1. Restauration des Couleurs (State)
    for (const face in savedState) {
        if (state[face]) {
            state[face] = savedState[face];
            // Force le redessin du canvas pour cette face
            updateFace(face, state[face]); 
        }
    }

    // 2. [NOUVEAU] Restauration des Images (ImagesState)
    const savedImagesJson = localStorage.getItem(IMAGES_STORAGE_KEY);
    if (savedImagesJson) {
        try {
            const loadedImages = JSON.parse(savedImagesJson);
            Object.assign(imagesState, loadedImages);
            console.log("[RESTORE] Images récupérées :", loadedImages);
        } catch (e) {
            console.error("Erreur lecture images sauvegardées", e);
        }
    }

    // 3. Mise à jour du compteur
    let count = 0;
    for (const face in state) {
        if (!state[face].includes("INCONNU")) {
            count++;
        }
    }
    facesScannedCount = count;

    // 4. Vérifications finales
    checkCompletionAndShowSaveButton();
    
    // Feedback utilisateur
    if (count > 0) {
        messageText.innerText = `Restauration : ${count}/4 faces déjà scannées.`;
    }
}
/*/
function applySavedStateToUI(savedState) {
    // 1. Restauration des Couleurs (State)
    for (const face in savedState) {
        // On vérifie que 'state' et la face existent bien globalement
        if (typeof state !== 'undefined' && state[face]) {
            state[face] = savedState[face];
            // Force le redessin du canvas pour cette face
            if (typeof updateFace === 'function') {
                updateFace(face, state[face]);
            }
        }
    }

    // 2. Restauration des Images
    // On ne fait que mettre à jour la variable mémoire. 
    // On n'essaie pas d'afficher l'image tout de suite car l'utilisateur n'a pas encore cliqué sur une face.
    console.log("[RESTORE] Mémoire des images synchronisée.");

    // 3. Mise à jour du compteur
    let count = 0;
    if (typeof state !== 'undefined') {
        for (const face in state) {
            if (state[face] && !state[face].includes("INCONNU")) {
                count++;
            }
        }
    }
    facesScannedCount = count;

    // 4. Vérifications finales (Boutons sauvegarde/3D)
    if (typeof checkCompletionAndShowSaveButton === 'function') {
        checkCompletionAndShowSaveButton();
    }
    
    // Feedback utilisateur
    if (count > 0 && messageText) {
        messageText.innerText = `Session restaurée : ${count}/4 faces déjà scannées.`;
    }
}

/*/
async function loadLatestFromServer() {
    try {
        const response = await fetch('/list-patterns');
        if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
        const result = await response.json();
        if (result.success && result.patterns && result.patterns.length > 0) {
            const sortedSaves = result.patterns.sort((a, b) =>
                new Date(b.metadata?.saved_at || 0) - new Date(a.metadata?.saved_at || 0)
            );
            for (const save of sortedSaves) {
                try {
                    const pattern = await loadSpecificSave(save.key);
                    if (pattern && isValidPyraminxState(pattern)) {
                        console.log(`[OK] Etat valide serveur (cle: ${save.key})`);
                        return pattern;
                    }
                } catch (e) {
                    continue;
                }
            }
        }
    } catch (error) {
        console.warn("Impossible de charger depuis le serveur:", error);
    }
    return null;
}
/*/
// Modifié pour charger spécifiquement NOTRE session
async function loadLatestFromServer() {
    try {
        // On essaie d'abord de récupérer NOTRE session spécifique
        console.log("Tentative de récupération de la session : " + activeSessionKey);
        const specificData = await loadSpecificSave(activeSessionKey);
        
        if (specificData) {
            // Si loadSpecificSave renvoie juste le pattern (couleurs),
            // il nous manque les images.
            // C'est pourquoi nous devons récupérer les métadonnées si possible.
            // *Note: Si votre backend /get-pattern/ ne renvoie pas les métadonnées, 
            // nous devrons nous fier au fait que nous avons peut-être injecté les images 
            // ailleurs ou faire une requête 'list' pour retrouver les métadonnées.*
            
            // Tentons une approche plus robuste : Listing pour retrouver les métadonnées
            const response = await fetch('/list-patterns');
            const result = await response.json();
            
            if (result.success && result.patterns) {
                // Trouver notre sauvegarde dans la liste
                const mySave = result.patterns.find(p => p.key === activeSessionKey);
                if (mySave && mySave.metadata && mySave.metadata.images_backup) {
                    console.log("[SERVEUR] Images retrouvées dans les métadonnées");
                    // On fusionne les images récupérées
                    Object.assign(imagesState, mySave.metadata.images_backup);
                }
            }
            return specificData; // Retourne les couleurs
        }
    } catch (error) {
        console.warn("Impossible de charger depuis le serveur:", error);
    }
    return null;
}



async function loadSpecificSave(key) {
    try {
        const response = await fetch(`/get-pattern/${key}`);
        
        // [CORRECTION] Si 404, ce n'est pas une erreur, c'est juste que la session est neuve
        if (response.status === 404) {
            console.log("[INFO] Nouvelle session détectée (pas de sauvegarde distante).");
            return null;
        }

        if (!response.ok) throw new Error(`Erreur HTTP ${response.status}`);
        
        const result = await response.json();
        if (result.success && result.pattern) return result.pattern;
    } catch (error) {
        // On ne spamme pas la console si c'est juste une erreur réseau mineure
        console.warn(`[INFO] Impossible de charger la clé ${key} :`, error.message);
    }
    return null;
}

async function checkServerConnection() {
    try {
        const response = await fetch('/health-check', {
            method: 'HEAD',
            timeout: 3000
        });
        if (response.ok) {
            console.log("[OK] Serveur disponible");
            return true;
        }
    } catch (error) {
        console.warn("[ATTENTION] Serveur non disponible - mode hors ligne");
    }
    return false;
}

// [FONCTION REINTEGREE]
/*/ 
async function loadAndValidateSavedState() {
    // 1. Essayer LocalStorage
    const localState = loadFromLocalStorage();
    if (localState) {
        console.log("[OK] Etat charge depuis LocalStorage.");
        return localState;
    }
    // 2. Essayer Serveur
    console.log("Tentative chargement depuis le serveur...");
    try {
        const serverState = await loadLatestFromServer();
        if (serverState) {
            localStorage.setItem('pyraminxSavedState', JSON.stringify(serverState));
            console.log("[OK] Etat charge depuis le serveur.");
            return serverState;
        }
    } catch (error) {
        console.warn("Impossible de charger depuis le serveur:", error);
    }
    return null;
}
/*/

async function loadAndValidateSavedState() {
    // 1. Priorité au SERVEUR maintenant (pour la persistance entre pages)
    console.log("Chargement: Priorité Serveur...");
    try {
        const serverState = await loadLatestFromServer();
        // serverState contient les couleurs (state)
        // imagesState a été mis à jour dans loadLatestFromServer via les métadonnées
        
        if (serverState && isValidPyraminxState(serverState)) {
            console.log("[OK] État restauré depuis le serveur.");
            
            // On met à jour le localStorage pour qu'ils soient synchro
            localStorage.setItem('pyraminxSavedState', JSON.stringify(serverState));
            localStorage.setItem(IMAGES_STORAGE_KEY, JSON.stringify(imagesState));
            
            return serverState;
        }
    } catch (error) {
        console.warn("Erreur chargement serveur, repli sur LocalStorage", error);
    }

    // 2. Repli sur LocalStorage si le serveur échoue
    const localState = loadFromLocalStorage();
    if (localState) {
        console.log("[OK] État chargé depuis LocalStorage (Backup).");
        return localState;
    }
    
    return null;
}

window.loadAndValidateSavedState = loadAndValidateSavedState;

editPhoto.addEventListener('click', async () => {
    // 1. Préparation de la commande d'édition (comme avant)
    const faceText = currentFaceTitle.textContent;
    const scanned_face = getScannedFace(faceText);
    const image_storage_key = IMAGES_STORAGE_KEY;
    const url_data = `${scanned_face}:${image_storage_key}`;
    const key = "hello, just to encrypt the url";
    
    // 2. Préparation du SAUVETAGE (Le backup dans l'URL)
    // On crée un petit objet JSON avec tout ce qu'on ne veut pas perdre
    const backupData = {
        c: state,       // c pour colors
        i: imagesState  // i pour images
    };
    // On le convertit en chaîne encode pour l'URL
    const backupString = encodeURIComponent(JSON.stringify(backupData));

    try {
        const encryptedData = await encrypt(url_data, key);
        const safeUrlParam = encodeURIComponent(encryptedData);
        
        // 3. Redirection avec DEUX paramètres : 
        // s = secret (quelle image modifier)
        // backup = l'état complet des autres faces
        window.location.href = `/edit?s=${safeUrlParam}&backup=${backupString}`;
        
    } catch (e) {
        console.error("Erreur redirection:", e);
    }
});


function getScannedFace(input) {
    const parts = input.split(':');
    return parts.length > 1 ? parts[1].trim() : '';
}

// =============================================================================
// INITIALISATION ET LOGIQUE DE CHARGEMENT
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("📥 Démarrage scan.js...");
    
    const params = new URLSearchParams(window.location.search);
    
    // -------------------------------------------------------------------------
    // 1. RESTAURATION VIA URL (La priorité absolue)
    // -------------------------------------------------------------------------
    const backupString = params.get('backup');
    
    if (backupString) {
        try {
            // On décode le JSON qui a voyagé
            const backupData = JSON.parse(decodeURIComponent(backupString));
            
            // On restaure les couleurs (c) et les images (i)
            if (backupData.c) Object.assign(state, backupData.c);
            if (backupData.i) Object.assign(imagesState, backupData.i);
            
            console.log("✅ État restauré depuis l'URL :", state);
            
            // Mise à jour visuelle des compteurs
            let count = 0;
            for (const face in state) {
                if (state[face] && !state[face].includes("INCONNU")) count++;
            }
            facesScannedCount = count;
            
            // On peut tenter de resauvegarder sur le serveur maintenant que c'est propre
            saveProgressAuto(); 
            
        } catch (e) {
            console.error("Erreur lecture backup URL:", e);
        }
    } else {
        // Si pas de backup URL (premier chargement), on tente le serveur
        const serverState = await loadAndValidateSavedState();
        if (serverState) applySavedStateToUI(serverState);
    }
    
    checkServerConnection();
    if(typeof checkCompletionAndShowSaveButton === 'function') checkCompletionAndShowSaveButton();

    // -------------------------------------------------------------------------
    // 2. GESTION DU RETOUR D'ÉDITION (Traitement de l'image modifiée)
    // -------------------------------------------------------------------------
    const encryptedParam = params.get('s');

    if (encryptedParam) {
        console.log("✏️ Retour d'édition image...");
        try {
            const key = "hello, just to encrypt the url";
            const decryptedString = await decrypt(encryptedParam, key);
            const [faceName, imageName] = decryptedString.split(':');

            if (faceName && imageName) {
                // Mise à jour de l'état pour la face courante
                currentFace = faceName;
                currentFaceTitle.innerText = `Scan de la Face : ${currentFace}`;
                if(cameraArea) cameraArea.style.display = 'block';
                if(video) video.style.display = 'none';

                const timestamp = new Date().getTime();
                const newImageUrl = `/static/uploads/${imageName}.jpg?t=${timestamp}`;

                // On force la mise à jour de l'image pour cette face
                imagesState[faceName] = newImageUrl;
                
                // On affiche l'image modifiée
                uploadedImagePreview.src = newImageUrl;
                uploadedImagePreview.style.display = 'block';
                
                // Récupération du blob pour l'analyse
                try {
                    const response = await fetch(newImageUrl);
                    const blob = await response.blob();
                    
                    messageText.innerText = `Image modifiée chargée pour ${faceName}. Cliquez sur 'Capturer'.`;
                    messageText.style.color = "#00ff00";

                    captureButton.onclick = async () => {
                        if (currentFace) {
                            // state est déjà plein grâce à l'étape 1 (URL backup)
                            await processImage(currentFace, blob);
                            
                            // Après le process, on nettoie l'URL pour qu'elle soit propre
                            window.history.replaceState({}, document.title, window.location.pathname);
                        }
                    };
                } catch(err) {
                    console.error("Erreur chargement blob:", err);
                }
            }
        } catch (error) {
            console.error("Erreur URL s:", error);
        }
    }
});