"use client";

import { usePlanner } from "@/components/PlannerProvider";
import { Fact, Loading, SetupBanner } from "@/components/Common";
import { DEPT_VAR } from "@/lib/types";

export default function CompletedPage() {
  const { plan, store, loading, error, completions } = usePlanner();

  if (loading) return <Loading what="Loading completed work…" />;
  if (error) return <div className="err">Could not load: {error}</div>;
  if (!plan) return null;

  if (!store?.connected) {
    return (<><h1>Completed</h1><SetupBanner /></>);
  }

  const done = plan.blocks.flatMap((b) =>
    b.tasks.filter((t) => completions.has(t.id)).map((t) => ({ task: t, block: b })));
  const overdueCleared = done.filter((d) => d.task.overdue).length;

  return (
    <>
      <h1>Completed</h1>
      <div className="brief">
        <div className="facts">
          <Fact value={String(done.length)} label="jobs completed" tone="win" />
          <Fact value={String(Math.max(0, plan.scheduled - done.length))}
            label="scheduled, not yet done" />
          <Fact value={String(overdueCleared)} label="overdue jobs cleared"
            tone={overdueCleared ? "win" : undefined} />
        </div>
      </div>

      {done.length === 0 ? (
        <div className="empty-state">
          <b>Nothing marked done yet</b>
          Use “Mark done” on a closure once the work has been carried out.
        </div>
      ) : (
        <div className="panel">
          <h3>Completed work</h3>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Job</th><th>Department</th><th>Section</th><th>Completed</th>
                </tr>
              </thead>
              <tbody>
                {done.map(({ task, block }) => {
                  const c = completions.get(task.id)!;
                  return (
                    <tr key={task.id}>
                      <td>{task.activity.replace(/_/g, " ")}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <i style={{
                          display: "inline-block", width: 7, height: 7,
                          borderRadius: 2, marginRight: 6,
                          background: DEPT_VAR[task.department],
                        }} />
                        {task.department}
                      </td>
                      <td>{plan.sections[block.section_id] ?? block.section_id}</td>
                      <td className="mono">
                        {new Date(c.completed_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
