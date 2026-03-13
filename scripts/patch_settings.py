#!/usr/bin/env python3
"""
patch_settings.py — Parcheador quirúrgico de settings.json de Zed (JSONC).

Estrategia:
  - NO parsea el JSON completo (fallaría con trailing commas / comentarios).
  - Localiza los bloques "Markdown" y "Markdown-Inline" con tracking de llaves.
  - Dentro de cada bloque, inyecta "obsidian-lsp" al principio de language_servers.
  - Si el bloque no existe, lo reporta pero continúa.
  - Si no existe ni "Markdown" ni "languages", crea la sección mínima.
  - NUNCA toca ninguna otra línea del archivo.
"""

import sys, re

settings_path = sys.argv[1]

with open(settings_path, encoding="utf-8") as f:
    lines = f.read().split("\n")

result = list(lines)

def find_block_range(lines, key_pattern):
    """
    Devuelve (start_line, end_line) del objeto JSON que sigue a key_pattern.
    Usa tracking de llaves para encontrar el bloque correcto.
    """
    key_re = re.compile(key_pattern)
    for i, line in enumerate(lines):
        if not key_re.search(line):
            continue
        depth = 0
        block_start = None
        block_end = None
        for j in range(i, len(lines)):
            for pos, ch in enumerate(lines[j]):
                if ch == "{":
                    if depth == 0:
                        block_start = j
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0 and block_start is not None:
                        block_end = j
                        break
            if block_end is not None:
                break
        if block_start is not None and block_end is not None:
            return (block_start, block_end)
    return None

def inject_lsp(lines, block_start, block_end, server="obsidian-lsp"):
    """
    Dentro de [block_start..block_end] busca "language_servers".
    Inyecta server al principio si no está ya.
    Retorna (lines_modificadas, True/False)
    """
    ls_re = re.compile(r'"language_servers"\s*:\s*\[')
    for i in range(block_start, block_end + 1):
        m = ls_re.search(lines[i])
        if not m:
            continue
        # ¿Ya está?
        search_range = "\n".join(lines[i:min(i+10, block_end+1)])
        if f'"{server}"' in search_range:
            return lines, False

        bracket_idx = lines[i].index("[", m.start()) + 1
        rest_of_line = lines[i][bracket_idx:]

        if "]" in rest_of_line:
            # Array en una sola línea
            close_idx = lines[i].index("]", bracket_idx)
            inner = lines[i][bracket_idx:close_idx].strip()
            if inner:
                lines[i] = lines[i][:bracket_idx] + f'"{server}", ' + lines[i][bracket_idx:]
            else:
                lines[i] = lines[i][:bracket_idx] + f'"{server}"' + lines[i][bracket_idx:]
        else:
            # Array multilínea — insertar justo después del [
            indent = re.match(r"(\s*)", lines[i]).group(1) + "  "
            lines.insert(i + 1, f'{indent}"{server}",')
        return lines, True
    return lines, False

def create_markdown_section(lines, server="obsidian-lsp"):
    """Crea sección Markdown mínima dentro de 'languages': {} o al final."""
    langs_re = re.compile(r'"languages"\s*:\s*\{')
    for i, line in enumerate(lines):
        if langs_re.search(line):
            indent = "    "
            new_lines = [
                f'{indent}"Markdown": {{',
                f'{indent}  "language_servers": ["{server}", "..."],',
                f'{indent}}},',
            ]
            for j, nl in enumerate(new_lines):
                lines.insert(i + 1 + j, nl)
            return lines, True
    # No hay "languages" — añadir antes del último }
    for i in range(len(lines)-1, -1, -1):
        if lines[i].strip() == "}":
            new_lines = [
                '  "languages": {',
                f'    "Markdown": {{',
                f'      "language_servers": ["{server}", "..."],',
                '    },',
                '  },',
            ]
            for j, nl in enumerate(new_lines):
                lines.insert(i + j, nl)
            break
    return lines, True

# ─── Ejecutar ─────────────────────────────────────────────────────────────────
BLOCKS = [
    (r'"Markdown"\s*:',        "Markdown"),
    (r'"Markdown-Inline"\s*:', "Markdown-Inline"),
]

found_any = False
for pattern, name in BLOCKS:
    rng = find_block_range(result, pattern)
    if rng is None:
        print(f"  ⚠  Bloque '{name}' no encontrado en settings.json — se omite.")
        continue
    found_any = True
    result, injected = inject_lsp(result, rng[0], rng[1])
    if injected:
        print(f"  ✓  obsidian-lsp añadido en '{name}'")
    else:
        print(f"  ✓  '{name}' ya tenía obsidian-lsp")

if not found_any:
    print("  ⚠  No se encontraron bloques Markdown — creando sección mínima...")
    result, _ = create_markdown_section(result)
    print("  ✓  Sección 'Markdown' creada")

with open(settings_path, "w", encoding="utf-8") as f:
    f.write("\n".join(result))
print(f"  ✓  settings.json guardado sin tocar el resto de la configuración")
