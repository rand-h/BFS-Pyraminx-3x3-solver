#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>

/* ===========================================================
   CORRECTION : LES INCLUDES DOIVENT ÊTRE ICI, PAS DANS MAIN
   =========================================================== */
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

const char* MOVE_NAMES[] = {
    "U", "U`", "R", "R`",
    "L", "L`", "B", "B`"
};

void pack_state(const char* input, uint8_t* output) {
    char color_map[] = "rgby";

    for (int i = 0; i < 9; i++) {
        uint8_t byte_val = 0;
        for (int j = 0; j < 4; j++) {
            int char_idx = i * 4 + j;
            char c = input[char_idx];
            uint8_t code = 0;

            for (int k = 0; k < 4; k++) {
                if (c == color_map[k]) {
                    code = k;
                    break;
                }
            }
            byte_val = (byte_val << 2) | code;
        }
        output[i] = byte_val;
    }
}

int compare_entries(const void *a, const void *b) {
    const uint8_t *stateA = ((const Entry*)a)->state;
    const uint8_t *stateB = ((const Entry*)b)->state;
    return memcmp(stateA, stateB, STATE_SIZE);
}

int main(int argc, char *argv[]) {

    if (argc < 3) {
        printf("Usage: %s <fichier.bin> <etat_string_36_chars>\n", argv[0]);
        return 1;
    }

    const char* filename = argv[1];
    const char* state_str = argv[2];

    if (strlen(state_str) != 36) {
        printf("Erreur: L'état doit faire exactement 36 caractères.\n");
        return 1;
    }

    Entry *entries = NULL;
    size_t num_entries = 0;

    /* ============================
        ========== LINUX ============
       ============================ */
#ifndef _WIN32
    // Les variables doivent être déclarées avant le code
    int fd = open(filename, O_RDONLY);
    if (fd == -1) {
        perror("Erreur d'ouverture du fichier");
        return 1;
    }

    struct stat sb;
    if (fstat(fd, &sb) == -1) {
        perror("Erreur fstat");
        close(fd);
        return 1;
    }

    void *map = mmap(0, sb.st_size, PROT_READ, MAP_PRIVATE, fd, 0);
    if (map == MAP_FAILED) {
        perror("Erreur mmap");
        close(fd);
        return 1;
    }

    entries = (Entry*) map;
    num_entries = sb.st_size / ENTRY_SIZE;

#else
    /* ============================
        ========= WINDOWS ===========
       ============================ */

    FILE *f = fopen(filename, "rb");
    if (!f) {
        perror("Erreur d'ouverture du fichier");
        return 1;
    }

    fseek(f, 0, SEEK_END);
    long size = ftell(f);
    fseek(f, 0, SEEK_SET);

    if (size % ENTRY_SIZE != 0) {
        printf("Erreur: fichier corrompu.\n");
        fclose(f);
        return 1;
    }

    num_entries = size / ENTRY_SIZE;

    entries = malloc(size);
    if (!entries) {
        printf("Erreur malloc\n");
        fclose(f);
        return 1;
    }

    fread(entries, ENTRY_SIZE, num_entries, f);
    fclose(f);

#endif

    /* ============================
        ======= RECHERCHE ==========
       ============================ */

    Entry key;
    pack_state(state_str, key.state);

    Entry *result = (Entry*) bsearch(&key, entries, num_entries, ENTRY_SIZE, compare_entries);

    if (result != NULL) {
        if (result->move == 255) {
            printf("START\n");
        } else if (result->move < 8) {
            printf("%s\n", MOVE_NAMES[result->move]);
        } else {
            printf("UNKNOWN_MOVE\n");
        }
    } else {
        printf("NOT_FOUND\n");
    }

#ifndef _WIN32
    munmap(entries, num_entries * ENTRY_SIZE);
    close(fd);
#else
    free(entries);
#endif

    return 0;
}