#!/usr/bin/env node
/**
 * generate-graph.js  —  CLI independiente para generar vault-graph.html
 *
 * Uso:
 *   node language-server/dist/generate-graph.js /ruta/a/tu/vault
 *   node language-server/dist/generate-graph.js  (usa el directorio actual)
 */

const { generateGraphFile } = require("./graph-generator");
const path = require("path");

const vaultRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : process.cwd();

console.log(`\n🔍 Escaneando vault: ${vaultRoot}`);

try {
  const outPath = generateGraphFile(vaultRoot);
  console.log(`✅ Grafo generado: ${outPath}`);
  console.log(`   Ábrelo en tu navegador con:\n   xdg-open "${outPath}"\n`);
} catch (err) {
  console.error("❌ Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
