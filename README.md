# Pyraminx Solver (BFS & Web Interface)

This project provides a web-based tool to scan and solve a 3x3 Pyraminx puzzle. It uses computer vision to detect the puzzle's state and a Breadth-First Search (BFS) algorithm to find the optimal solution (shortest path).

## Overview

The application is built with Python (Flask) for the web interface and C for the core pathfinding algorithm to improve performance. It is designed to run on limited hardware (like a Raspberry Pi) but works on standard computers as well.

### Key Features

* **Optimal Resolution:** Finds the shortest solution sequence (11 moves or fewer without tips).
* **Computer Vision:** Detects colors automatically using OpenCV.
* **Web Interface:** A simple responsive interface to scan and view the solution.
* **Performance:** The search algorithm is implemented in C to ensure fast execution times.

## How it Works

### 1. The Algorithm (BFS)

The solver uses a Breadth-First Search approach. Instead of calculating the solution on the fly using heuristics, it uses pre-computed lookup tables.

* The system generates databases containing all reachable states from a solved Pyraminx.
* It handles the **12 possible spatial orientations** of a solved puzzle, allowing the user to scan the puzzle in any orientation without needing to manually realign it to a specific base face.

### 2. Optimization

To ensure the lookup process is fast:

* **Binary Storage:** State tables are stored in compact binary format (`.bin`) rather than JSON.
* **C Implementation:** The search logic is written in C. This allows the application to find a solution in a fraction of a second, significantly faster than a pure Python implementation.

## Project Structure

```bash
.
├── app.py              # Main Flask application
├── algorithms/
│   ├── scan.py         # Image processing and color detection
│   └── solver/
│       ├── BFS/        # Binary lookup tables (.bin)
│       ├── solver.py   # Python wrapper
│       └── fast_solver # Compiled C executable
├── static/             # Frontend assets (JS, CSS, 3D models)
└── templates/          # HTML templates

```

## Installation and Usage

### Prerequisites

* Python 3.9+
* GCC (to compile the C solver)

### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/rand-h/BFS-Pyraminx-3x3-solver.git
cd BFS-Pyraminx-3x3-solver/app

```


2. **Install dependencies:**
```bash
pip install -r requirements.txt

```


3. **Compile the C solver:**
The search engine needs to be compiled for your machine.
```bash
gcc -o algorithms/solver/fast_solver algorithms/solver/solver.c

```


4. **Run the application:**
```bash
python app.py

```


The interface will be accessible at `https://localhost:5000`.

## Credits

The core logic for the BFS algorithm was inspired by the repository:
[https://github.com/obadakatma/Pyraminx-Cube-Solver](https://github.com/obadakatma/Pyraminx-Cube-Solver)

## Author
```tex
@misc{BFS_Pyraminx_3x3_Solver,
  author       = {rand-h},
  title        = {Pyraminx Solver: BFS Algorithm and IoT Interface},
  howpublished = {\url{https://github.com/rand-h/BFS-Pyraminx-3x3-solver}},
  year         = {2026},
```
