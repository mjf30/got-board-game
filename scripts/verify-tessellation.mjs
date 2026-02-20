/**
 * Tessellation Verification Script v2
 * 
 * 3 types of checks:
 *  1. OVERLAP: edges used by 3+ areas -> causes visual overlap (MUST FIX)
 *  2. GAPS: interior edges used by 1 area -> causes visible space (MUST FIX)
 *  3. ADJACENCY: map.ts says adjacent but no shared edge/vertex (INFO ONLY for islands)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOARD_FILE = path.join(__dirname, '..', 'src', 'components', 'GameBoard.tsx');
const MAP_FILE = path.join(__dirname, '..', 'src', 'game', 'constants', 'map.ts');

const src = fs.readFileSync(BOARD_FILE, 'utf-8');
const mapSrc = fs.readFileSync(MAP_FILE, 'utf-8');

// Parse vertices
function parseVertices(source) {
    const V = {};
    const vBlock = source.match(/const V:\s*Record<string,\s*P>\s*=\s*\{([\s\S]*?)\};/);
    if (!vBlock) { console.error('Cannot find V block'); process.exit(1); }
    const re = /(\w+)\s*:\s*\[(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\]/g;
    let m;
    while ((m = re.exec(vBlock[1])) !== null) {
        V[m[1]] = [parseFloat(m[2]), parseFloat(m[3])];
    }
    return V;
}

// Parse areas
function parseAreas(source) {
    const areas = [];
    const re = /\{\s*id:\s*['"](.*?)['"],\s*verts:\s*\[(.*?)\],\s*type:\s*'(land|sea)'/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        const verts = m[2].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || [];
        areas.push({ id: m[1], verts, type: m[3] });
    }
    return areas;
}

// Parse islands
function parseIslands(source) {
    const islands = [];
    const re = /renderIsland\('([^']+)',\s*\[(.*?)\]/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        const verts = m[2].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || [];
        islands.push({ id: m[1], verts, type: 'island' });
    }
    return islands;
}

// Parse adjacency
function parseAdjacency(source) {
    const adj = {};
    const re = /'([^']+)':\s*\{[^}]*adjacent:\s*\[(.*?)\]/gs;
    let m;
    while ((m = re.exec(source)) !== null) {
        const id = m[1];
        const adjs = m[2].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '').replace(/\\'/g, "'")) || [];
        adj[id] = adjs;
    }
    return adj;
}

const V = parseVertices(src);
const AREAS = parseAreas(src);
const ISLANDS = parseIslands(src);
const ALL = [...AREAS, ...ISLANDS];
const ADJ = parseAdjacency(mapSrc);

const islandIds = new Set(ISLANDS.map(i => i.id));
const boardIds = new Set(ALL.map(a => a.id));
const portIds = new Set(Object.keys(ADJ).filter(id => id.includes('Port')));

console.log(`Parsed: ${Object.keys(V).length} vertices, ${AREAS.length} areas, ${ISLANDS.length} islands`);
console.log('');

// Edge key
function edgeKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

// Build edge map
const edgeUsers = {};
for (const area of ALL) {
    const n = area.verts.length;
    for (let i = 0; i < n; i++) {
        const a = area.verts[i];
        const b = area.verts[(i + 1) % n];
        const key = edgeKey(a, b);
        if (!edgeUsers[key]) edgeUsers[key] = [];
        edgeUsers[key].push(area.id);
    }
}

// Boundary check
function isOnBoundary(vk) {
    const p = V[vk];
    if (!p) return false;
    return p[0] <= 0 || p[0] >= 620 || p[1] <= 0 || p[1] >= 920;
}

// ═══════════════════════════════════════
// CHECK 1: OVERLAPS (3+ areas on same edge) - CRITICAL
// ═══════════════════════════════════════
console.log('=== CRITICAL: Overlapping Edges (3+ areas) ===');
let critCount = 0;
for (const [key, users] of Object.entries(edgeUsers)) {
    if (users.length > 2) {
        const [va, vb] = key.split('|');
        const pa = V[va], pb = V[vb];
        console.log(`  OVERLAP: ${key} [${pa}]->[${pb}] used by: ${users.join(', ')}`);
        critCount++;
    }
}
if (critCount === 0) console.log('  OK: No overlapping edges');
console.log('');

// ═══════════════════════════════════════
// CHECK 2: GAPS (interior edges used by only 1 area) - CRITICAL
// ═══════════════════════════════════════
console.log('=== CRITICAL: Gap Edges (interior, used by 1 area) ===');
let gapCount = 0;
for (const [key, users] of Object.entries(edgeUsers)) {
    if (users.length === 1) {
        const [va, vb] = key.split('|');
        const bothBoundary = isOnBoundary(va) && isOnBoundary(vb);
        const userIsIsland = islandIds.has(users[0]);
        if (!bothBoundary && !userIsIsland) {
            const pa = V[va], pb = V[vb];
            console.log(`  GAP: ${key} [${pa}]->[${pb}] only in "${users[0]}"`);
            gapCount++;
        }
    }
}
if (gapCount === 0) console.log('  OK: No gap edges');
console.log('');

// ═══════════════════════════════════════
// CHECK 3: ADJACENCY (map.ts) - INFO
// ═══════════════════════════════════════
console.log('=== INFO: Adjacency Verification ===');

// Build edge/vertex sets per area
const areaEdgeSets = {};
const areaVertSets = {};
for (const area of ALL) {
    const edges = new Set();
    const n = area.verts.length;
    for (let i = 0; i < n; i++) {
        edges.add(edgeKey(area.verts[i], area.verts[(i + 1) % n]));
    }
    areaEdgeSets[area.id] = edges;
    areaVertSets[area.id] = new Set(area.verts);
}

const checked = new Set();
let noEdge = 0, noContact = 0;
for (const [areaId, adjs] of Object.entries(ADJ)) {
    if (!boardIds.has(areaId) || portIds.has(areaId)) continue;
    for (const adjId of adjs) {
        if (!boardIds.has(adjId) || portIds.has(adjId)) continue;
        const pk = [areaId, adjId].sort().join('|');
        if (checked.has(pk)) continue;
        checked.add(pk);

        const eA = areaEdgeSets[areaId];
        const eB = areaEdgeSets[adjId];
        if (!eA || !eB) continue;

        let sharedEdges = 0;
        for (const e of eA) { if (eB.has(e)) sharedEdges++; }

        let sharedVerts = 0;
        const vA = areaVertSets[areaId];
        const vB = areaVertSets[adjId];
        if (vA && vB) { for (const v of vA) { if (vB.has(v)) sharedVerts++; } }

        // Skip island adjacencies (they float over seas)
        const eitherIsland = islandIds.has(areaId) || islandIds.has(adjId);

        if (sharedEdges === 0 && sharedVerts === 0 && !eitherIsland) {
            console.log(`  NO CONTACT: "${areaId}" <-> "${adjId}"`);
            noContact++;
        } else if (sharedEdges === 0 && sharedVerts > 0 && !eitherIsland) {
            console.log(`  POINT ONLY: "${areaId}" <-> "${adjId}" (${sharedVerts} shared vertex(es))`);
            noEdge++;
        }
    }
}
if (noContact === 0 && noEdge === 0) console.log('  OK: All adjacencies have shared edges');
console.log('');

// ═══════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════
console.log('=== SUMMARY ===');
console.log(`  CRITICAL overlaps: ${critCount}`);
console.log(`  CRITICAL gaps:     ${gapCount}`);
console.log(`  INFO no-contact:   ${noContact}`);
console.log(`  INFO point-only:   ${noEdge}`);
const total = critCount + gapCount;
if (total === 0) {
    console.log('  >>> ALL CRITICAL CHECKS PASSED <<<');
} else {
    console.log(`  >>> ${total} CRITICAL issues to fix <<<`);
}
console.log('');
