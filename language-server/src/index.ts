#!/usr/bin/env node
import { exec } from "child_process";
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  TextDocumentPositionParams,
  InitializeResult,
  TextDocumentSyncKind,
  DidChangeConfigurationNotification,
  MarkupKind,
  ExecuteCommandParams,
  TextEdit,
  Position,
  Range,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import * as fs from "fs";
import * as path from "path";
import { generateGraphFile } from "./graph-generator";

// ─── Config ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const IS_OBSIDIAN_VAULT = args.includes("--obsidian");

// ─── Conexión ─────────────────────────────────────────────────────────────────
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let vaultRoot = "";
let cachedTags: string[] = [];
let cachedNotes: { id: string; label: string; relPath: string }[] = [];
let hasConfigCapability = false;

// ─── Snippets ─────────────────────────────────────────────────────────────────
const FRONTMATTER_SNIPPET: CompletionItem = {
  label: "frontmatter",
  kind: CompletionItemKind.Snippet,
  detail: "Frontmatter YAML de Obsidian",
  documentation: { kind: MarkupKind.Markdown, value: "Propiedades YAML estándar." },
  insertText: [
    "---",
    "title: ${1:Título de la nota}",
    "date: ${2:{{date:YYYY-MM-DD}}}",
    "tags:",
    "  - ${3:tag1}",
    "  - ${4:tag2}",
    "aliases:",
    "  - ${5:alias}",
    "status: ${6|borrador,en-progreso,completado,archivado|}",
    "---",
    "",
    "${0}",
  ].join("\n"),
  insertTextFormat: InsertTextFormat.Snippet,
  sortText: "0001",
};

const TASK_NOTE_SNIPPET: CompletionItem = {
  label: "tas",
  kind: CompletionItemKind.Snippet,
  detail: "Nota de tarea / proyecto (Obsidian)",
  insertText: [
    "---",
    "title: ${1:Nombre de la tarea}",
    "date: ${2:{{date:YYYY-MM-DD}}}",
    "due: ${3:{{date:YYYY-MM-DD}}}",
    "priority: ${4|alta,media,baja|}",
    "status: ${5|pendiente,en-progreso,completado,cancelado|}",
    "tags:",
    "  - tarea",
    "  - ${6:proyecto}",
    "project: \"[[${7:Nombre del Proyecto}]]\"",
    "assignee: ${8:@yo}",
    "---",
    "",
    "## 📋 Descripción",
    "",
    "${9:Descripción de la tarea...}",
    "",
    "## ✅ Subtareas",
    "",
    "- [ ] ${10:Subtarea 1}",
    "- [ ] ${11:Subtarea 2}",
    "",
    "## 🔗 Referencias",
    "",
    "- ${0}",
  ].join("\n"),
  insertTextFormat: InsertTextFormat.Snippet,
  sortText: "0000",
};

const MEETING_SNIPPET: CompletionItem = {
  label: "reunion",
  kind: CompletionItemKind.Snippet,
  detail: "Nota de reunión (Obsidian)",
  insertText: [
    "---",
    "title: Reunión — ${1:Tema}",
    "date: ${2:{{date:YYYY-MM-DD}}}",
    "attendees:",
    "  - ${3:Persona 1}",
    "  - ${4:Persona 2}",
    "tags:",
    "  - reunión",
    "  - ${5:equipo}",
    "---",
    "",
    "## 📌 Agenda",
    "",
    "1. ${6:Punto 1}",
    "",
    "## 🗒️ Notas",
    "",
    "${7}",
    "",
    "## ✅ Acciones",
    "",
    "- [ ] ${0}",
  ].join("\n"),
  insertTextFormat: InsertTextFormat.Snippet,
  sortText: "0002",
};

const LITERATURE_SNIPPET: CompletionItem = {
  label: "libro",
  kind: CompletionItemKind.Snippet,
  detail: "Nota de literatura / libro (Obsidian)",
  insertText: [
    "---",
    "title: \"${1:Título}\"",
    "author: \"${2:Autor}\"",
    "year: ${3:2024}",
    "genre: ${4:No ficción}",
    "rating: ${5|⭐,⭐⭐,⭐⭐⭐,⭐⭐⭐⭐,⭐⭐⭐⭐⭐|}",
    "status: ${6|por-leer,leyendo,leído|}",
    "tags:",
    "  - libro",
    "  - ${7:tema}",
    "source: \"${8:ISBN / URL}\"",
    "---",
    "",
    "## 💡 Ideas principales",
    "",
    "${9:Resumen...}",
    "",
    "## 📝 Citas",
    "",
    "> ${0}",
  ].join("\n"),
  insertTextFormat: InsertTextFormat.Snippet,
  sortText: "0003",
};

