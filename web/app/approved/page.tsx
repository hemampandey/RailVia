"use client";

import { usePlanner } from "@/components/PlannerProvider";
import { BlockRow } from "@/components/BlockRow";
import { Fact, Loading, SetupBanner } from "@/components/Common";

export default function ApprovedPage() {
  const { plan, store, loading, error, isApproved } = usePlanner();

  if (loading) return <Loading what="Loading approvals…" />;
  if (error) return <div className="err">Could not load: {error}</div>;
  if (!plan) return null;

  if (!store?.connected) {
    return (<><h1>Approved</h1><SetupBanner /></>);
  }

  const approved = plan.blocks.filter(isApproved);
  const hours = approved.reduce((a, b) => a + b.train_hours, 0);
  const jobs = approved.reduce((a, b) => a + b.tasks.length, 0);

  return (
    <>
      <h1>Approved</h1>
      <div className="brief">
        <div className="facts">
          <Fact value={String(approved.length)} label="closures approved" />
          <Fact value={hours.toFixed(1)} label="train-hours committed" />
          <Fact value={String(jobs)} label="jobs covered" />
        </div>
      </div>

      {approved.length === 0 ? (
        <div className="empty-state">
          <b>Nothing approved yet</b>
          Approve closures from the Plan or Calendar view and they appear here,
          with who approved them and when.
        </div>
      ) : (
        approved.map((b) => (
          <BlockRow key={b.section_id + b.start} block={b} showDate />
        ))
      )}
    </>
  );
}
