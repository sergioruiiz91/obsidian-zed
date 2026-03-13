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