const CALLOUT_SNIPPET: CompletionItem = {
  label: "callout",
  kind: CompletionItemKind.Snippet,
  detail: "Callout de Obsidian",
  insertText: [
    "> [!${1|note,tip,important,warning,danger,info,success,question,bug,example,quote|}]${2: Título}",
    "> ${0:Contenido del callout}",
  ].join("\n"),
  insertTextFormat: InsertTextFormat.Snippet,
  sortText: "0004",
};

function makePropertySnippet(label: string, detail: string, insertText: string, sort: string): CompletionItem {
  return { label, kind: CompletionItemKind.Property, detail, insertText, insertTextFormat: InsertTextFormat.Snippet, sortText: sort };
}

const PROPERTY_SNIPPETS: CompletionItem[] = [
  makePropertySnippet("date",       "Propiedad: fecha",           "date: ${1:{{date:YYYY-MM-DD}}}",                 "0010"),
  makePropertySnippet("tags",       "Propiedad: tags",            "tags:\n  - ${1:tag}",                            "0011"),
  makePropertySnippet("aliases",    "Propiedad: aliases",         'aliases:\n  - "${1:alias}"',                     "0012"),
  makePropertySnippet("status",     "Propiedad: estado",          "status: ${1|borrador,en-progreso,completado,archivado|}", "0013"),
  makePropertySnippet("priority",   "Propiedad: prioridad",       "priority: ${1|alta,media,baja|}",                "0014"),
  makePropertySnippet("due",        "Propiedad: fecha límite",    "due: ${1:{{date:YYYY-MM-DD}}}",                  "0015"),
  makePropertySnippet("cssclasses", "Propiedad: clases CSS",      "cssclasses:\n  - ${1:clase}",                    "0016"),
  makePropertySnippet("publish",    "Propiedad: publicar",        "publish: ${1|true,false|}",                      "0017"),
];

const DEFAULT_TAGS = [
  "proyecto","tarea","reunión","idea","referencia","libro","artículo",
  "archivo","pendiente","importante","personal","trabajo","aprendizaje","recurso",
];

// ─── Plantilla YAML para el comando de paleta ─────────────────────────────────
const YAML_TEMPLATE = [
  "---",
  "title: ",
  "date: ",
  "tags:",
  "  - ",
  "aliases:",
  "  - ",
  "status: borrador",
  "---",
  "",
].join("\n");

// ─── Escaneo completo del vault ───────────────────────────────────────────────
// Recorre TODOS los .md/.markdown del vault sin importar la subcarpeta.
// Extrae: tags del frontmatter + tags inline (#tag) + nombres de nota para wikilinks.
function scanVaultFull(root: string): void {
  const tags = new Set<string>(DEFAULT_TAGS);
  const notes: typeof cachedNotes = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && /\.(md|markdown)$/i.test(entry.name)) {
        const relPath = path.relative(root, full);
        const id = relPath.replace(/\.(md|markdown)$/i, "").replace(/\\/g, "/");
        const label = path.basename(entry.name).replace(/\.(md|markdown)$/i, "");
        notes.push({ id, label, relPath });
        extractFromFile(full, tags);
      }
    }
  }

  walk(root);

  cachedTags = Array.from(tags).sort();
  cachedNotes = notes;
  connection.console.log(
    `[obsidian-lsp] Vault escaneado: ${notes.length} notas, ${cachedTags.length} tags únicos.`
  );
}

