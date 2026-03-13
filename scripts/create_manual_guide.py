#!/usr/bin/env python3
"""
create_manual_guide.py
Genera CONFIGURACION_MANUAL.md cuando el parcheo automático falla.
Recibe como argumentos qué partes fallaron.
"""

import sys, os, datetime

zed_config_dir = sys.argv[1] if len(sys.argv) > 1 else "~/.config/zed"
lsp_dist       = sys.argv[2] if len(sys.argv) > 2 else "/ruta/a/obsidian-vault/language-server/dist"
failed_parts   = sys.argv[3:] if len(sys.argv) > 3 else ["settings", "tasks"]

settings_path = os.path.join(zed_config_dir, "settings.json")
tasks_path    = os.path.join(zed_config_dir, "tasks.json")
out_path      = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "CONFIGURACION_MANUAL.md")

now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

sections = []

sections.append(f"""# ⚙️ Configuración manual de obsidian-vault para Zed

Generado automáticamente el {now} porque el parcheo automático no pudo
modificar uno o más archivos de configuración de Zed.

Sigue los pasos que aparecen marcados con ❌ — los marcados con ✅ ya se
completaron solos.

---
""")

# ── settings.json ─────────────────────────────────────────────────────────────
if "settings" in failed_parts:
    sections.append(f"""## ❌ Paso 1 — Añadir obsidian-lsp a `settings.json`

**Archivo a editar:** `{settings_path}`

Abre el archivo y localiza el bloque `"Markdown"` dentro de `"languages"`.
Añade `"obsidian-lsp"` **al principio** del array `"language_servers"`, así:

```jsonc
// settings.json
{{
  "languages": {{

    // ── Bloque Markdown ──────────────────────────────────────────
    "Markdown": {{
      "language_servers": [
        "obsidian-lsp",   // ← AÑADE ESTA LÍNEA
        "markdownlint",   // tus servidores existentes
        "tree-sitter",
        "..."
      ],
      // ... el resto de tus opciones permanecen igual ...
    }},

    // ── Bloque Markdown-Inline (si lo tienes) ────────────────────
    "Markdown-Inline": {{
      "language_servers": [
        "obsidian-lsp",   // ← AÑADE ESTA LÍNEA AQUÍ TAMBIÉN
        "markdownlint",
        "tree-sitter",
        "..."
      ],
    }},

  }}
}}
```

> **¿No tienes bloque `"Markdown"`?** Crea la sección entera:
>
> ```jsonc
> {{
>   "languages": {{
>     "Markdown": {{
>       "language_servers": ["obsidian-lsp", "..."]
>     }}
>   }}
> }}
> ```

> **Importante:** Zed usa JSONC — se permiten trailing commas y comentarios `//`.
> No rompas la estructura de llaves `{{}}` existente.

---
""")
else:
    sections.append("## ✅ Paso 1 — settings.json configurado correctamente\n\n---\n")

# ── tasks.json ────────────────────────────────────────────────────────────────
if "tasks" in failed_parts:
    sections.append(f"""## ❌ Paso 2 — Añadir tareas Obsidian a `tasks.json`

**Archivo a editar:** `{tasks_path}`

Las tareas de Zed son los comandos que aparecen en `Ctrl+Shift+P`.
El archivo es un **array JSON** `[...]`. Añade los tres objetos siguientes
**al principio** del array (antes de cualquier tarea que ya tengas):

```json
[
  {{
    "label": "Obsidian: Crear grafo del vault",
    "command": "node",
    "args": [
      "{lsp_dist}/generate-graph.js",
      "$ZED_WORKTREE_ROOT"
    ],
    "tags": ["obsidian"],
    "reveal": "always"
  }},
  {{
    "label": "Obsidian: Insertar plantilla YAML",
    "command": "node",
    "args": [
      "{lsp_dist}/insert-template.js",
      "$ZED_FILE"
    ],
    "tags": ["obsidian"],
    "reveal": "always"
  }},
  {{
    "label": "Obsidian: Abrir grafo en navegador",
    "command": "bash",
    "args": [
      "-c",
      "xdg-open $ZED_WORKTREE_ROOT/vault-graph.html 2>/dev/null || open $ZED_WORKTREE_ROOT/vault-graph.html"
    ],
    "tags": ["obsidian"],
    "reveal": "never"
  }},

  // ... tus tareas existentes van aquí debajo ...
]
```

> **Variables que usa Zed automáticamente:**
> - `$ZED_WORKTREE_ROOT` → carpeta raíz del proyecto abierto (tu vault)
> - `$ZED_FILE` → ruta del archivo `.md` que tienes abierto en ese momento

> **¿El archivo no existe?** Créalo en `{tasks_path}` con el contenido
> del bloque JSON de arriba (sin los comentarios `//`).

---
""")
else:
    sections.append("## ✅ Paso 2 — tasks.json configurado correctamente\n\n---\n")

# ── Verificación ──────────────────────────────────────────────────────────────
sections.append(f"""## 🔍 Cómo verificar que todo funciona

1. **Reinicia Zed** completamente (cierra y vuelve a abrir).

2. **Abre tu vault** en Zed (`File → Open Folder` → carpeta con `.obsidian/`).

3. **Comprueba el LSP:** Abre un archivo `.md`, escribe `tas` y pulsa
   `Ctrl+Space` — debe aparecer el snippet *"Nota de tarea"*.

4. **Comprueba las tareas:** `Ctrl+Shift+P` → escribe `Obsidian` → deben
   aparecer las tres opciones:
   - `Obsidian: Crear grafo del vault`
   - `Obsidian: Insertar plantilla YAML`
   - `Obsidian: Abrir grafo en navegador`

5. **Comprueba el log:** `Ctrl+Shift+P` → `Open Log` → busca:
   ```
   [obsidian-lsp] Vault escaneado: X notas, Y tags únicos.
   ```

---

## 🆘 Si sigue sin funcionar

Ejecuta este comando para comprobar que `node` es accesible desde Zed:

```bash
which node && node --version
```

Si el resultado es correcto (`/usr/bin/node` o similar, versión 18+) pero
Zed sigue sin arrancar el LSP, añade la ruta explícita de node en
`settings.json`:

```jsonc
{{
  "lsp": {{
    "obsidian-lsp": {{
      "binary": {{
        "path": "/ruta/completa/a/node"  // resultado de: which node
      }}
    }}
  }}
}}
```
""")

content = "\n".join(sections)

with open(out_path, "w", encoding="utf-8") as f:
    f.write(content)

print(f"  📄 Guía de configuración manual generada: {out_path}")
