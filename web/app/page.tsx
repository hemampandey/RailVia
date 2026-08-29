"use client";

import { useState } from "react";
import { usePlanner } from "@/components/PlannerProvider";
import { BlockRow } from "@/components/BlockRow";
import { Fact, Loading } from "@/components/Common";
import { PeriodPicker } from "@/components/PeriodPicker";
import { GanttView } from "@/components/GanttView";
import { DayDetailModal } from "@/components/DayDetailModal";
import { DEPT_VAR, type Block, type Dept } from "@/lib/types";

export default function CalendarPage() {
  const { plan, loading, error, approvals, completions, isApproved } = usePlanner();
  const [selected, setSelected] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "gantt">("grid");
  const [deptFilter, setDeptFilter] = useState<Dept | "ALL">("ALL");

  if (loading) return <Loading what="Optimising track maintenance blocks with CP-SAT…" />;
  if (error) return <div className="err">Could not load the plan: {error}</div>;
  if (!plan) return null;

  // Filter blocks by department if requested
  const filteredBlocks = plan.blocks.filter((b) =>
    deptFilter === "ALL" ? true : b.departments.includes(deptFilter)
  );

  const byDay = new Map<string, Block[]>();
  for (const b of filteredBlocks) {
    const k = new Date(b.start).toDateString();
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(b);
  }

  const first = new Date(plan.horizon_start + "T00:00:00");
  const lead = (first.getDay() + 6) % 7; // 0 = Monday
  const heading = first.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const approvalRate = plan.block_count > 0 ? (approvals.size / plan.block_count) * 100 : 0;
  const chosenDayBlocks = selected ? byDay.get(selected) ?? [] : [];

  return (
    <>
      <div className="page-header">
        <h1>
          <span className="live-dot" title="Live CP-SAT Solver" />
          Calendar Schedule
        </h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <PeriodPicker />
        </div>
      </div>

      <div className="brief">
        <div className="brief-top">
          <h2>{heading} Overview</h2>
          <span style={{ fontSize: 13, color: "var(--text-faint)" }}>
            Horizon: {plan.horizon_days} Days · {plan.task_total} Jobs Processed
          </span>
        </div>
        <div className="kpi-grid">
          <Fact
            value={String(plan.block_count)}
            label="Closures Scheduled"
          />
          <Fact
            value={`${approvals.size}/${plan.block_count}`}
            label="Approved by Head"
            progress={approvalRate}
            tone={approvalRate > 50 ? "win" : undefined}
          />
          <Fact
            value={String(completions.size)}
            label="Jobs Completed"
          />
          <Fact
            value={`${plan.total_saving.toFixed(0)} h`}
            label="Saved by Sharing"
            tone="win"
          />
          {plan.exceptions.length > 0 && (
            <Fact
              value={String(plan.exceptions.length)}
              label="Unscheduled Conflicts"
              tone="warn"
            />
          )}
        </div>
      </div>

      {/* Controls Bar: Department Filter & View Switcher */}
      <div className="controls-bar">
        <div className="dept-filters">
          <button
            type="button"
            className={"dept-chip" + (deptFilter === "ALL" ? " active" : "")}
            onClick={() => setDeptFilter("ALL")}
          >
            All Departments
          </button>
          <button
            type="button"
            className={"dept-chip" + (deptFilter === "ENGG" ? " active" : "")}
            onClick={() => setDeptFilter("ENGG")}
          >
            <i style={{ background: DEPT_VAR.ENGG }} /> ENGG Track
          </button>
          <button
            type="button"
            className={"dept-chip" + (deptFilter === "TRD" ? " active" : "")}
            onClick={() => setDeptFilter("TRD")}
          >
            <i style={{ background: DEPT_VAR.TRD }} /> TRD Overhead
          </button>
          <button
            type="button"
            className={"dept-chip" + (deptFilter === "S&T" ? " active" : "")}
            onClick={() => setDeptFilter("S&T")}
          >
            <i style={{ background: DEPT_VAR["S&T"] }} /> S&T Signals
          </button>
        </div>

        <div className="seg-group" role="tablist" aria-label="Schedule View Selector">
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "grid"}
            aria-pressed={viewMode === "grid"}
            onClick={() => setViewMode("grid")}
          >
            Month Grid
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "gantt"}
            aria-pressed={viewMode === "gantt"}
            onClick={() => setViewMode("gantt")}
          >
            Gantt Timeline
          </button>
        </div>
      </div>

      {viewMode === "gantt" ? (
        <GanttView
          blocks={filteredBlocks}
          sections={plan.sections}
          onSelectBlock={(b) => setSelected(new Date(b.start).toDateString())}
        />
      ) : (
        <div className="panel">
          <div className="panel-head">
            <h3>Monthly Block Matrix</h3>
            <span style={{ fontSize: 12, color: "var(--text-faint)" }}>
              Click any date to inspect coordinated closures
            </span>
          </div>
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
                <button
                  type="button"
                  key={key}
                  className={"cell" + (blocks.length ? " busy" : "")}
                  aria-pressed={selected === key}
                  aria-label={`${key}: ${blocks.length} closures, ${hours.toFixed(1)} train-hours lost`}
                  onClick={() => setSelected(selected === key ? null : key)}
                >
                  <div className="d">
                    <span>{day.getDate()}</span>
                    {blocks.length > 0 && ok > 0 && (
                      <span style={{ fontSize: 10, color: "var(--good)", fontWeight: 700 }}>
                        {ok}/{blocks.length} ok
                      </span>
                    )}
                  </div>
                  <div className="n">
                    {blocks.length
                      ? `${blocks.length} closure${blocks.length > 1 ? "s" : ""}`
                      : "—"}
                  </div>
                  {blocks.length > 0 && (
                    <>
                      <div className="th">
                        {hours.toFixed(1)} train-h
                      </div>
                      <div className="dots">
                        {depts.map((d) => (
                          <i key={d} style={{ background: DEPT_VAR[d] }} title={d} />
                        ))}
                      </div>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Slide-over Drawer for Selected Calendar Day */}
      {selected && (
        <DayDetailModal
          dayDate={new Date(selected)}
          blocks={chosenDayBlocks}
          onClose={() => setSelected(null)}
        />
      )}

      {/* In-page list fallback if drawer is closed */}
      {!selected && viewMode === "grid" && (
        <div style={{ marginTop: "var(--s4)" }}>
          <div className="panel-head">
            <h3>Coordinated Block Schedule Overview</h3>
          </div>
          {filteredBlocks.slice(0, 5).map((b) => (
            <BlockRow key={b.section_id + b.start} block={b} showDate />
          ))}
          {filteredBlocks.length > 5 && (
            <div className="empty-state" style={{ padding: "var(--s3)" }}>
              Showing top 5 closures. Select a specific day or switch to Gantt Timeline to view all.
            </div>
          )}
        </div>
      )}
    </>
  );
}
