#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "▶ 1/3 Compilando Language Server (TypeScript)..."
cd "$ROOT/language-server"
npm install && npm run build

echo "▶ 2/3 Compilando extensión Rust → WASM..."
cd "$ROOT"
WASM_TARGET="wasm32-wasip1"
rustup target add $WASM_TARGET 2>/dev/null || true
cargo build --target $WASM_TARGET --release

echo "▶ 3/3 Instalando extensión en Zed..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  ZED_EXT_DIR="$HOME/Library/Application Support/Zed/extensions/installed/obsidian-vault"
else
  ZED_EXT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/zed/extensions/installed/obsidian-vault"
fi

# Solo copiamos los archivos si NO estamos ya en la carpeta de destino
if [ "$ROOT" != "$ZED_EXT_DIR" ]; then
  mkdir -p "$ZED_EXT_DIR/language-server/dist" "$ZED_EXT_DIR/languages/markdown"
  cp extension.toml "$ZED_EXT_DIR/"
  cp -r languages/markdown/. "$ZED_EXT_DIR/languages/markdown/"
  cp language-server/dist/*.js "$ZED_EXT_DIR/language-server/dist/"
fi

# El WASM siempre hay que moverlo desde la carpeta target/ a la raíz
cp "target/$WASM_TARGET/release/obsidian_vault.wasm" "$ZED_EXT_DIR/extension.wasm"

echo "✅ Instalación limpia completada. ¡Cierra y vuelve a abrir Zed!"
