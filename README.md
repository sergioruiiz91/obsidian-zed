# obsidian-vault · Extensión para Zed

> Detecta vaults de Obsidian y ofrece snippets inteligentes, propiedades YAML y autocompletado de tags directamente en el editor Zed.

---

## ✨ Características

| Función | Descripción |
|---|---|
| 🔍 **Detección automática** | Detecta la carpeta `.obsidian` en la raíz del proyecto |
| 📄 **Frontmatter YAML** | Snippets de propiedades al inicio del archivo |
| ✅ **Nota de tarea** | Escribe `tas` → expande propiedades de tarea completa |
| 📅 **Nota de reunión** | Escribe `reunion` → plantilla lista |
| 📚 **Nota de libro** | Escribe `libro` → ficha de literatura |
| 🏷️ **Tags inteligentes** | Escribe `#` → sugiere tags del vault en tiempo real |
| 🔗 **Wikilinks** | Escribe `[[` → autocompletado de enlaces internos |
| 📢 **Callouts** | Escribe `callout` → snippets de callouts de Obsidian |

---

## 🗂️ Estructura del proyecto

```
obsidian-vault/
├── extension.toml              ← Manifiesto de la extensión (Zed)
├── Cargo.toml                  ← Dependencias Rust
├── build.sh                    ← Script de compilación e instalación
├── src/
│   └── lib.rs                  ← Extensión Rust/WASM (detecta vault, arranca LSP)
├── language-server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts            ← Language Server (Node.js/TypeScript)
└── languages/
    └── markdown/
        └── config.toml         ← Configuración del lenguaje Markdown
```

---

## ⚙️ Requisitos previos

| Herramienta | Versión mínima | Instalación |
|---|---|---|
| **Node.js** | 18+ | https://nodejs.org |
| **Rust** | stable | https://rustup.rs |
| **Zed** | 0.140+ | https://zed.dev |

---

## 🚀 Instalación

### Opción A — Build automático (recomendado)

```bash
# 1. Clona o descarga este repositorio
git clone https://github.com/tuusuario/obsidian-zed.git
cd obsidian-zed

# 2. Ejecuta el script de construcción e instalación
./build.sh
```

El script:
1. Instala dependencias npm y compila el Language Server TypeScript → JS
2. Compila la extensión Rust → WASM
3. Copia todo al directorio `~/.config/zed/extensions/obsidian-vault/`

### Opción B — Pasos manuales

```bash
# Compilar Language Server
cd language-server
npm install
npm run build
cd ..

# Compilar extensión Rust
rustup target add wasm32-wasi
cargo build --target wasm32-wasi --release

# Instalar
ZED_EXT="$HOME/.config/zed/extensions/obsidian-vault"
mkdir -p "$ZED_EXT/language-server/dist" "$ZED_EXT/languages/markdown"
cp extension.toml "$ZED_EXT/"
cp languages/markdown/config.toml "$ZED_EXT/languages/markdown/"
cp language-server/dist/index.js "$ZED_EXT/language-server/dist/"
cp target/wasm32-wasi/release/obsidian_vault.wasm "$ZED_EXT/extension.wasm"
```

### Opción C — Activar en Zed desde la UI

1. Abre Zed → `Cmd+Shift+P` → **"Extensions: Install Dev Extension"**
2. Selecciona la carpeta `obsidian-vault/`
3. Zed compilará y registrará la extensión automáticamente.

---

## 🔄 Activar / Desactivar

1. `Cmd+Shift+P` → **"Extensions"**
2. Busca **"Obsidian Vault"**
3. Usa el toggle para activar/desactivar

La extensión solo activa el Language Server cuando el proyecto tiene la carpeta `.obsidian/` en su raíz. En otros proyectos no hay ningún impacto de rendimiento.

---

## 💡 Ejemplo de uso — Snippet `tas`

Abre o crea un archivo `.md` dentro de tu vault, escribe `tas` y presiona `Tab` o `Enter` en el autocompletado:

**Antes:**
```
tas|
```

**Después (snippet expandido):**
```markdown
---
title: Nombre de la tarea
date: 2024-11-15
due: 2024-11-15
priority: alta
status: pendiente
tags:
  - tarea
  - proyecto
project: "[[Nombre del Proyecto]]"
assignee: @yo
---

## 📋 Descripción

Descripción de la tarea...

## ✅ Subtareas

- [ ] Subtarea 1
- [ ] Subtarea 2

## 🔗 Referencias

- |
```
> Los campos con `${}` son tabulstops — navega entre ellos con `Tab`.

---

## 🏷️ Autocompletado de tags

Escribe `#` en cualquier parte del documento:

```
Esta nota está relacionada con #pro|
                                    ↑ aparece el menú:
                                    #proyecto
                                    #programación
                                    #productividad
```

Los tags se escanean automáticamente de todos los `.md` del vault.

---

## 🔧 Otros snippets disponibles

### `frontmatter` — YAML completo
```markdown
---
title: Título de la nota
date: 2024-11-15
tags:
  - tag1
  - tag2
aliases:
  - alias
status: borrador
---
```

### `reunion` — Nota de reunión
```markdown
---
title: Reunión — Tema
date: 2024-11-15
attendees:
  - Persona 1
tags:
  - reunión
---

## 📌 Agenda
## 🗒️ Notas
## ✅ Acciones
```

### `libro` — Ficha de literatura
```markdown
---
title: "Título"
author: "Autor"
year: 2024
rating: ⭐⭐⭐⭐
status: leyendo
tags:
  - libro
---
```

### `callout` — Callout de Obsidian
```markdown
> [!warning] Atención
> Contenido del callout
```

---

## 🤝 Contribuir

1. Fork del repositorio
2. Crea tu rama: `git checkout -b feature/nueva-funcion`
3. Haz tus cambios y añade tests si aplica
4. PR con descripción clara

---
