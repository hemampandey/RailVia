"use client";

import { useMemo } from "react";
import type { Block, Network } from "@/lib/types";
import { DEPT_VAR } from "@/lib/types";

/** The corridors as they run on the ground.
 *
 * Station positions are the real latitudes and longitudes carried in the
 * timetable data, projected equirectangularly — over a single division the
 * distortion is invisible and it keeps the drawing honest: this is where the
 * track actually goes, not a schematic.
 */
const W = 900;
const H = 620;
const PAD = 46;

export function NetworkMap({
  network, blocks, selected, onSelect,
}: {
  network: Network;
  blocks: Block[];
  selected: string | null;
  onSelect: (sectionId: string | null) => void;
}) {
  const { project, closed } = useMemo(() => {
    const pts = Object.values(network.stations)
      .filter((s) => s.lat != null && s.lng != null) as { lat: number; lng: number }[];
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    // Latitude degrees are longer than longitude degrees at this latitude;
    // one scale for both keeps the shape true rather than stretched to fit.
    const scale = Math.min(
      (W - PAD * 2) / Math.max(maxLng - minLng, 1e-6),
      (H - PAD * 2) / Math.max(maxLat - minLat, 1e-6),
    );
    const spanX = (maxLng - minLng) * scale;
    const spanY = (maxLat - minLat) * scale;
    return {
      project: (lat: number, lng: number) => ({
        x: PAD + (W - PAD * 2 - spanX) / 2 + (lng - minLng) * scale,
        y: PAD + (H - PAD * 2 - spanY) / 2 + (maxLat - lat) * scale,
      }),
      closed: new Set(blocks.map((b) => b.section_id)),
    };
  }, [network, blocks]);

  const at = (code: string) => {
    const s = network.stations[code];
    if (!s || s.lat == null || s.lng == null) return null;
    return project(s.lat, s.lng);
  };

  const busiest = Math.max(...network.sections.map((s) => s.daily_trains), 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="map" role="img"
      aria-label={`Map of ${Object.keys(network.stations).length} stations across ${network.sections.length} sections. ${closed.size} sections have a closure scheduled.`}>
      {/* sections */}
      {network.sections.map((s) => {
        const p = at(s.a), q = at(s.b);
        if (!p || !q) return null;
        const isClosed = closed.has(s.id);
        const isSelected = selected === s.id;
        // Line weight carries traffic: the busy trunk reads as busy.
        const width = 1.5 + (s.daily_trains / busiest) * 5;
        return (
          <g key={s.id}>
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y}
              stroke={isSelected ? "var(--primary)"
                : isClosed ? "var(--bad)" : "var(--text-faint)"}
              strokeWidth={isSelected ? width + 3 : width}
              strokeLinecap="round"
              opacity={isClosed || isSelected ? 0.95 : 0.35} />
            {/* generous invisible hit area — the drawn line is too thin to click */}
            <line x1={p.x} y1={p.y} x2={q.x} y2={q.y}
              stroke="transparent" strokeWidth={16}
              style={{ cursor: isClosed ? "pointer" : "default" }}
              onClick={() => isClosed && onSelect(isSelected ? null : s.id)}>
              <title>{s.name}{isClosed ? " — closure scheduled" : ""}
                {"\n"}{s.daily_trains.toFixed(0)} trains/day</title>
            </line>
          </g>
        );
      })}

      {/* stations */}
      {Object.entries(network.stations).map(([code, st]) => {
        const p = at(code);
        if (!p) return null;
        const onClosed = network.sections.some(
          (s) => closed.has(s.id) && (s.a === code || s.b === code));
        return (
          <g key={code}>
            <circle cx={p.x} cy={p.y} r={onClosed ? 4 : 3}
              fill="var(--surface)" stroke={onClosed ? "var(--bad)" : "var(--text-faint)"}
              strokeWidth={1.8} />
            <title>{st.name} ({code})</title>
          </g>
        );
      })}

      {/* labels only where there is room: corridor ends and junctions */}
      {Object.entries(network.stations).map(([code, st]) => {
        const p = at(code);
        if (!p) return null;
        const degree = network.sections.filter(
          (s) => s.a === code || s.b === code).length;
        if (degree === 2) return null;
        return (
          <text key={"l" + code} x={p.x + 7} y={p.y + 3.5}
            className="map-label">{code}</text>
        );
      })}
    </svg>
  );
}

export const DEPT_COLOURS = DEPT_VAR;
