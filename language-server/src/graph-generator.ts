/**
 * graph-generator.ts
 * Escanea un vault de Obsidian y genera un vault-graph.html autocontenido
 * con un grafo de fuerza D3 interactivo.
 */

import * as fs from "fs";
import * as path from "path";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;        // nombre de la nota (sin .md)
  label: string;
  tags: string[];
  links: string[];   // wikilinks salientes
  path: string;      // ruta relativa dentro del vault
  wordCount: number;
  isOrphan: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "link" | "tag";
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  tags: string[];    // todos los tags únicos del vault
}

// ─── Parseo de archivos Markdown ──────────────────────────────────────────────

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const yaml = match[1];
  const result: Record<string, unknown> = {};

  // Parseo YAML mínimo para extraer tags y title
  for (const line of yaml.split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.+)/);
    if (kv) {
      result[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
    }
  }

  // Tags como lista YAML
  const tagsBlock = yaml.match(/^tags:\s*\n((?:\s+-\s+\S+\n?)+)/m);
  if (tagsBlock) {
    result["tags"] = tagsBlock[1]
      .split("\n")
      .map((l) => l.replace(/^\s+-\s+/, "").trim())
      .filter(Boolean);
  }

  return result;
}

function extractWikilinks(content: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const target = m[1].trim();
    if (target) links.push(target);
  }
  return [...new Set(links)];
}

function extractInlineTags(content: string): string[] {
  // Ignora tags dentro del bloque frontmatter
  const body = content.replace(/^---[\s\S]*?---/, "");
  const re = /#([a-zA-ZÀ-ÿ0-9/_-]+)/g;
  const tags: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    tags.push(m[1]);
  }
  return [...new Set(tags)];
}

function countWords(content: string): number {
  const body = content.replace(/^---[\s\S]*?---/, "").replace(/[#*`[\]]/g, "");
  return body.split(/\s+/).filter(Boolean).length;
}

// ─── Escáner del vault ────────────────────────────────────────────────────────

export function scanVault(vaultRoot: string): GraphData {
  const nodeMap = new Map<string, GraphNode>();

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const content = fs.readFileSync(full, "utf-8");
          const fm = parseFrontmatter(content);
          const relPath = path.relative(vaultRoot, full);
          const id = relPath.replace(/\.md$/, "").replace(/\\/g, "/");
          const label = (fm["title"] as string) || path.basename(entry.name, ".md");

          // Tags: frontmatter + inline
          let tags: string[] = [];
          if (Array.isArray(fm["tags"])) {
            tags = fm["tags"] as string[];
          } else if (typeof fm["tags"] === "string") {
            tags = [fm["tags"]];
          }
          tags = [...new Set([...tags, ...extractInlineTags(content)])];

          nodeMap.set(id, {
            id,
            label,
            tags,
            links: extractWikilinks(content),
            path: relPath,
            wordCount: countWords(content),
            isOrphan: false, // se calcula después
          });
        } catch { /* ignorar */ }
      }
    }
  }

  walk(vaultRoot);

  // Normaliza wikilinks: busca coincidencias parciales por nombre de archivo
  const allIds = new Set(nodeMap.keys());
  const byBasename = new Map<string, string>();
  for (const id of allIds) {
    const base = id.split("/").pop()!.toLowerCase();
    byBasename.set(base, id);
  }

  function resolveLink(from: string, link: string): string | null {
    const cleaned = link.replace(/\.md$/, "").replace(/\\/g, "/");
    // Coincidencia exacta
    if (allIds.has(cleaned)) return cleaned;
    // Solo por nombre de archivo
    const base = cleaned.split("/").pop()!.toLowerCase();
    return byBasename.get(base) ?? null;
  }

  // Construir edges
  const edges: GraphEdge[] = [];
  const linkedTargets = new Set<string>();
  const linkedSources = new Set<string>();

  for (const node of nodeMap.values()) {
    for (const rawLink of node.links) {
      const target = resolveLink(node.id, rawLink);
      if (target && target !== node.id) {
        edges.push({ source: node.id, target, type: "link" });
        linkedTargets.add(target);
        linkedSources.add(node.id);
      }
    }
  }

  // Marcar huérfanos
  for (const node of nodeMap.values()) {
    node.isOrphan = !linkedSources.has(node.id) && !linkedTargets.has(node.id);
  }

  // Todos los tags únicos
  const allTags = new Set<string>();
  for (const node of nodeMap.values()) {
    node.tags.forEach((t) => allTags.add(t));
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
    tags: Array.from(allTags).sort(),
  };
}

