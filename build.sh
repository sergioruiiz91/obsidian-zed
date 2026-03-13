#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "▶ 1/3 Compilando Language Server (TypeScript)..."
cd "$ROOT/language-server"
npm install && npm run build

echo "▶ 2/3 Compilando extensión Rust → WASM..."
cd "$ROOT"
rustup target add wasm32-wasi 2>/dev/null || true
cargo build --target wasm32-wasi --release

echo "▶ 3/3 Instalando extensión en Zed..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  ZED_EXT_DIR="$HOME/Library/Application Support/Zed/extensions/installed/obsidian-vault"
else
  ZED_EXT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/zed/extensions/installed/obsidian-vault"
fi

mkdir -p "$ZED_EXT_DIR/language-server/dist" "$ZED_EXT_DIR/languages/markdown"
cp extension.toml "$ZED_EXT_DIR/"
cp -r languages/markdown/. "$ZED_EXT_DIR/languages/markdown/"
cp language-server/dist/*.js "$ZED_EXT_DIR/language-server/dist/"
cp target/wasm32-wasi/release/obsidian_vault.wasm "$ZED_EXT_DIR/extension.wasm"

echo "✅ Instalación limpia completada. ¡Cierra y vuelve a abrir Zed!"
