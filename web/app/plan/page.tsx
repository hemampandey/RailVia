"use client";

import { usePlanner } from "@/components/PlannerProvider";
import { BlockRow } from "@/components/BlockRow";
import { Fact, HorizonToggle, Loading } from "@/components/Common";
import { RoleWarning } from "@/components/RoleWarning";
import { Icon, PATH } from "@/components/icons";
import { DEPT_VAR } from "@/lib/types";

export default function PlanPage() {
  const { plan, loading, error, approvals } = usePlanner();

  if (loading) return <Loading what="Planning the blocks…" />;
  if (error) return <div className="err">Could not load the plan: {error}</div>;
  if (!plan) return null;

  let currentDay: string | null = null;

  return (
    <>
      <h1>Plan</h1>
      <RoleWarning />
      <div className="brief">
        <div className="brief-top">
          <h2>Proposed closures</h2>
          <HorizonToggle />
        </div>
        <div className="facts">
          <Fact value={String(plan.block_count)} label="closures proposed" />
          <Fact value={`${plan.scheduled}/${plan.task_total}`} label="jobs scheduled" />
          <Fact value={`${plan.total_saving.toFixed(0)} h`}
            label="saved by sharing" tone="win" />
          <Fact value={`${approvals.size}/${plan.block_count}`} label="approved" />
          {plan.exceptions.length > 0 && (
            <Fact value={String(plan.exceptions.length)}
              label="need a decision" tone="warn" />
          )}
        </div>
      </div>

      {plan.exceptions.length > 0 && (
        <details className="exc" open={plan.exceptions.length <= 8}>
          <summary>
            <Icon d={PATH.warn} size={16} />
            {plan.exceptions.length} jobs could not be scheduled — review these first
          </summary>
          <div className="exc-body">
            {plan.exceptions.slice(0, 40).map((e) => (
              <div className="exc-row" key={e.id}>
                <span className="job">
                  <i style={{ background: DEPT_VAR[e.department] }} />
                  {e.department}
                </span>
                <div>
                  <div>
                    <b>{e.activity.replace(/_/g, " ")}</b> on{" "}
                    {plan.sections[e.section] ?? e.section}
                  </div>
                  <div className="why">{e.reason}</div>
                  <div className="fix">Fix: {e.fix}</div>
                </div>
                <div className="cost">
                  <b style={{
                    fontSize: 12,
                    color: e.overdue ? "var(--bad)" : undefined,
                  }}>
                    {e.overdue ? "OVERDUE" : `due ${e.due.slice(5)}`}
                  </b>
                  <span>severity {e.severity}</span>
                </div>
              </div>
            ))}
            {plan.exceptions.length > 40 && (
              <div className="exc-row">
                …and {plan.exceptions.length - 40} more
              </div>
            )}
          </div>
        </details>
      )}

      {plan.blocks.map((b) => {
        const day = new Date(b.start).toDateString();
        const heading = day !== currentDay ? day : null;
        currentDay = day;
        return (
          <div key={b.section_id + b.start}>
            {heading && (
              <div className="day">
                {new Date(heading).toLocaleDateString(undefined, {
                  weekday: "long", day: "numeric", month: "long",
                })}
              </div>
            )}
            <BlockRow block={b} />
          </div>
        );
      })}
    </>
  );
}
