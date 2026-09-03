"use client";

import { useEffect, useState } from "react";
import { usePlanner } from "./PlannerProvider";
import { getImpact, getTraffic } from "@/lib/api";
import { DEPT_VAR, type Block, type Impact, type TrafficCase } from "@/lib/types";

/* Why this closure, here, now, with these jobs.
 *
 * An officer told to hand over the line at 01:15 is owed the reason, and
 * "the optimiser said so" is not one. Everything on this panel is either
 * already in the loaded plan or plain arithmetic over the traffic profile —
 * nothing here re-runs the solver, so it costs nothing to open and can never
 * be the thing that runs the demo out of memory.
 */

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** The section's day, with the threshold that makes an hour blockable and
 *  the chosen window marked. Drawn rather than described: "quietest 25%" is
 *  an abstraction until you see the shape it refers to. */
function TrafficChart({ tc }: { tc: TrafficCase }) {
  const W = 480, H = 156;
  const L = 30, R = 8, T = 10, B = 22;
  const plotW = W - L - R, plotH = H - T - B;
  const top = Math.max(tc.peak, tc.threshold) * 1.12 || 1;
  const bw = plotW / 24;
  const y = (v: number) => T + plotH - (v / top) * plotH;
  const inWindow = new Set(("hours" in tc.window ? tc.window.hours : []) as number[]);
  const blockable = new Set(tc.blockable_hours);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="tchart" role="img"
      aria-label={
        `Trains per hour on ${tc.section_name}. Peak ${tc.peak} at `
        + `${String(tc.peak_hour).padStart(2, "0")}:00. Blockable at or below `
        + `${tc.threshold} trains per hour. The chosen window covers `
        + (inWindow.size ? [...inWindow].map((h) => `${h}:00`).join(", ") : "no hours")
      }>
      {[0, top / 2, top].map((v) => (
        <g key={v}>
          <line x1={L} y1={y(v)} x2={W - R} y2={y(v)}
            stroke="var(--border-soft)" strokeWidth="1" />
          <text x={L - 5} y={y(v) + 3.5} textAnchor="end"
            fontSize="8.5" fill="var(--text-faint)">{v.toFixed(0)}</text>
        </g>
      ))}

      {tc.profile.map((v, h) => {
        const chosen = inWindow.has(h);
        return (
          <rect key={h} x={L + h * bw + 1} y={y(v)}
            width={Math.max(1, bw - 2)} height={Math.max(0.5, T + plotH - y(v))}
            rx="1"
            fill={chosen ? "var(--good)" : blockable.has(h)
              ? "var(--good-soft)" : "var(--surface-3)"}
            stroke={chosen ? "var(--good)" : "none"} strokeWidth="1" />
        );
      })}

      {/* The rule, not a decoration: at or below this line an hour may carry
          a block; above it, never. */}
      <line x1={L} y1={y(tc.threshold)} x2={W - R} y2={y(tc.threshold)}
        stroke="var(--good)" strokeWidth="1.4" strokeDasharray="4 3" />
      <text x={W - R} y={y(tc.threshold) - 4} textAnchor="end"
        fontSize="8.5" fontWeight="700" fill="var(--good)">
        blockable at or below {tc.threshold}/h
      </text>

      {[0, 6, 12, 18, 23].map((h) => (
        <text key={h} x={L + h * bw + bw / 2} y={H - 7} textAnchor="middle"
          fontSize="8.5" fill="var(--text-faint)">
          {String(h).padStart(2, "0")}
        </text>
      ))}
    </svg>
  );
}