// ─── Generador HTML ───────────────────────────────────────────────────────────

export function generateGraphHTML(data: GraphData, vaultName: string): string {
  const graphJSON = JSON.stringify(data);

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${vaultName} — Obsidian Graph</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --surface2: #21262d;
    --border: #30363d;
    --text: #e6edf3;
    --text-muted: #7d8590;
    --accent: #7c3aed;
    --accent2: #a78bfa;
    --link-color: #58a6ff;
    --tag-colors: #f97316,#06b6d4,#10b981,#f59e0b,#ec4899,#8b5cf6,#14b8a6,#ef4444;
  }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    overflow: hidden;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ── Toolbar ── */
  #toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    z-index: 10;
    flex-shrink: 0;
  }

  #toolbar h1 {
    font-size: 14px;
    font-weight: 600;
    color: var(--accent2);
    white-space: nowrap;
  }

  #search {
    flex: 1;
    max-width: 280px;
    padding: 6px 12px;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 13px;
    outline: none;
    transition: border-color .2s;
  }
  #search:focus { border-color: var(--accent2); }
  #search::placeholder { color: var(--text-muted); }

  .tag-filter {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    flex: 1;
    scrollbar-width: thin;
  }

  .tag-pill {
    padding: 3px 10px;
    border-radius: 99px;
    border: 1px solid transparent;
    font-size: 11px;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity .15s, transform .1s;
    user-select: none;
  }
  .tag-pill:hover { transform: scale(1.05); }
  .tag-pill.inactive { opacity: .35; }

  .stat-badge {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    padding: 4px 10px;
    background: var(--surface2);
    border-radius: 6px;
    border: 1px solid var(--border);
  }

  /* ── Canvas ── */
  #canvas { flex: 1; position: relative; }
  svg { width: 100%; height: 100%; }

  .link {
    stroke: #ffffff14;
    stroke-width: 1;
    transition: stroke .2s;
  }
  .link.highlighted { stroke: #a78bfa88; stroke-width: 2; }

  .node circle {
    stroke-width: 1.5;
    cursor: pointer;
    transition: r .2s, filter .2s;
  }
  .node circle:hover { filter: brightness(1.4); }
  .node.dimmed circle { opacity: .15; }
  .node.dimmed text { opacity: .1; }
  .node.selected circle { stroke: var(--accent2) !important; stroke-width: 2.5; }

  .node text {
    fill: var(--text);
    font-size: 10px;
    pointer-events: none;
    text-anchor: middle;
    dominant-baseline: middle;
    paint-order: stroke;
    stroke: var(--bg);
    stroke-width: 3px;
    font-weight: 500;
  }

  /* ── Info panel ── */
  #info {
    position: absolute;
    right: 16px;
    top: 16px;
    width: 280px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 16px;
    font-size: 13px;
    display: none;
    z-index: 5;
    max-height: calc(100vh - 100px);
    overflow-y: auto;
  }
  #info.visible { display: block; }

  #info h2 { font-size: 15px; font-weight: 600; margin-bottom: 10px; color: var(--accent2); }
  #info .meta { color: var(--text-muted); margin-bottom: 4px; }
  #info .meta strong { color: var(--text); }

  #info .section-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: var(--text-muted);
    margin: 12px 0 6px;
  }

  #info .tag { display: inline-block; margin: 2px; padding: 2px 8px;
    border-radius: 99px; font-size: 11px; }

  #info .link-item {
    padding: 4px 0;
    color: var(--link-color);
    cursor: pointer;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  #info .link-item:hover { text-decoration: underline; }

  #info-close {
    position: absolute; top: 10px; right: 10px;
    background: none; border: none; color: var(--text-muted);
    cursor: pointer; font-size: 18px; line-height: 1;
  }
  #info-close:hover { color: var(--text); }

  /* ── Legend ── */
  #legend {
    position: absolute;
    left: 16px;
    bottom: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: 11px;
    color: var(--text-muted);
    z-index: 5;
  }
  #legend div { display: flex; align-items: center; gap: 6px; margin: 3px 0; }
  #legend span.dot {
    width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
  }

  /* ── Controls ── */
  #controls {
    position: absolute;
    left: 16px;
    top: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    z-index: 5;
  }
  .ctrl-btn {
    width: 32px; height: 32px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    font-size: 16px;
    display: flex; align-items: center; justify-content: center;
    transition: background .15s;
  }
  .ctrl-btn:hover { background: var(--surface2); }

  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
