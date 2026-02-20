/**
 * Sea Polygon Generator
 *
 * Takes the land polygon definitions and computes the correct sea polygons
 * as the complement (leftover space within the viewbox).
 *
 * Algorithm:
 * 1. Build a planar graph of all edges (land polygon edges + viewbox boundary)
 * 2. Find all face cycles in the planar graph
 * 3. The faces that are NOT land polygons are the sea areas
 * 4. Match each face to its sea area ID using centroid position
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOARD_FILE = path.join(__dirname, '..', 'src', 'components', 'GameBoard.tsx');

const src = fs.readFileSync(BOARD_FILE, 'utf-8');

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

// Parse ONLY LAND areas
function parseLandAreas(source) {
    const areas = [];
    const re = /\{\s*id:\s*['"](.*?)['"],\s*verts:\s*\[(.*?)\],\s*type:\s*'(land|sea)'/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        if (m[3] !== 'land') continue;
        const verts = m[2].match(/'([^']+)'/g)?.map(s => s.replace(/'/g, '')) || [];
        areas.push({ id: m[1], verts });
    }
    return areas;
}

const V = parseVertices(src);
const LAND = parseLandAreas(src);

console.log(`Land areas: ${LAND.length}`);

// Step 1: Build edge map for land areas
// Track which edges belong to which land area
function edgeKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

const edgeUsers = {};
for (const area of LAND) {
    const n = area.verts.length;
    for (let i = 0; i < n; i++) {
        const a = area.verts[i];
        const b = area.verts[(i + 1) % n];
        const key = edgeKey(a, b);
        if (!edgeUsers[key]) edgeUsers[key] = [];
        edgeUsers[key].push(area.id);
    }
}

// Step 2: Find edges shared by 1 land area only = coastline edges
// These + viewbox boundary form the sea polygon boundaries
console.log('\n=== LAND OVERLAP CHECK ===');
let landOverlaps = 0;
for (const [key, users] of Object.entries(edgeUsers)) {
    if (users.length > 2) {
        console.log(`  LAND OVERLAP: ${key} used by ${users.join(', ')}`);
        landOverlaps++;
    }
}
if (landOverlaps === 0) console.log('  OK: No land overlaps');

console.log('\n=== COASTLINE EDGES (land edges not shared by 2 land areas) ===');
const coastEdges = [];
for (const [key, users] of Object.entries(edgeUsers)) {
    if (users.length === 1) {
        const [va, vb] = key.split('|');
        // Check if both vertices are on viewbox boundary
        const pa = V[va], pb = V[vb];
        const onBoundary = (v) => v[0] <= 0 || v[0] >= 620 || v[1] <= 0 || v[1] >= 920;
        const bothBoundary = pa && pb && onBoundary(pa) && onBoundary(pb);
        if (!bothBoundary) {
            coastEdges.push({ key, va, vb, area: users[0] });
        }
    }
}
console.log(`  Found ${coastEdges.length} coastline edges`);

// Step 3: List all land vertices that touch the viewbox boundary
const boundaryVerts = [];
for (const [name, [x, y]] of Object.entries(V)) {
    if (x <= 0 || x >= 620 || y <= 0 || y >= 920) {
        if (name !== 'TL' && name !== 'TR' && name !== 'BL' && name !== 'BR') {
            boundaryVerts.push({ name, x, y });
        }
    }
}
console.log('\n=== BOUNDARY VERTICES ===');
for (const v of boundaryVerts) {
    console.log(`  ${v.name}: [${v.x}, ${v.y}]`);
}

// Step 4: For each land area, list its coastline (unshared) edges
console.log('\n=== COAST EDGES PER LAND AREA ===');
for (const area of LAND) {
    const coast = [];
    const n = area.verts.length;
    for (let i = 0; i < n; i++) {
        const a = area.verts[i];
        const b = area.verts[(i + 1) % n];
        const key = edgeKey(a, b);
        if (edgeUsers[key].length === 1) {
            coast.push(`${a}->${b}`);
        }
    }
    if (coast.length > 0) {
        console.log(`  ${area.id}: ${coast.join(', ')}`);
    }
}

// Step 5: Now check land gaps (edges used by only 1 area that aren't on the coastline)
console.log('\n=== LAND GAPS (interior land edges used by only 1 area) ===');
let landGaps = 0;
for (const [key, users] of Object.entries(edgeUsers)) {
    if (users.length === 1) {
        const [va, vb] = key.split('|');
        const pa = V[va], pb = V[vb];
        if (!pa || !pb) continue;
        // Is this edge on the land boundary (coast)?
        // It's a gap if both vertices are shared by other land areas but this particular edge isn't
        const vaLands = new Set();
        const vbLands = new Set();
        for (const area of LAND) {
            if (area.verts.includes(va)) vaLands.add(area.id);
            if (area.verts.includes(vb)) vbLands.add(area.id);
        }
        // If both vertices belong to more than 1 land area, but the edge itself only belongs to 1
        // that's a gap between two land areas
        if (vaLands.size > 1 && vbLands.size > 1) {
            console.log(`  LAND GAP: ${va}->${vb} [${pa}]->[${pb}] in "${users[0]}"`);
            console.log(`    ${va} in: ${[...vaLands].join(', ')}`);
            console.log(`    ${vb} in: ${[...vbLands].join(', ')}`);
            landGaps++;
        }
    }
}
if (landGaps === 0) console.log('  OK: No land gaps');
console.log(`\nTotal land overlaps: ${landOverlaps}, Total land gaps: ${landGaps}`);
