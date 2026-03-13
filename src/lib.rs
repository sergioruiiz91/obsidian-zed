use serde_json::json;
use zed_extension_api::{self as zed, LanguageServerId, Result, Worktree};

struct ObsidianExtension;

impl ObsidianExtension {
    fn is_obsidian_vault(worktree: &Worktree) -> bool {
        worktree
            .read_text_file(".obsidian/app.json")
            .or_else(|_| worktree.read_text_file(".obsidian/workspace.json"))
            .is_ok()
    }

    fn find_node(worktree: &Worktree) -> Option<String> {
        let path_env = worktree
            .shell_env()
            .into_iter()
            .find(|(k, _)| k == "PATH")
            .map(|(_, v)| v)?;

        for dir in path_env.split(':') {
            let candidate = format!("{}/node", dir);
            if std::fs::metadata(&candidate).is_ok() {
                return Some(candidate);
            }
        }
        None
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
        let node = Self::find_node(worktree)
            .ok_or_else(|| "No se encontró 'node' en el PATH. Instala Node.js 18+.".to_string())?;

        let ext_dir = worktree
            .shell_env()
            .into_iter()
            .find(|(k, _)| k == "ZED_EXTENSION_DIR")
            .map(|(_, v)| v)
            .unwrap_or_else(|| ".".to_string());

        let server_script = format!("{}/language-server/dist/index.js", ext_dir);
        let is_vault = Self::is_obsidian_vault(worktree);

        zed::set_language_server_installation_status(
            language_server_id,
            &zed::LanguageServerInstallationStatus::None,
        );

        Ok(zed::Command {
            command: node,
            args: vec![
                server_script,
                "--stdio".to_string(),
                if is_vault { "--obsidian".to_string() } else { "--no-obsidian".to_string() },
            ],
            env: Default::default(),
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