</style>
</head>
<body>

<div id="toolbar">
  <h1>⚡ ${vaultName}</h1>
  <input id="search" type="text" placeholder="Buscar nota…" autocomplete="off" />
  <div class="tag-filter" id="tagFilter"></div>
  <div class="stat-badge" id="stats"></div>
</div>

<div id="canvas">
  <svg id="svg"></svg>

  <div id="controls">
    <button class="ctrl-btn" id="zoomIn" title="Acercar">+</button>
    <button class="ctrl-btn" id="zoomOut" title="Alejar">−</button>
    <button class="ctrl-btn" id="zoomReset" title="Resetear vista">⊙</button>
    <button class="ctrl-btn" id="toggleOrphans" title="Mostrar/ocultar huérfanos">◌</button>
  </div>

  <div id="info">
    <button id="info-close">×</button>
    <h2 id="info-title"></h2>
    <div class="meta">📄 <strong id="info-path"></strong></div>
    <div class="meta">📝 <strong id="info-words"></strong> palabras</div>
    <div class="section-title">Tags</div>
    <div id="info-tags"></div>
    <div class="section-title">Enlaces salientes (<span id="info-out-count">0</span>)</div>
    <div id="info-out-links"></div>
    <div class="section-title">Backlinks (<span id="info-in-count">0</span>)</div>
    <div id="info-in-links"></div>
  </div>

  <div id="legend">
    <div><span class="dot" style="background:#a78bfa"></span> Nota normal</div>
    <div><span class="dot" style="background:#f97316"></span> Nota con tag</div>
    <div><span class="dot" style="background:#7d8590"></span> Nota huérfana</div>
    <div><span class="dot" style="background:#58a6ff; width:24px; height:2px; border-radius:0"></span> Wikilink</div>
  </div>
</div>

<script>
const RAW = ${graphJSON};

// ─── Paleta de colores para tags ────────────────────────────────────────────
const TAG_PALETTE = [
  '#f97316','#06b6d4','#10b981','#f59e0b',
  '#ec4899','#8b5cf6','#14b8a6','#ef4444',
  '#3b82f6','#84cc16','#e879f9','#fb923c'
];
const tagColorMap = {};
RAW.tags.forEach((t, i) => { tagColorMap[t] = TAG_PALETTE[i % TAG_PALETTE.length]; });

function nodeColor(n) {
  if (n.isOrphan) return '#4b5563';
  if (n.tags.length > 0) return tagColorMap[n.tags[0]] ?? '#a78bfa';
  return '#a78bfa';
}

function nodeRadius(n) {
  const base = 5;
  const maxR = 20;
  const degree = linkIndex[n.id]?.total ?? 0;
  return Math.min(base + Math.sqrt(degree) * 2.5, maxR);
}

// ─── Índice de links ─────────────────────────────────────────────────────────
const linkIndex = {};
for (const n of RAW.nodes) linkIndex[n.id] = { out: [], in: [], total: 0 };
for (const e of RAW.edges) {
  if (linkIndex[e.source]) { linkIndex[e.source].out.push(e.target); linkIndex[e.source].total++; }
  if (linkIndex[e.target]) { linkIndex[e.target].in.push(e.source);  linkIndex[e.target].total++; }
}

// ─── Estado ──────────────────────────────────────────────────────────────────
let activeTags = new Set();
let showOrphans = true;
let selectedNode = null;
let searchQuery = '';

