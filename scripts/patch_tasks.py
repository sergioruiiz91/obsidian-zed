#!/usr/bin/env python3
"""
patch_tasks.py — Parcheador quirúrgico de tasks.json de Zed (JSONC).

Estrategia:
  - El tasks.json es un array JSON [ {...}, {...} ]
  - Puede tener trailing commas y comentarios (JSONC)
  - Strip de comments/trailing-commas → parseo seguro
  - Eliminar tareas obsidian previas (por label prefix)
  - Insertar las 3 tareas nuevas al principio
  - Serializar de vuelta manteniendo formato compacto
"""

import sys, re, json

tasks_path = sys.argv[1]
lsp_dist   = sys.argv[2]

with open(tasks_path, encoding="utf-8") as f:
    raw = f.read()

def strip_jsonc(text):
    """Elimina comentarios // y /* */ y trailing commas."""
    # Eliminar comentarios de línea
    text = re.sub(r'//[^\n]*', '', text)
    # Eliminar comentarios de bloque
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.DOTALL)
    # Eliminar trailing commas antes de } o ]
    text = re.sub(r',\s*([}\]])', r'\1', text)
    return text

cleaned = strip_jsonc(raw)

try:
    tasks = json.loads(cleaned)
    if not isinstance(tasks, list):
        tasks = []
except json.JSONDecodeError as e:
    print(f"  ⚠  tasks.json no es JSON válido incluso después de limpiar: {e}")
    print(f"     Se creará un tasks.json nuevo respetando las tareas existentes.")
    tasks = []

# Eliminar versiones anteriores de las tareas obsidian
before = len(tasks)
tasks = [t for t in tasks if not str(t.get("label","")).startswith("Obsidian:")]
removed = before - len(tasks)
if removed:
    print(f"  → Eliminadas {removed} tarea(s) Obsidian anteriores")

# Plataforma: xdg-open (Linux) o open (macOS)
open_cmd = "xdg-open $ZED_WORKTREE_ROOT/vault-graph.html 2>/dev/null || open $ZED_WORKTREE_ROOT/vault-graph.html"

new_tasks = [
    {
        "label": "Obsidian: Crear grafo del vault",
        "command": "node",
        "args": [f"{lsp_dist}/generate-graph.js", "$ZED_WORKTREE_ROOT"],
        "tags": ["obsidian"],
        "reveal": "always"
    },
    {
        "label": "Obsidian: Insertar plantilla YAML",
        "command": "node",
        "args": [f"{lsp_dist}/insert-template.js", "$ZED_FILE"],
        "tags": ["obsidian"],
        "reveal": "always"
    },
    {
        "label": "Obsidian: Abrir grafo en navegador",
        "command": "bash",
        "args": ["-c", open_cmd],
        "tags": ["obsidian"],
        "reveal": "never"
    },
]

final_tasks = new_tasks + tasks

with open(tasks_path, "w", encoding="utf-8") as f:
    json.dump(final_tasks, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"  ✓  3 tareas Obsidian registradas ({len(final_tasks)} tareas en total)")
print(f"  ✓  tasks.json guardado: {tasks_path}")
