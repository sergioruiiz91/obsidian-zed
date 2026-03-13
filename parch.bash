#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "========================================"
echo " 🛠️  PARCHEANDO Y COMPILANDO EXTENSIÓN  "
echo "========================================"

echo "▶ 1/6 Regenerando archivos de configuración base..."
# Recreamos extension.toml por si se había borrado
cat << 'INNER_EOF' > "$ROOT/extension.toml"
id = "obsidian-vault"
name = "Obsidian Vault"
version = "0.2.0"
schema_version = 1
description = "Detecta vaults de Obsidian, ofrece snippets, autocompletado de tags y visualización del grafo de notas."
authors = ["Tu Nombre <tu@email.com>"]
repository = "https://github.com/tuusuario/obsidian-zed"

[language_servers.obsidian-lsp]
name = "Obsidian LSP"
language = "Markdown"
INNER_EOF

# Recreamos la configuración de Markdown
mkdir -p "$ROOT/languages/markdown"
cat << 'INNER_EOF' > "$ROOT/languages/markdown/config.toml"
name = "Markdown"
scope = "text.markdown"
injection-regex = "md|markdown"
file-types = ["md", "markdown", "mdx"]

[indent]
tab-width = 2
unit = "  "
INNER_EOF

echo "▶ 2/6 Parcheando src/lib.rs..."
cat << 'INNER_EOF' > "$ROOT/src/lib.rs"
use serde_json::json;
use zed_extension_api::{self as zed, LanguageServerId, Result, Worktree};

struct ObsidianExtension;

impl ObsidianExtension {
    fn is_obsidian_vault(worktree: &Worktree) -> bool {
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
        let node = zed::node_binary_path()
            .map_err(|e| format!("Error al obtener Node: {}", e))?;

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
INNER_EOF

echo "▶ 3/6 Parcheando language-server/src/index.ts..."
if ! grep -q 'import { exec }' "$ROOT/language-server/src/index.ts"; then
    TMP_FILE=$(mktemp)
    echo '#!/usr/bin/env node' > "$TMP_FILE"
    echo 'import { exec } from "child_process";' >> "$TMP_FILE"
    tail -n +2 "$ROOT/language-server/src/index.ts" >> "$TMP_FILE"
    mv "$TMP_FILE" "$ROOT/language-server/src/index.ts"
fi

node -e '
const fs = require("fs");
const path = require("path");
const indexPath = path.join(process.argv[1], "language-server/src/index.ts");
let content = fs.readFileSync(indexPath, "utf8");

const searchStr = "✅ Grafo generado →";
if (content.includes(searchStr)) {
  content = content.replace(
    /const outPath = generateGraphFile\(vaultRoot\);[\s\S]*?✅ Grafo generado → \$\{outPath\}  \(ábrelo en el navegador\)\`\n\s*\);/,
    `const outPath = generateGraphFile(vaultRoot);\n        exec(\`xdg-open "\${outPath}" 2>/dev/null || open "\${outPath}" 2>/dev/null || start "" "\${outPath}"\`);\n        connection.window.showInformationMessage(\n          \`✅ Grafo generado y abierto en el navegador\`\n        );`
  );
  fs.writeFileSync(indexPath, content);
}
' "$ROOT"

echo "▶ 4/6 Limpiando archivos obsoletos (scripts Python)..."
rm -rf "$ROOT/scripts" "$ROOT/CONFIGURACION_MANUAL.md"

echo "▶ 5/6 Compilando Language Server (TypeScript)..."
cd "$ROOT/language-server"
npm install
npm run build

echo "▶ 6/6 Compilando extensión Rust e Instalando en Zed..."
cd "$ROOT"
WASM_TARGET="wasm32-wasip1"
rustup target add $WASM_TARGET 2>/dev/null || true
cargo build --target $WASM_TARGET --release

if [[ "$OSTYPE" == "darwin"* ]]; then
  ZED_EXT_DIR="$HOME/Library/Application Support/Zed/extensions/installed/obsidian-vault"
else
  ZED_EXT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/zed/extensions/installed/obsidian-vault"
fi

# Ahora usamos rutas absolutas seguras ($ROOT/...)
if [ "$ROOT" != "$ZED_EXT_DIR" ]; then
  mkdir -p "$ZED_EXT_DIR/language-server/dist" "$ZED_EXT_DIR/languages/markdown"
  cp "$ROOT/extension.toml" "$ZED_EXT_DIR/"
  cp -r "$ROOT/languages/markdown/." "$ZED_EXT_DIR/languages/markdown/"
  cp "$ROOT"/language-server/dist/*.js "$ZED_EXT_DIR/language-server/dist/"
fi

cp "$ROOT/target/$WASM_TARGET/release/obsidian_vault.wasm" "$ZED_EXT_DIR/extension.wasm"

echo "========================================"
echo " 🎉 ¡EXTENSIÓN INSTALADA CON ÉXITO! 🎉  "
echo "========================================"
echo "Abre Zed, ve a una carpeta con un .obsidian y prueba a escribir 'tas'."
