#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "════════════════════════════════════════"
echo "  obsidian-vault · Build Script v3"
echo "════════════════════════════════════════"

# ── 1. Language Server ────────────────────────────────────────────────────────
echo ""
echo "▶ 1/5  Compilando Language Server (TypeScript)..."
cd "$ROOT/language-server"
if ! command -v node &>/dev/null; then echo "  ✗ Node.js no encontrado."; exit 1; fi
npm install
npm run build
echo "  ✓ Language Server compilado"

# ── 2. Rust → WASM ───────────────────────────────────────────────────────────
echo ""
echo "▶ 2/5  Compilando extensión Rust → WASM..."
cd "$ROOT"
if ! command -v cargo &>/dev/null; then echo "  ✗ Rust/Cargo no encontrado."; exit 1; fi

if rustup target list --installed 2>/dev/null | grep -q "wasm32-wasip1"; then
  WASM_TARGET="wasm32-wasip1"
elif rustup target list 2>/dev/null | grep -q "wasm32-wasip1"; then
  rustup target add wasm32-wasip1; WASM_TARGET="wasm32-wasip1"
elif rustup target list --installed 2>/dev/null | grep -q "wasm32-wasi"; then
  WASM_TARGET="wasm32-wasi"
else
  rustup target add wasm32-wasip1 2>/dev/null && WASM_TARGET="wasm32-wasip1" \
    || { rustup target add wasm32-wasi; WASM_TARGET="wasm32-wasi"; }
fi

echo "  → Usando target: $WASM_TARGET"
cargo build --target "$WASM_TARGET" --release
WASM_OUT="target/$WASM_TARGET/release/obsidian_vault.wasm"
echo "  ✓ WASM compilado"

# ── 3. Instalar extensión ─────────────────────────────────────────────────────
echo ""
echo "▶ 3/5  Instalando extensión en Zed..."
cd "$ROOT"

if [[ "$OSTYPE" == "darwin"* ]]; then
  ZED_EXT_DIR="$HOME/Library/Application Support/Zed/extensions/installed/obsidian-vault"
  ZED_CONFIG_DIR="$HOME/Library/Application Support/Zed"
else
  ZED_EXT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/zed/extensions/installed/obsidian-vault"
  ZED_CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/zed"
fi

ZED_SETTINGS="$ZED_CONFIG_DIR/settings.json"
ZED_TASKS="$ZED_CONFIG_DIR/tasks.json"
LSP_DIST="$ZED_EXT_DIR/language-server/dist"

mkdir -p "$ZED_EXT_DIR/language-server/dist" "$ZED_EXT_DIR/languages/markdown"
cp extension.toml              "$ZED_EXT_DIR/"
cp -r languages/markdown/.     "$ZED_EXT_DIR/languages/markdown/"
cp language-server/dist/index.js            "$LSP_DIST/"
cp language-server/dist/graph-generator.js  "$LSP_DIST/"
cp language-server/dist/generate-graph.js   "$LSP_DIST/" 2>/dev/null || true
cp language-server/dist/insert-template.js  "$LSP_DIST/" 2>/dev/null || true
cp scripts/patch_settings.py               "$LSP_DIST/"
cp scripts/patch_tasks.py                  "$LSP_DIST/"
cp scripts/create_manual_guide.py          "$LSP_DIST/"
cp "$WASM_OUT"                             "$ZED_EXT_DIR/extension.wasm"
echo "  ✓ Extensión instalada en: $ZED_EXT_DIR"

# ── Tracking de fallos para la guía manual ────────────────────────────────────
FAILED_PARTS=()

# ── 4. Parchear settings.json ─────────────────────────────────────────────────
echo ""
echo "▶ 4/5  Configurando settings.json (modo quirúrgico)..."

if [[ ! -f "$ZED_SETTINGS" ]]; then
  mkdir -p "$ZED_CONFIG_DIR"
  cat > "$ZED_SETTINGS" << 'JSON'
{
  "languages": {
    "Markdown": {
      "language_servers": ["obsidian-lsp", "..."]
    }
  }
}
JSON
  echo "  ✓ settings.json creado desde cero"
else
  if python3 "$ROOT/scripts/patch_settings.py" "$ZED_SETTINGS"; then
    : # ok
  else
    echo "  ✗ No se pudo parchear settings.json automáticamente"
    FAILED_PARTS+=("settings")
  fi
fi

# ── 5. Parchear tasks.json ────────────────────────────────────────────────────
echo ""
echo "▶ 5/5  Registrando tareas en Ctrl+Shift+P..."

[[ ! -f "$ZED_TASKS" ]] && echo '[]' > "$ZED_TASKS"

if python3 "$ROOT/scripts/patch_tasks.py" "$ZED_TASKS" "$LSP_DIST"; then
  : # ok
else
  echo "  ✗ No se pudo parchear tasks.json automáticamente"
  FAILED_PARTS+=("tasks")
fi

# ── Generar guía manual si algo falló ────────────────────────────────────────
echo ""
if [[ ${#FAILED_PARTS[@]} -gt 0 ]]; then
  echo "════════════════════════════════════════"
  echo "  ⚠  Algunos pasos requieren config manual"
  echo "════════════════════════════════════════"
  python3 "$ROOT/scripts/create_manual_guide.py" \
    "$ZED_CONFIG_DIR" \
    "$LSP_DIST" \
    "${FAILED_PARTS[@]}"
  echo ""
  echo "  👉 Abre el archivo CONFIGURACION_MANUAL.md"
  echo "     en la carpeta de la extensión y sigue"
  echo "     las instrucciones marcadas con ❌"
  echo ""
else
  echo "════════════════════════════════════════"
  echo "  ✅ Build completado sin errores."
  echo ""
  echo "  → Reinicia Zed"
  echo "  → Ctrl+Shift+P → escribe 'Obsidian':"
  echo "      · Obsidian: Crear grafo del vault"
  echo "      · Obsidian: Insertar plantilla YAML"
  echo "      · Obsidian: Abrir grafo en navegador"
fi
echo "════════════════════════════════════════"
