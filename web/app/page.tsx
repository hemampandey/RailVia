"use client";

import { useState } from "react";
import { usePlanner } from "@/components/PlannerProvider";
import { BlockRow } from "@/components/BlockRow";
import { Fact, HorizonToggle, Loading } from "@/components/Common";
import { RoleWarning } from "@/components/RoleWarning";
import { DEPT_VAR, type Block } from "@/lib/types";

export default function CalendarPage() {
  const { plan, loading, error, approvals, completions, isApproved } = usePlanner();
  const [selected, setSelected] = useState<string | null>(null);

  if (loading) return <Loading what="Planning the blocks…" />;
  if (error) return <div className="err">Could not load the plan: {error}</div>;
  if (!plan) return null;

  const byDay = new Map<string, Block[]>();
  for (const b of plan.blocks) {
    const k = new Date(b.start).toDateString();
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(b);
  }

  const first = new Date(plan.horizon_start + "T00:00:00");
  const last = new Date(first.getTime() + (plan.horizon_days - 1) * 86400000);
  const lead = (first.getDay() + 6) % 7; // 0 = Monday
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { day: "numeric", month: "long" });

  const chosen = selected ? byDay.get(selected) ?? [] : [];

  return (
    <>
      <h1>Calendar</h1>
      <RoleWarning />
      <div className="brief">
        <div className="brief-top">
          <h2>{fmt(first)} – {fmt(last)}</h2>
          <HorizonToggle />
        </div>
        <div className="facts">
          <Fact value={String(plan.block_count)} label="closures scheduled" />
          <Fact value={`${approvals.size}/${plan.block_count}`} label="approved" />
          <Fact value={String(completions.size)} label="jobs completed" />
          <Fact value={`${plan.total_saving.toFixed(0)} h`}
            label="saved by sharing" tone="win" />
          {plan.exceptions.length > 0 && (
            <Fact value={String(plan.exceptions.length)}
              label="unscheduled" tone="warn" />
          )}
        </div>
      </div>

      <div className="panel">
        <h3>Schedule</h3>
        <div className="cal">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div className="dow" key={d}>{d}</div>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <div className="cell empty" key={`pad${i}`} />
          ))}
          {Array.from({ length: plan.horizon_days }, (_, i) => {
            const day = new Date(first.getTime() + i * 86400000);
            const key = day.toDateString();
            const blocks = byDay.get(key) ?? [];
            const hours = blocks.reduce((a, b) => a + b.train_hours, 0);
            const ok = blocks.filter(isApproved).length;
            const depts = [...new Set(blocks.flatMap((b) => b.departments))];
            return (
              <button type="button" key={key}
                className={"cell" + (blocks.length ? " busy" : "")}
                aria-pressed={selected === key}
                aria-label={`${key}: ${blocks.length} closures, ${hours.toFixed(1)} train-hours lost`}
                onClick={() => setSelected(selected === key ? null : key)}>
                <div className="d">{day.getDate()}</div>
                <div className="n">
                  {blocks.length
                    ? `${blocks.length} closure${blocks.length > 1 ? "s" : ""}`
                    : "—"}
                </div>
                {blocks.length > 0 && (
                  <>
                    <div className="th">
                      {hours.toFixed(1)} train-h{ok ? ` · ${ok} ok` : ""}
                    </div>
                    <div className="dots">
                      {depts.map((d) => (
                        <i key={d} style={{ background: DEPT_VAR[d] }} />
                      ))}
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selected ? (
        <>
          <div className="day">
            {new Date(selected).toLocaleDateString(undefined, {
              weekday: "long", day: "numeric", month: "long",
            })}
          </div>
          {chosen.length === 0
            ? <div className="empty-state">No closures scheduled on this day.</div>
            : chosen.map((b) => <BlockRow key={b.section_id + b.start} block={b} />)}
        </>
      ) : (
        <div className="empty-state">Select a day to see its closures.</div>
      )}
    </>
  );
}