function visibleNodes() {
  return RAW.nodes.filter(n => {
    if (!showOrphans && n.isOrphan) return false;
    if (activeTags.size > 0 && !n.tags.some(t => activeTags.has(t))) return false;
    if (searchQuery && !n.label.toLowerCase().includes(searchQuery)) return false;
    return true;
  });
}

function visibleEdges(nodeSet) {
  const ids = new Set(nodeSet.map(n => n.id));
  return RAW.edges.filter(e => ids.has(e.source) && ids.has(e.target));
}

// ─── SVG setup ───────────────────────────────────────────────────────────────
const svg = d3.select('#svg');
const W = () => document.getElementById('canvas').clientWidth;
const H = () => document.getElementById('canvas').clientHeight;

const g = svg.append('g');

const zoom = d3.zoom()
  .scaleExtent([0.1, 8])
  .on('zoom', e => g.attr('transform', e.transform));
svg.call(zoom);

// ─── Simulación ──────────────────────────────────────────────────────────────
let simulation;
let linkSel, nodeSel;

function buildGraph() {
  const nodes = visibleNodes().map(n => ({ ...n }));
  const edges = visibleEdges(nodes).map(e => ({ ...e }));

  // Para que d3 mute los objetos de simulación en lugar de los originales
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const simLinks = edges
    .map(e => ({ source: nodeById.get(e.source), target: nodeById.get(e.target), type: e.type }))
    .filter(e => e.source && e.target);

  g.selectAll('*').remove();

  // Links
  const linkG = g.append('g').attr('class', 'links');
  linkSel = linkG.selectAll('line')
    .data(simLinks)
    .join('line')
    .attr('class', 'link');

  // Nodes
  const nodeG = g.append('g').attr('class', 'nodes');
  nodeSel = nodeG.selectAll('g.node')
    .data(nodes, d => d.id)
    .join('g')
    .attr('class', 'node')
    .call(d3.drag()
      .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (e, d) => { d.fx = e.x; d.fy = e.y; })
      .on('end',   (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
    )
    .on('click', (e, d) => { e.stopPropagation(); selectNode(d); });

  nodeSel.append('circle')
    .attr('r', d => nodeRadius(d))
    .attr('fill', d => nodeColor(d))
    .attr('stroke', d => d3.color(nodeColor(d)).darker(0.8));

  nodeSel.append('text')
    .attr('dy', d => nodeRadius(d) + 11)
    .text(d => d.label.length > 20 ? d.label.slice(0, 18) + '…' : d.label);

  if (simulation) simulation.stop();

  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(simLinks).id(d => d.id).distance(80).strength(0.4))
    .force('charge', d3.forceManyBody().strength(-180))
    .force('center', d3.forceCenter(W() / 2, H() / 2))
    .force('collision', d3.forceCollide(d => nodeRadius(d) + 8))
    .on('tick', () => {
      linkSel
        .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
      nodeSel.attr('transform', d => \`translate(\${d.x},\${d.y})\`);
    });

  updateStats(nodes, simLinks);
}

// ─── Estadísticas ────────────────────────────────────────────────────────────
function updateStats(nodes, edges) {
  document.getElementById('stats').textContent =
    \`\${nodes.length} notas · \${edges.length} enlaces\`;
}

// ─── Selección de nodo ───────────────────────────────────────────────────────
function selectNode(d) {
  selectedNode = d;
  const panel = document.getElementById('info');

  document.getElementById('info-title').textContent = d.label;
  document.getElementById('info-path').textContent = d.path;
  document.getElementById('info-words').textContent = d.wordCount.toLocaleString();

  // Tags
  const tagsEl = document.getElementById('info-tags');
  tagsEl.innerHTML = d.tags.length
    ? d.tags.map(t => \`<span class="tag" style="background:\${tagColorMap[t]}22;color:\${tagColorMap[t]};border:1px solid \${tagColorMap[t]}44">#\${t}</span>\`).join('')
    : '<span style="color:var(--text-muted)">Sin tags</span>';

  // Out links
  const outLinks = linkIndex[d.id]?.out ?? [];
  document.getElementById('info-out-count').textContent = outLinks.length;
  document.getElementById('info-out-links').innerHTML = outLinks.length
    ? outLinks.map(id => \`<div class="link-item" onclick="focusNode('\${id}')">\${id.split('/').pop()}</div>\`).join('')
    : '<span style="color:var(--text-muted)">Ninguno</span>';

  // Backlinks
  const inLinks = linkIndex[d.id]?.in ?? [];
  document.getElementById('info-in-count').textContent = inLinks.length;
  document.getElementById('info-in-links').innerHTML = inLinks.length
    ? inLinks.map(id => \`<div class="link-item" onclick="focusNode('\${id}')">\${id.split('/').pop()}</div>\`).join('')
    : '<span style="color:var(--text-muted)">Ninguno</span>';

  panel.classList.add('visible');

  // Resaltar nodo y sus conexiones
  highlightNode(d);
}

function highlightNode(d) {
  if (!nodeSel) return;
  const connected = new Set([d.id, ...(linkIndex[d.id]?.out ?? []), ...(linkIndex[d.id]?.in ?? [])]);
  nodeSel.classed('dimmed', n => !connected.has(n.id));
  nodeSel.classed('selected', n => n.id === d.id);
  linkSel.classed('highlighted', l => l.source.id === d.id || l.target.id === d.id);
}

function clearSelection() {
  selectedNode = null;
  nodeSel?.classed('dimmed', false).classed('selected', false);
  linkSel?.classed('highlighted', false);
  document.getElementById('info').classList.remove('visible');
}

window.focusNode = function(id) {
  const node = RAW.nodes.find(n => n.id === id);
  if (node) selectNode(node);
};

svg.on('click', clearSelection);

// ─── Tag pills ───────────────────────────────────────────────────────────────
function buildTagPills() {
  const container = document.getElementById('tagFilter');
  for (const tag of RAW.tags.slice(0, 16)) {
    const pill = document.createElement('button');
    pill.className = 'tag-pill';
    pill.textContent = '#' + tag;
    pill.style.background = tagColorMap[tag] + '22';
    pill.style.color = tagColorMap[tag];
    pill.style.borderColor = tagColorMap[tag] + '55';
    pill.addEventListener('click', () => {
      if (activeTags.has(tag)) { activeTags.delete(tag); pill.classList.remove('inactive'); }
      else { activeTags.add(tag); pill.classList.add('inactive'); }
      // Invertir lógica: pills activos = filtro activo
      const anyActive = activeTags.size > 0;
      document.querySelectorAll('.tag-pill').forEach(p => {
        const t = p.textContent.slice(1);
        p.classList.toggle('inactive', anyActive && !activeTags.has(t));
      });
      buildGraph();
    });
    container.appendChild(pill);
  }
}

// ─── Controles ───────────────────────────────────────────────────────────────
document.getElementById('zoomIn').addEventListener('click', () =>
  svg.transition().call(zoom.scaleBy, 1.4));
document.getElementById('zoomOut').addEventListener('click', () =>
  svg.transition().call(zoom.scaleBy, 0.7));
document.getElementById('zoomReset').addEventListener('click', () =>
  svg.transition().call(zoom.transform, d3.zoomIdentity.translate(W()/2, H()/2)));
document.getElementById('toggleOrphans').addEventListener('click', function() {
  showOrphans = !showOrphans;
  this.style.opacity = showOrphans ? '1' : '0.4';
  buildGraph();
});
document.getElementById('info-close').addEventListener('click', clearSelection);

document.getElementById('search').addEventListener('input', function() {
  searchQuery = this.value.toLowerCase().trim();
  buildGraph();
});

// ─── Resize ──────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  if (simulation) simulation.force('center', d3.forceCenter(W()/2, H()/2)).alpha(0.1).restart();
});

// ─── Init ────────────────────────────────────────────────────────────────────
buildTagPills();
buildGraph();
</script>
</body>
</html>`;
}

// ─── Entry point (CLI) ────────────────────────────────────────────────────────

export function generateGraphFile(vaultRoot: string): string {
  const data = scanVault(vaultRoot);
  const vaultName = path.basename(vaultRoot);
  const html = generateGraphHTML(data, vaultName);
  const outPath = path.join(vaultRoot, "vault-graph.html");
  fs.writeFileSync(outPath, html, "utf-8");
  return outPath;
}
