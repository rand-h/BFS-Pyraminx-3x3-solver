#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <limits.h> // Pour INT_MAX

#ifndef _WIN32
    #include <sys/mman.h>
    #include <sys/stat.h>
    #include <fcntl.h>
    #include <unistd.h>
#endif

#define ENTRY_SIZE 10
#define STATE_SIZE 9

typedef struct {
    uint8_t state[STATE_SIZE];
    uint8_t move;
} Entry;

const char* MOVE_NAMES[] = { "U", "U'", "R", "R'", "L", "L'", "B", "B'" };
const char COLOR_CHARS[] = "rgby";

// Reconvertit les bits en texte (rgby...)
void unpack_state(const uint8_t* packed, char* output) {
    for (int i = 0; i < 9; i++) {
        uint8_t byte = packed[i];
        for (int j = 0; j < 4; j++) {
            int color_index = (byte >> (6 - (j * 2))) & 0x03; 
            output[i * 4 + j] = COLOR_CHARS[color_index];
        }
    }
    output[36] = '\0';
}

// Prépare l'état cible ET le masque pour ignorer les '?'
void pack_target_with_mask(const char* input, uint8_t* val_out, uint8_t* mask_out) {
    for (int i = 0; i < 9; i++) {
        uint8_t b_val = 0;
        uint8_t b_mask = 0;
        
        for (int j = 0; j < 4; j++) {
            int char_idx = i * 4 + j;
            char c = input[char_idx];
            uint8_t code = 0;
            uint8_t mask_bits = 0; 

            if (c == '?' || c == '.' || c == '_') {
                mask_bits = 0; // Inconnu -> On ne compare pas (bits à 0)
                code = 0;
            } else {
                mask_bits = 3; // Connu -> On compare (bits à 11)
                for (int k = 0; k < 4; k++) {
                    if (c == COLOR_CHARS[k]) {
                        code = k;
                        break;
                    }
                }
            }
            b_val = (b_val << 2) | code;
            b_mask = (b_mask << 2) | mask_bits;
        }
        val_out[i] = b_val;
        mask_out[i] = b_mask;
    }
}

// Calcule le nombre de différences (Distance)
int calculate_distance(const uint8_t* db_state, const uint8_t* target, const uint8_t* mask) {
    int dist = 0;
    for (int i = 0; i < STATE_SIZE; i++) {
        // XOR donne 1 là où les bits sont différents
        uint8_t diff = db_state[i] ^ target[i];
        
        // On ne garde que les différences sur les couleurs CONNUES (grâce au masque)
        // Si mask est 0 (pour un '?'), relevant_diff sera 0
        uint8_t relevant_diff = diff & mask[i];

        if (relevant_diff == 0) continue;

        // On compte les stickers différents dans cet octet (4 stickers par octet)
        // Masque 0xC0 = 11000000, 0x30 = 00110000, etc.
        if (relevant_diff & 0xC0) dist++;
        if (relevant_diff & 0x30) dist++;
        if (relevant_diff & 0x0C) dist++;
        if (relevant_diff & 0x03) dist++;
    }
    return dist;
}

int main(int argc, char *argv[]) {
    if (argc < 3) {
        // En cas d'erreur d'appel, on n'affiche rien ou un code erreur
        return 1;
    }

    const char* filename = argv[1];
    const char* state_str = argv[2];

    Entry *entries = NULL;
    size_t num_entries = 0;

    // --- CHARGEMENT FICHIER (Optimisé Linux/Windows) ---
#ifndef _WIN32
    int fd = open(filename, O_RDONLY);
    if (fd == -1) return 1;
    struct stat sb;
    if (fstat(fd, &sb) == -1) { close(fd); return 1; }
    void *map = mmap(0, sb.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (map == MAP_FAILED) { close(fd); return 1; }
    entries = (Entry*) map;
    num_entries = sb.st_size / ENTRY_SIZE;
#else
    FILE *f = fopen(filename, "rb");
    if (!f) return 1;
    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);
    num_entries = size / ENTRY_SIZE;
    entries = malloc(size);
    fread(entries, ENTRY_SIZE, num_entries, f);
    fclose(f);
#endif

    // --- PRÉPARATION ---
    uint8_t target[STATE_SIZE];
    uint8_t mask[STATE_SIZE];
    pack_target_with_mask(state_str, target, mask);

    // --- RECHERCHE DU PLUS PROCHE VOISIN ---
    int min_distance = INT_MAX;
    Entry* best_entry = NULL;

    for (size_t i = 0; i < num_entries; i++) {
        int dist = calculate_distance(entries[i].state, target, mask);

        if (dist < min_distance) {
            min_distance = dist;
            best_entry = &entries[i];

            // Optimisation : Si distance 0 (match parfait), on arrête tout de suite
            if (min_distance == 0) break;
        }
    }

    // --- SORTIE (JUSTE LA CHAÎNE CORRIGÉE) ---
    if (best_entry != NULL) {
        char corrected_str[37];
        unpack_state(best_entry->state, corrected_str);
        
        // On affiche UNIQUEMENT la chaîne corrigée sur stdout
        // C'est ce que Python va récupérer via subprocess
        printf("%s", corrected_str);
        
        // Si tu veux aussi le move, tu peux le mettre après un espace ou sur stderr
        // fprintf(stderr, " (Distance: %d, Move: %d)\n", min_distance, best_entry->move);
    } else {
        printf("ERROR");
    }

    // --- NETTOYAGE ---
#ifndef _WIN32
    munmap(entries, num_entries * ENTRY_SIZE);
    close(fd);
#else
    free(entries);
#endif

    return 0;
}