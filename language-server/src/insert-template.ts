#!/usr/bin/env node
/**
 * insert-template.js
 * Inserta frontmatter YAML al principio de un archivo .md si no lo tiene ya.
 * Uso: node insert-template.js /ruta/al/archivo.md
 */
import * as fs from "fs";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Uso: insert-template.js <archivo.md>");
  process.exit(1);
}

const TEMPLATE = `---
title: 
date: ${new Date().toISOString().slice(0, 10)}
tags:
  - 
aliases:
  - 
status: borrador
---

`;

try {
  const content = fs.readFileSync(filePath, "utf-8");
  if (content.trimStart().startsWith("---")) {
    console.log("ℹ️  El archivo ya tiene frontmatter YAML.");
    process.exit(0);
  }
  fs.writeFileSync(filePath, TEMPLATE + content, "utf-8");
  console.log(`✅ Plantilla YAML insertada en: ${filePath}`);
} catch (err) {
  console.error("❌ Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