function extractFromFile(filePath: string, tags: Set<string>) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");

    // Tags en frontmatter
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fm) {
      const tagBlock = fm[1].match(/^tags:\s*\n((?:[ \t]+-[ \t]+\S+\r?\n?)+)/m);
      if (tagBlock) {
        tagBlock[1].split("\n").forEach(l => {
          const t = l.replace(/^[ \t]+-[ \t]+/, "").trim();
          if (t) tags.add(t);
        });
      }
      // tags: [a, b] inline style
      const tagInline = fm[1].match(/^tags:\s*\[([^\]]+)\]/m);
      if (tagInline) {
        tagInline[1].split(",").forEach(t => { const s = t.trim().replace(/["']/g,""); if(s) tags.add(s); });
      }
    }

    // Tags inline #tag en el cuerpo (ignora el frontmatter)
    const body = content.replace(/^---[\s\S]*?---/, "");
    const re = /#([a-zA-ZÀ-ÿ0-9/_-]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) tags.add(m[1]);
  } catch { /* ignorar */ }
}

// ─── Completados ──────────────────────────────────────────────────────────────
function isInsideFrontmatter(lines: string[], currentLine: number): boolean {
  let open = false;
  for (let i = 0; i < currentLine; i++) {
    if (lines[i].trim() === "---") open = !open;
  }
  return open;
}

function getCompletions(document: TextDocument, position: { line: number; character: number }): CompletionItem[] {
  if (!IS_OBSIDIAN_VAULT) return [];

  const lines = document.getText().split("\n");
  const linePrefix = (lines[position.line] ?? "").slice(0, position.character);
  const trimmed = linePrefix.trim();
  const completions: CompletionItem[] = [];

  // ── Wikilinks reales: [[nota ──────────────────────────────────────────────
  // Activa si la línea contiene [[ sin cerrar aún
  const wikilinkMatch = linePrefix.match(/\[\[([^\]]*)?$/);
  if (wikilinkMatch) {
    const partial = (wikilinkMatch[1] ?? "").toLowerCase();
    const noteItems = cachedNotes
      .filter(n => partial === "" || n.label.toLowerCase().includes(partial))
      .slice(0, 40)
      .map((n, i): CompletionItem => ({
        label: n.label,
        kind: CompletionItemKind.Reference,
        detail: n.relPath,
        insertText: n.label + "]]",
        insertTextFormat: InsertTextFormat.PlainText,
        sortText: `2${String(i).padStart(4, "0")}`,
      }));
    return noteItems; // solo wikilinks cuando estamos dentro de [[
  }

  // ── Embeds: ![[archivo ────────────────────────────────────────────────────
  const embedMatch = linePrefix.match(/!\[\[([^\]]*)?$/);
  if (embedMatch) {
    const partial = (embedMatch[1] ?? "").toLowerCase();
    return cachedNotes
      .filter(n => partial === "" || n.label.toLowerCase().includes(partial))
      .slice(0, 30)
      .map((n, i): CompletionItem => ({
        label: n.label,
        kind: CompletionItemKind.Reference,
        detail: `Embed: ${n.relPath}`,
        insertText: n.label + "]]",
        insertTextFormat: InsertTextFormat.PlainText,
        sortText: `3${String(i).padStart(4, "0")}`,
      }));
  }

  // ── Tags inline: #tag ─────────────────────────────────────────────────────
  const tagMatch = linePrefix.match(/#([a-zA-ZÀ-ÿ0-9/_-]*)$/);
  if (tagMatch) {
    const partial = tagMatch[1].toLowerCase();
    return cachedTags
      .filter(t => t.toLowerCase().startsWith(partial))
      .slice(0, 25)
      .map((tag, i): CompletionItem => ({
        label: `#${tag}`,
        kind: CompletionItemKind.EnumMember,
        detail: "Tag del vault",
        insertText: tag,
        insertTextFormat: InsertTextFormat.PlainText,
        sortText: `1${String(i).padStart(4, "0")}`,
      }));
  }

  // ── Frontmatter ───────────────────────────────────────────────────────────
  const inFM = isInsideFrontmatter(lines, position.line);
  if (inFM) {
    completions.push(...PROPERTY_SNIPPETS, FRONTMATTER_SNIPPET);
  }

  // ── Snippets de notas ─────────────────────────────────────────────────────
  if (trimmed.match(/^(tas|task|tarea)/i))  completions.push(TASK_NOTE_SNIPPET);
  if (trimmed.match(/^(reun)/i))             completions.push(MEETING_SNIPPET);
  if (trimmed.match(/^(libr|book|liter)/i)) completions.push(LITERATURE_SNIPPET);
  if (trimmed.match(/^(call|>\s*\[)/i))     completions.push(CALLOUT_SNIPPET);

  // Frontmatter al inicio del archivo
  if (position.line < 5 && trimmed === "") {
    completions.push(FRONTMATTER_SNIPPET);
  }

  return completions;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
connection.onInitialize((params: InitializeParams): InitializeResult => {
  const caps = params.capabilities;
  hasConfigCapability = !!(caps.workspace?.configuration);

  const initOpts = (params.initializationOptions as Record<string, unknown>) ?? {};
  const obsOpts  = (initOpts["obsidian"] as Record<string, unknown>) ?? {};
  vaultRoot = (obsOpts["vaultRoot"] as string) ?? "";

  if (IS_OBSIDIAN_VAULT && vaultRoot) {
    setImmediate(() => scanVaultFull(vaultRoot));
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: ["#", "[", "!", "-", "t", "r", "l"],
      },
      executeCommandProvider: {
        // Estos nombres aparecen en Ctrl+Shift+P de Zed
        commands: [
          "obsidian: Crear grafo del vault",
          "obsidian: Insertar plantilla YAML",
          "obsidian: Reescanear vault",
        ],
      },
    },
    serverInfo: { name: "obsidian-lsp", version: "0.2.0" },
  };
});

connection.onInitialized(() => {
  if (hasConfigCapability) {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
  }
  connection.console.log(`[obsidian-lsp] Iniciado. Vault: ${IS_OBSIDIAN_VAULT} — ${vaultRoot}`);
});

// ─── Completados ──────────────────────────────────────────────────────────────
connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri);
  if (!doc) return [];
  if (!/\.(md|markdown)$/i.test(params.textDocument.uri)) return [];
  return getCompletions(doc, params.position);
});

// ─── Comandos de paleta ───────────────────────────────────────────────────────
connection.onExecuteCommand(async (params: ExecuteCommandParams) => {
  switch (params.command) {

    // ── Crear grafo ──────────────────────────────────────────────────────────
    case "obsidian: Crear grafo del vault": {
      if (!vaultRoot) {
        connection.window.showErrorMessage("obsidian-lsp: vault root no detectado.");
        return;
      }
      try {
        const outPath = generateGraphFile(vaultRoot);
        exec(`xdg-open "${outPath}" 2>/dev/null || open "${outPath}" 2>/dev/null || start "" "${outPath}"`);
        connection.window.showInformationMessage(
          `✅ Grafo generado y abierto en el navegador`
        );
      } catch (err) {
        connection.window.showErrorMessage(`Error generando grafo: ${err instanceof Error ? err.message : String(err)}`);
      }
      break;
    }

    // ── Insertar plantilla YAML ──────────────────────────────────────────────
    case "obsidian: Insertar plantilla YAML": {
      // Obtenemos el URI del documento activo desde los argumentos del comando
      const uri = (params.arguments?.[0] as string) ?? "";
      if (!uri) {
        connection.window.showErrorMessage("obsidian-lsp: abre un archivo .md primero.");
        return;
      }
      const doc = documents.get(uri);
      const text = doc?.getText() ?? "";

      // No insertar si ya tiene frontmatter
      if (text.trimStart().startsWith("---")) {
        connection.window.showInformationMessage("Este archivo ya tiene frontmatter YAML.");
        return;
      }

      await connection.workspace.applyEdit({
        changes: {
          [uri]: [
            TextEdit.insert(Position.create(0, 0), YAML_TEMPLATE),
          ],
        },
      });
      break;
    }

    // ── Reescanear vault ─────────────────────────────────────────────────────
    case "obsidian: Reescanear vault": {
      if (!vaultRoot) return;
      scanVaultFull(vaultRoot);
      connection.window.showInformationMessage(
        `✅ Vault reescaneado: ${cachedNotes.length} notas, ${cachedTags.length} tags.`
      );
      break;
    }
  }
});

// ─── Config change ────────────────────────────────────────────────────────────
connection.onDidChangeConfiguration(() => {
  if (IS_OBSIDIAN_VAULT && vaultRoot) scanVaultFull(vaultRoot);
});

// ─── Arranque ─────────────────────────────────────────────────────────────────
documents.listen(connection);
connection.listen();
