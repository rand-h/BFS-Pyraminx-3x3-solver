#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <pigpio.h>
#include <ctype.h>

// --- DÉFINITION DES PINS (BCM) ---
#define PWM_GPIO 26
#define DIR_PIN  22
#define STEP1    23  // L
#define STEP2    27  // U
#define STEP3    24  // R
#define STEP4    17  // B

// --- PARAMÈTRES ---
#define STEPS_PER_MOVE 67
#define DELAY_STEP_SEC 0.01 
#define WAIT_TIME_SEC  0.5 

int current_servo_angle = -1;

void set_servo(int angle) {
    if (angle < 0) angle = 0;
    if (angle > 180) angle = 180;
    int pulse = 800 + (angle * (2500 - 800) / 180);
    gpioServo(PWM_GPIO, pulse);
}

void move_stepper(int step_pin, int clockwise) {
    gpioWrite(DIR_PIN, clockwise ? 1 : 0);
    for (int i = 0; i < STEPS_PER_MOVE; i++) {
        gpioWrite(step_pin, 1);
        time_sleep(DELAY_STEP_SEC / 2.0);
        gpioWrite(step_pin, 0);
        time_sleep(DELAY_STEP_SEC / 2.0);
    }
}

void arduino(const char* command) {
    printf("Séquence reçue : %s\n", command);
    fflush(stdout); // FORCE L'ENVOI IMMÉDIAT

    if (current_servo_angle != 0) {
        printf("Initialisation Servo 0 deg...\n"); fflush(stdout);
        set_servo(0);
        time_sleep(0.5);
        current_servo_angle = 0;
    }
    
    int i = 0;
    while (command[i] != '\0') {
        char raw_char = command[i];
        
        if (raw_char == ' ') { i++; continue; }

        // --- 1. SERVO ---
        int target_angle = current_servo_angle;
        if (isupper(raw_char)) target_angle = 0; 
        else if (islower(raw_char)) target_angle = 45; 

        if (target_angle != current_servo_angle) {
            printf("Servo : %d deg\n", target_angle);
            fflush(stdout); // IMPORTANT
            
            set_servo(target_angle);
            time_sleep(0.5);
            current_servo_angle = target_angle;
        }

        // --- 2. SENS ---
        int is_prime = 0;
        int steps_to_jump = 1;
        if (command[i+1] == '\'') { is_prime = 1; steps_to_jump = 2; }
        int direction = (is_prime == 1) ? 0 : 1; 

        // --- 3. MOTEUR ---
        char motor_char = toupper(raw_char);
        int pin_to_move = -1;

        switch(motor_char) {
            case 'L': pin_to_move = STEP1; break;
            case 'U': pin_to_move = STEP2; break;
            case 'R': pin_to_move = STEP3; break;
            case 'B': pin_to_move = STEP4; break;
            default:  
                // printf("Ignoré : %c\n", raw_char); fflush(stdout);
                break;
        }

        if (pin_to_move != -1) {
            printf("Moteur %c -> %s\n", motor_char, direction ? "Horaire" : "Anti-Horaire");
            fflush(stdout); // IMPORTANT
            
            move_stepper(pin_to_move, direction);
            time_sleep(WAIT_TIME_SEC);
        }

        i += steps_to_jump;
    }

    set_servo(0);
    time_sleep(0.5);
    gpioServo(PWM_GPIO, 0);
    
    printf("Terminé.\n"); 
    fflush(stdout);
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        printf("Usage : sudo ./robot \"SEQUENCE\"\n");
        return 1;
    }
    if (gpioInitialise() < 0) return 1;

    gpioSetMode(PWM_GPIO, PI_OUTPUT);
    gpioSetMode(DIR_PIN, PI_OUTPUT);
    gpioSetMode(STEP1, PI_OUTPUT);
    gpioSetMode(STEP2, PI_OUTPUT);
    gpioSetMode(STEP3, PI_OUTPUT);
    gpioSetMode(STEP4, PI_OUTPUT);

    arduino(argv[1]);

    gpioTerminate();
    return 0;
}




