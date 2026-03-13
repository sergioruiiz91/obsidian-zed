#!/usr/bin/env bash

echo "🛠️ Aplicando parches a la extensión..."

# 1. Reescribir src/lib.rs
cat <<'EOF' >src/lib.rs
use serde_json::json;
use zed_extension_api::{self as zed, LanguageServerId, Result, Worktree};

struct ObsidianExtension;

impl ObsidianExtension {
    fn is_obsidian_vault(worktree: &Worktree) -> bool {
        // Buscamos si existe la carpeta de configuración de Obsidian
        worktree.read_text_file(".obsidian/app.json").is_ok()
            || worktree.read_text_file(".obsidian/workspace.json").is_ok()
            || worktree.read_text_file(".obsidian/workspace").is_ok()
    }
}

impl zed::Extension for ObsidianExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        language_server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<zed::Command> {
        // 1. Usar la API nativa de Zed para obtener Node
        let node = zed::node_binary_path()
            .map_err(|e| format!("Error al obtener Node: {}", e))?;

        // 2. En el entorno WASM de Zed, el current_dir() es la raíz de la extensión instalada
        let ext_dir = std::env::current_dir()
            .map_err(|e| format!("Error al leer directorio de la extensión: {}", e))?;
        
        let server_script = ext_dir.join("language-server/dist/index.js");
        let is_vault = Self::is_obsidian_vault(worktree);

        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::None,
        );

        Ok(zed::Command {
            command: node,
            args: vec![
                server_script.to_string_lossy().to_string(),
                "--stdio".to_string(),
                if is_vault { "--obsidian".to_string() } else { "--no-obsidian".to_string() },
            ],
            env: vec![],
        })
    }

    fn language_server_workspace_configuration(
        &mut self,
        _server_id: &LanguageServerId,
        worktree: &Worktree,
    ) -> Result<Option<serde_json::Value>> {
        let is_vault = Self::is_obsidian_vault(worktree);
        Ok(Some(json!({
            "obsidian": {
                "enabled": is_vault,
                "vaultRoot": worktree.root_path()
            }
        })))
    }
}

zed::register_extension!(ObsidianExtension);
EOF
echo "✅ src/lib.rs actualizado."

# 2. Reescribir build.sh
cat <<'EOF' >build.sh
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
EOF
chmod +x build.sh
echo "✅ build.sh actualizado."

# 3. Parchear language-server/src/index.ts
# Añadimos el import de child_process al principio usando un archivo temporal
TMP_FILE=$(mktemp)
echo '#!/usr/bin/env node' >"$TMP_FILE"
echo 'import { exec } from "child_process";' >>"$TMP_FILE"
tail -n +2 language-server/src/index.ts >>"$TMP_FILE"
mv "$TMP_FILE" language-server/src/index.ts

# Reemplazamos la lógica de abrir el grafo para no depender de Zed tasks
# Esto busca la línea exacta y la reemplaza usando node (para evitar problemas con sed en Mac/Linux)
node -e '
const fs = require("fs");
let content = fs.readFileSync("language-server/src/index.ts", "utf8");
const oldCode = `      try {
        const outPath = generateGraphFile(vaultRoot);
        connection.window.showInformationMessage(
          \`✅ Grafo generado → ${"$"}{outPath}  (ábrelo en el navegador)\`
        );`;
const newCode = `      try {
        const outPath = generateGraphFile(vaultRoot);
        exec(\`xdg-open "${"$"}{outPath}" 2>/dev/null || open "${"$"}{outPath}" 2>/dev/null || start "" "${"$"}{outPath}"\`);
        connection.window.showInformationMessage(
          \`✅ Grafo generado y abierto en el navegador\`
        );`;
content = content.replace(oldCode, newCode);
fs.writeFileSync("language-server/src/index.ts", content);
'
echo "✅ language-server/src/index.ts actualizado."

# 4. Eliminar basura
rm -rf scripts/ CONFIGURACION_MANUAL.md
echo "🗑️  Archivos de scripts de Python eliminados."

echo ""
echo "🎉 ¡Todo parcheado con éxito!"
echo "👉 Ahora simplemente ejecuta: ./build.sh"