export function ExplainDrawer({ block, onClose }: {
  block: Block; onClose: () => void;
}) {
  const { plan, params } = usePlanner();
  const [tc, setTc] = useState<TrafficCase | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setTc(null); setImpact(null); setFailed(null);
    getTraffic(block.section_id, block.start, block.end, params)
      .then((r) => { if (live) setTc(r); })
      .catch((e: unknown) => {
        if (live) setFailed(e instanceof Error ? e.message : String(e));
      });
    getImpact(block.section_id, block.start, block.end)
      .then((r) => { if (live) setImpact(r); })
      .catch(() => { /* the trains section says it is unavailable */ });
    return () => { live = false; };
  }, [block.section_id, block.start, block.end, params]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const sectionName = plan?.sections?.[block.section_id] ?? block.section_id;
  const overdue = block.tasks.filter((t) => t.overdue).length;
  /* Work on this same section the plan could not fit. It belongs here: the
     honest answer to "why this closure" includes what it left behind. */
  const deferred = (plan?.exceptions ?? []).filter(
    (e) => e.section === block.section_id);
  /* `window` is {} when the caller asked for no window, so this is a real
     discriminator — and it must not run before tc arrives: `in` on undefined
     throws, which would crash the panel while it is still loading. */
  const win = tc && "hours" in tc.window
    ? (tc.window as {
      hours: number[]; mean_trains_per_hour: number;
      train_hours: number; at_peak_train_hours: number;
    })
    : null;

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="drawer wide" aria-label={`Why this closure on ${sectionName}`}>
        <div className="drawer-head">
          <div>
            <h3>Why this closure</h3>
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
              {sectionName} · {new Date(block.start).toLocaleDateString(undefined, {
                weekday: "short", day: "numeric", month: "short",
              })} · {hhmm(block.start)}–{hhmm(block.end)}
            </span>
          </div>
          <button type="button" className="collapse-toggle" onClick={onClose}
            aria-label="Close panel">
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className="drawer-body">
          <section className="xp">
            <h4>Why this section</h4>
            <p>
              {block.tasks.length === 1
                ? "One job was due here"
                : `${block.tasks.length} jobs were due here`}
              {overdue > 0 && <> — <b>{overdue} already overdue</b></>}, across{" "}
              {block.departments.length} department
              {block.departments.length === 1 ? "" : "s"}.
            </p>
            <div className="jobs">
              {block.tasks.map((t) => (
                <span key={t.id} className={"job" + (t.overdue ? " od" : "")}>
                  <i style={{ background: DEPT_VAR[t.department] }} />
                  <b>{t.department}</b> · {t.activity.replace(/_/g, " ")}
                  {t.overdue ? " · overdue" : ""}
                </span>
              ))}
            </div>
          </section>

          <section className="xp">
            <h4>Why this hour</h4>
            {failed && <div className="err">{failed}</div>}
            {!tc && !failed && <div className="sk" />}
            {tc && (
              <>
                <TrafficChart tc={tc} />
                <p>
                  This section carries <b>{tc.daily_trains} trains a day</b>, peaking
                  at {tc.peak}/h around {String(tc.peak_hour).padStart(2, "0")}:00.
                  Only <b>{Math.round(tc.permitted_share * 100)}%</b> of the month is
                  quiet enough to block at all — at or below {tc.threshold} trains an
                  hour, which is this section&rsquo;s own quietest{" "}
                  {Math.round(tc.percentile)}%, not a fixed national rule.
                </p>
                {win && win.at_peak_train_hours > win.train_hours && (
                  <p className="xp-counter">
                    The same closure in this section&rsquo;s busiest hour would cost{" "}
                    <b>{win.at_peak_train_hours} train-hours</b>. Here it costs{" "}
                    <b>{block.train_hours.toFixed(1)}</b>.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="xp">
            <h4>Why these jobs together</h4>
            {block.shared ? (
              <p>
                <b>{block.departments.join(" + ")}</b> share this handover. Booked
                the way they are today — separately, through their own systems —
                the same work needs {block.tasks.length} closures on this section.
              </p>
            ) : (
              <p>
                One department only. Nothing else on this section was due in a
                window this job could share.
              </p>
            )}
            {/* Only a shared closure has a "separately" to compare against.
                Showing an identical pair for a one-department block invents a
                saving where there is none. */}
            {block.shared && block.saving > 0.05 ? (
              <div className="xp-cost">
                <div>
                  <span>Separately</span>
                  <b className="bad">{block.separate_cost.toFixed(1)}</b>
                  <small>train-hours</small>
                </div>
                <div className="xp-arrow" aria-hidden="true">→</div>
                <div>
                  <span>As planned</span>
                  <b className="good">{block.train_hours.toFixed(1)}</b>
                  <small>train-hours</small>
                </div>
                <div className="xp-save">
                  saves <b>{block.saving.toFixed(1)} h</b>
                </div>
              </div>
            ) : (
              <div className="xp-cost">
                <div>
                  <span>This closure costs</span>
                  <b>{block.train_hours.toFixed(1)}</b>
                  <small>train-hours</small>
                </div>
              </div>
            )}
          </section>

          <section className="xp">
            <h4>Which trains it holds</h4>
            {!impact ? (
              <p className="hint">Working out affected services…</p>
            ) : impact.affected_count === 0 ? (
              <p>No scheduled service crosses this section during the window.</p>
            ) : (
              <>
                <p>
                  <b>{impact.affected_count} scheduled services</b> cross this
                  section while it is closed.
                </p>
                <ul className="xp-trains">
                  {impact.trains.slice(0, 6).map((t) => (
                    <li key={t.number + t.at}>
                      <code>{t.number}</code>
                      <span>{t.name}</span>
                      <small>{t.at}</small>
                    </li>
                  ))}
                </ul>
                {impact.trains.length > 6 && (
                  <p className="hint">
                    and {impact.trains.length - 6} more.
                  </p>
                )}
              </>
            )}
          </section>

          {deferred.length > 0 && (
            <section className="xp">
              <h4>What it left behind</h4>
              <p className="hint">
                Work on this section the plan could not fit. The honest answer to
                &ldquo;why this closure&rdquo; includes what did not make it.
              </p>
              <ul className="xp-deferred">
                {deferred.map((e) => (
                  <li key={e.id}>
                    <div className="xp-def-h">
                      <span className="job">
                        <i style={{ background: DEPT_VAR[e.department] }} />
                        {e.department}
                      </span>
                      <b>{e.activity.replace(/_/g, " ")}</b>
                      {e.overdue && <span className="tag-urgent">Overdue</span>}
                    </div>
                    <div className="why">{e.reason}</div>
                    <div className="fix">{e.fix}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