/*/
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <pigpio.h>
#include <ctype.h> // Pour toupper(), isupper(), islower()

// --- DÉFINITION DES PINS (BCM) ---
#define PWM_GPIO 26  // Servo
#define DIR_PIN  22  // Direction commune
#define STEP1    23  // L (Left)
#define STEP2    27  // U (Up)
#define STEP3    24  // R (Right)
#define STEP4    17  // B (Back)

// --- PARAMÈTRES ---
#define STEPS_PER_MOVE 67
#define DELAY_STEP_SEC 0.01 
#define WAIT_TIME_SEC  0.5 

// --- VARIABLES GLOBALES ---
int current_servo_angle = -1; // -1 signifie "position inconnue" au démarrage

// --- FONCTIONS ---

void set_servo(int angle) {
    if (angle < 0) angle = 0;
    if (angle > 180) angle = 180;
    
    // Conversion Angle -> Pulse (500-2500 ou 800-2500 selon votre servo)
    // Ici je garde vos valeurs : 800 à 2500
    int pulse = 800 + (angle * (2500 - 800) / 180);
    
    gpioServo(PWM_GPIO, pulse);
}

void move_stepper(int step_pin, int clockwise) {
    // 1 = Clockwise (Sens normal), 0 = Counter-Clockwise (Sens 'Prime')
    gpioWrite(DIR_PIN, clockwise ? 1 : 0);

    for (int i = 0; i < STEPS_PER_MOVE; i++) {
        gpioWrite(step_pin, 1);
        time_sleep(DELAY_STEP_SEC / 2.0);
        gpioWrite(step_pin, 0);
        time_sleep(DELAY_STEP_SEC / 2.0);
    }
}

// Fonction principale de parsing
void arduino(const char* command) {
    printf("Séquence reçue : %s\n", command);
    
    // Initialisation : on met le servo à 0 (Grands) par défaut au début
    if (current_servo_angle != 0) {
        set_servo(0);
        time_sleep(0.5);
        current_servo_angle = 0;
    }
    
    int i = 0;
    while (command[i] != '\0') {
        char raw_char = command[i];
        
        // Ignorer les espaces
        if (raw_char == ' ') {
            i++;
            continue;
        }

        // --- 1. GESTION DU SERVO (MAJUSCULE vs MINUSCULE) ---
        int target_angle = current_servo_angle; // Par défaut, on ne change rien

        if (isupper(raw_char)) {
            target_angle = 0; // Majuscule (U, R...) -> Grands -> 0°
        } 
        else if (islower(raw_char)) {
            target_angle = 45; // Minuscule (u, r...) -> Sommets -> 45°
        }

        // Si l'angle demandé est différent de l'angle actuel, on bouge
        if (target_angle != current_servo_angle) {
            printf("Servo : %d°\n", target_angle);
            set_servo(target_angle);
            time_sleep(0.5); // Temps de pause pour laisser le bras bouger
            current_servo_angle = target_angle;
        }

        // --- 2. GESTION DU SENS (PRIME) ---
        // Vérifier si le caractère SUIVANT est une apostrophe (')
        int is_prime = 0;
        int steps_to_jump = 1; // Par défaut on saute 1 caractère

        if (command[i+1] == '\'') {
            is_prime = 1;
            steps_to_jump = 2; // On sautera la lettre ET l'apostrophe
        }

        int direction = (is_prime == 1) ? 0 : 1; // 0 = Anti-horaire, 1 = Horaire

        // --- 3. SELECTION DU MOTEUR ---
        char motor_char = toupper(raw_char); // On travaille maintenant en majuscule pour le switch
        int pin_to_move = -1;

        switch(motor_char) {
            case 'L': pin_to_move = STEP1; break;
            case 'U': pin_to_move = STEP2; break;
            case 'R': pin_to_move = STEP3; break;
            case 'B': pin_to_move = STEP4; break;
            default: 
                printf("Caractère ignoré ou inconnu : %c\n", raw_char);
                break;
        }

        if (pin_to_move != -1) {
            printf("Moteur %c -> %s\n", motor_char, direction ? "Horaire" : "Anti-Horaire");
            move_stepper(pin_to_move, direction);
            time_sleep(WAIT_TIME_SEC);
        }

        // Passer à la commande suivante
        i += steps_to_jump;
    }

    // Fin : on remet tout à zéro proprement
    set_servo(0);
    time_sleep(0.5);
    gpioServo(PWM_GPIO, 0); // Arrêt du signal PWM
}

int main(int argc, char *argv[]) {
    if (argc < 2) {
        printf("Usage : sudo ./robot \"SEQUENCE\"\n");
        printf("Exemple : sudo ./robot \"U r U' l'\"\n");
        return 1;
    }

    if (gpioInitialise() < 0) return 1;

    // Configuration des modes GPIO
    gpioSetMode(PWM_GPIO, PI_OUTPUT);
    gpioSetMode(DIR_PIN, PI_OUTPUT);
    gpioSetMode(STEP1, PI_OUTPUT);
    gpioSetMode(STEP2, PI_OUTPUT);
    gpioSetMode(STEP3, PI_OUTPUT);
    gpioSetMode(STEP4, PI_OUTPUT);

    arduino(argv[1]);

    gpioTerminate();
    return 0;
}

/*/