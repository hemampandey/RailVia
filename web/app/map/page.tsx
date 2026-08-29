"use client";

import { useEffect, useState } from "react";
import { usePlanner } from "@/components/PlannerProvider";
import { NetworkMap } from "@/components/NetworkMap";
import { Fact, Loading } from "@/components/Common";
import { PeriodPicker } from "@/components/PeriodPicker";
import { getImpact, getNetwork } from "@/lib/api";
import type { Impact, Network } from "@/lib/types";
import { DEPT_VAR } from "@/lib/types";

export default function MapPage() {
  const { plan, loading, error } = usePlanner();
  const [network, setNetwork] = useState<Network | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getNetwork().then(setNetwork).catch(() => setNetwork(null));
  }, []);

  /* A section can carry several closures across the month; the impact of
     each is its own question, so the first is shown and the rest listed. */
  const onSection = async (sectionId: string | null) => {
    setSelected(sectionId);
    setImpact(null);
    if (!sectionId || !plan) return;
    const block = plan.blocks.find((b) => b.section_id === sectionId);
    if (!block) return;
    setBusy(true);
    try { setImpact(await getImpact(sectionId, block.start, block.end)); }
    catch { setImpact(null); }
    finally { setBusy(false); }
  };

  if (loading) return <Loading what="Planning the blocks…" />;
  if (error) return <div className="err">Could not load: {error}</div>;
  if (!plan) return null;

  const closedSections = new Set(plan.blocks.map((b) => b.section_id));
  const selectedBlocks = selected
    ? plan.blocks.filter((b) => b.section_id === selected) : [];

  return (
    <>
      <h1>Map</h1>
      <div className="brief">
        <div className="brief-top">
          <h2>{new Date(plan.horizon_start + "T00:00:00")
            .toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
          <PeriodPicker />
        </div>
        <div className="facts">
          <Fact value={String(closedSections.size)} label="sections with a closure" />
          <Fact value={String(plan.block_count)} label="closures" />
          <Fact value={`${plan.train_hours_lost.toFixed(0)} h`}
            label="train-hours lost" tone="warn" />
        </div>
      </div>

      <div className="panel">
        <h3>Delhi division — {network ? Object.keys(network.stations).length : "…"} stations</h3>
        <div className="note" style={{ border: "none", padding: 0, margin: "0 0 12px" }}>
          Line weight is traffic. Red sections have a closure this month —
          select one to see which trains it stops.
        </div>
        {network
          ? <div className="scroll">
              <NetworkMap network={network} blocks={plan.blocks}
                selected={selected} onSelect={onSection} />
            </div>
          : <div className="empty-state">Map data unavailable.</div>}
      </div>

      {selected && (
        <div className="panel">
          <h3>{impact?.section_name ?? selected}</h3>
          {selectedBlocks.length > 1 && (
            <div className="note" style={{ border: "none", padding: 0, margin: "0 0 10px" }}>
              {selectedBlocks.length} closures here this month; showing the first.
            </div>
          )}
          {busy && <div className="status"><div className="spin" />Finding affected trains…</div>}

          {impact && (
            <>
              <div className="facts" style={{ marginBottom: 16 }}>
                <Fact value={String(impact.affected_count)} label="trains stopped" tone="warn" />
                <Fact
                  value={`${new Date(impact.start).toTimeString().slice(0, 5)}–${new Date(impact.end).toTimeString().slice(0, 5)}`}
                  label={new Date(impact.start).toLocaleDateString(
                    undefined, { weekday: "long", day: "numeric", month: "long" })} />
                {selectedBlocks[0] && (
                  <Fact value={selectedBlocks[0].train_hours.toFixed(1)}
                    label="train-hours lost" />
                )}
              </div>

              {selectedBlocks[0] && (
                <div className="jobs" style={{ marginBottom: 16 }}>
                  {selectedBlocks[0].tasks.map((t) => (
                    <span className="job" key={t.id}>
                      <i style={{ background: DEPT_VAR[t.department] }} />
                      {t.department} · {t.activity.replace(/_/g, " ")}
                    </span>
                  ))}
                </div>
              )}

              {impact.affected_count === 0 ? (
                <div className="empty-state">
                  <b>No trains stopped</b>
                  This closure sits in a genuinely empty window — the cheapest
                  kind there is.
                </div>
              ) : (
                <div className="scroll">
                  <table>
                    <thead>
                      <tr><th>Due</th><th>Train</th><th>Service</th><th>Type</th></tr>
                    </thead>
                    <tbody>
                      {impact.trains.map((t) => (
                        <tr key={t.number + t.at}>
                          <td className="mono">{t.at.slice(11, 16)}</td>
                          <td className="mono">{t.number}</td>
                          <td>{t.name}</td>
                          <td style={{ color: "var(--text-faint)" }}>{t.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
