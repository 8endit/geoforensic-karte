# GeoForensic Karte

Interactive satellite data dashboard showing ground motion (subsidence/uplift) across Germany.
**Live:** https://8endit.github.io/geoforensic-karte/

## Stack

- Pure HTML/CSS/JS (single `index.html`, no build step)
- Leaflet.js for map + leaflet.heat for heatmap layer
- Chart.js for histogram
- Hosted on GitHub Pages (auto-deploy on push to master)
- Data: `geoforensic_map_data.json` (4.2 MB, 170k points, packed format v2)

## Data Format

```
{ v: 2, nm: ["Bayern", ...], p: [[lat, lon, velocity_mm_yr, region_idx], ...], R: [region_stats...] }
```

- `nm`: array of 16 Bundesland names (index = region_idx in points)
- `p`: point array, velocity negative = subsidence, positive = uplift
- `R`: pre-computed region stats (name, n, mean, worst, bb[bounding box])
- `inf`: infrastructure array (currently empty, reserved for future use)

## Region Assignment

Points are assigned to Bundesländer using point-in-polygon with official BKG boundary polygons (`bundeslaender.geo.json`). Run `node fix_regions.js` to reassign all points. This was fixed on 2026-04-11 — previously 45% of points had wrong state labels due to bounding-box assignment.

## Color System

`vc(v)` function maps absolute velocity to colors:
- < 5 mm/a: `#22d3ee` (cyan)
- < 8 mm/a: `#eab308` (yellow)
- < 12 mm/a: `#f97316` (orange)
- < 16 mm/a: `#ef4444` (red)
- >= 16 mm/a: `#dc2626` (dark red)

Legend gradient, histogram bars, and marker colors must all match these breakpoints.

## UI Architecture

- **Topbar**: Logo, title, KPI chips (points, max, regions, median)
- **Left panel** (desktop): Search (Nominatim), velocity filter slider, region list with checkboxes
- **Bottom panel** (desktop): Ranking cards + histogram
- **Mobile (<768px)**: Left panel becomes bottom drawer (50vh) with pull-handle, bottom panel hidden

## Key Functions

- `vc(v)` — velocity to color
- `vr(v)` — velocity to marker radius
- `filt()` — filter points by active regions + velocity range
- `drawPts()` — render circle markers (severity-sorted, max 8000)
- `drawHeat()` — render heatmap layer (uniform subsample for density)
- `updKPI()` — update KPI chips + filter summary + story hint
- `drawHist()` — histogram with dynamic first bin label based on vMin
- `apply()` — debounced full redraw (filt → drawPts → drawHeat → updKPI → drawHist)

## Data Source

Current data origin unclear. Future: should pull from EGMS (European Ground Motion Service, Copernicus) Ortho L3 product — 100m grid, vertical + east-west components, free. See https://egms.land.copernicus.eu/

## Search

Uses Nominatim (OpenStreetMap) geocoding with `cos(lat)` correction for longitude distance calculation to find nearest data point.

## Caching

`MAP_DATA_URL` has a version query param (`?v=20260411b`) to bust CDN cache after data updates. Update this when changing the JSON.

## Bugs Fixed (2026-04-11, 4 rounds)

Total 30+ fixes including: histogram color mismatch, duplicate KPI values, search distance at 51°N, subsampling bias, region misassignment (45% of points), legend gradient, mobile layout, dead UI elements. See git log for details.
