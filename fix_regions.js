/**
 * Reassign all points in geoforensic_map_data.json to correct Bundesland
 * using point-in-polygon with official boundary GeoJSON.
 */
const fs = require('fs');

const d = JSON.parse(fs.readFileSync('geoforensic_map_data.json', 'utf8'));
const g = JSON.parse(fs.readFileSync('bundeslaender.geo.json', 'utf8'));

// ---- Name mapping: GeoJSON name → data nm name ----
const geoToData = {
  'Baden-Württemberg': 'Baden-Wuerttemberg',
  'Bayern': 'Bayern',
  'Berlin': 'Berlin',
  'Brandenburg': 'Brandenburg',
  'Bremen': 'Bremen',
  'Hamburg': 'Hamburg',
  'Hessen': 'Hessen',
  'Mecklenburg-Vorpommern': 'Mecklenburg-Vorpommern',
  'Niedersachsen': 'Niedersachsen',
  'Nordrhein-Westfalen': 'NRW',
  'Rheinland-Pfalz': 'Rheinland-Pfalz',
  'Saarland': 'Saarland',
  'Sachsen': 'Sachsen',
  'Sachsen-Anhalt': 'Sachsen-Anhalt',
  'Schleswig-Holstein': 'Schleswig-Holstein',
  'Thüringen': 'Thueringen',
};

// ---- Point-in-polygon (ray casting) ----
function pointInRing(lat, lon, ring) {
  // ring is [[lon,lat], [lon,lat], ...]
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointInPolygon(lat, lon, geometry) {
  if (geometry.type === 'Polygon') {
    // First ring is exterior, rest are holes
    const coords = geometry.coordinates;
    if (!pointInRing(lat, lon, coords[0])) return false;
    for (let h = 1; h < coords.length; h++) {
      if (pointInRing(lat, lon, coords[h])) return false; // inside a hole
    }
    return true;
  }
  if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates) {
      if (!pointInRing(lat, lon, poly[0])) continue;
      let inHole = false;
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(lat, lon, poly[h])) { inHole = true; break; }
      }
      if (!inHole) return true;
    }
    return false;
  }
  return false;
}

// ---- Build lookup: for each feature, compute bounding box for fast pre-filter ----
const states = g.features.map(f => {
  const dataName = geoToData[f.properties.name];
  if (!dataName) throw new Error('No mapping for: ' + f.properties.name);

  // Compute bbox
  let minLat = 999, maxLat = -999, minLon = 999, maxLon = -999;
  function scanCoords(coords) {
    if (typeof coords[0] === 'number') {
      if (coords[1] < minLat) minLat = coords[1];
      if (coords[1] > maxLat) maxLat = coords[1];
      if (coords[0] < minLon) minLon = coords[0];
      if (coords[0] > maxLon) maxLon = coords[0];
      return;
    }
    for (const c of coords) scanCoords(c);
  }
  scanCoords(f.geometry.coordinates);

  return {
    name: f.properties.name,
    dataName,
    dataIdx: d.nm.indexOf(dataName),
    geometry: f.geometry,
    bbox: { minLat, maxLat, minLon, maxLon }
  };
});

// Verify all data names are mapped
for (const s of states) {
  if (s.dataIdx === -1) throw new Error('Data name not found in nm: ' + s.dataName);
}

// ---- Reassign all points ----
console.log('Processing', d.p.length, 'points...');
let changed = 0, unmatched = 0;
const changeCounts = {}; // "from → to" counts

for (let i = 0; i < d.p.length; i++) {
  const pt = d.p[i];
  const lat = pt[0], lon = pt[1];
  const oldIdx = pt[3];

  // Find correct state
  let newIdx = -1;
  for (const s of states) {
    // Fast bbox check
    if (lat < s.bbox.minLat || lat > s.bbox.maxLat ||
        lon < s.bbox.minLon || lon > s.bbox.maxLon) continue;
    if (pointInPolygon(lat, lon, s.geometry)) {
      newIdx = s.dataIdx;
      break;
    }
  }

  if (newIdx === -1) {
    // Point outside Germany — find nearest state
    unmatched++;
    // Keep original assignment for now
    continue;
  }

  if (newIdx !== oldIdx) {
    const key = d.nm[oldIdx] + ' → ' + d.nm[newIdx];
    changeCounts[key] = (changeCounts[key] || 0) + 1;
    pt[3] = newIdx;
    changed++;
  }
}

console.log('\nChanged:', changed, '/', d.p.length, 'points');
console.log('Unmatched (outside polygons):', unmatched);
console.log('\nTransfers:');
Object.entries(changeCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log('  ' + k + ': ' + v));

// ---- Recalculate region stats (R array) ----
const regStats = {};
for (const name of d.nm) regStats[name] = { pts: [], minLat: 999, maxLat: -999, minLon: 999, maxLon: -999 };

for (const pt of d.p) {
  const name = d.nm[pt[3]];
  const s = regStats[name];
  s.pts.push(pt[2]); // velocity
  if (pt[0] < s.minLat) s.minLat = pt[0];
  if (pt[0] > s.maxLat) s.maxLat = pt[0];
  if (pt[1] < s.minLon) s.minLon = pt[1];
  if (pt[1] > s.maxLon) s.maxLon = pt[1];
}

d.R = d.nm.map(name => {
  const s = regStats[name];
  if (!s.pts.length) return { name, n: 0, mean: 0, worst: 0, bb: [0,0,0,0] };
  const mean = s.pts.reduce((a, b) => a + b, 0) / s.pts.length;
  const worst = s.pts.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0);
  return {
    name,
    n: s.pts.length,
    mean: Math.round(mean * 10) / 10,
    worst: Math.round(worst * 10) / 10,
    bb: [s.minLat, s.minLon, s.maxLat, s.maxLon]
  };
});

console.log('\nUpdated region stats:');
d.R.sort((a, b) => a.mean - b.mean);
d.R.forEach(r => console.log('  ' + r.name + ': n=' + r.n + ' mean=' + r.mean + ' worst=' + r.worst));

// ---- Write output ----
fs.writeFileSync('geoforensic_map_data.json', JSON.stringify(d));
console.log('\nSaved updated geoforensic_map_data.json');
