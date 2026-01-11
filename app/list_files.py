from pathlib import Path

# --- Configuration ---
base_dir = Path(".")             # Dossier à parcourir
output_txt = "files.txt"         # Fichier de sortie
# Dossiers à ignorer totalement
excluded_dirs = {"__pycache__", "venv", ".git", ".idea", ".vscode"}

def generate_tree(dir_path: Path, prefix: str = ""):
    """Génère une structure en arborescence sous forme de liste de chaînes."""
    tree_lines = []
    
    # Filtrer et trier le contenu du dossier
    try:
        # On récupère le contenu en ignorant les dossiers exclus et le fichier de sortie
        contents = [
            p for p in dir_path.iterdir() 
            if p.name not in excluded_dirs and p.name != output_txt and not p.name.startswith(".")
        ]
        contents.sort(key=lambda s: (not s.is_dir(), s.name.lower()))
    except PermissionError:
        return [prefix + " [!] Erreur de permission"]

    count = len(contents)
    for i, path in enumerate(contents):
        is_last = (i == count - 1)
        connector = "└── " if is_last else "├── "
        
        # Ajouter la ligne actuelle (nom du fichier ou dossier)
        tree_lines.append(prefix + connector + path.name)
        
        # Si c'est un dossier, on descend récursivement
        if path.is_dir():
            extension = "    " if is_last else "│   "
            tree_lines.extend(generate_tree(path, prefix + extension))
            
    return tree_lines

def main():
    print(f"[INFO] Analyse du dossier : {base_dir.absolute()}")
    
    # Initialisation de l'arborescence avec la racine
    tree_output = ["."] 
    tree_output.extend(generate_tree(base_dir))
    
    # Écriture du résultat
    try:
        content = "\n".join(tree_output)
        Path(output_txt).write_text(content, encoding="utf-8")
        print(f"[OK] Arborescence generee avec succes")
        print(f"[FILE] Resultat disponible dans : {output_txt}")
    except Exception as e:
        print(f"[ERREUR] Impossible d'ecrire le fichier : {e}")

if __name__ == "__main__":
    main()