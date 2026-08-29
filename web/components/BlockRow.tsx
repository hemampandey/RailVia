"use client";

import { useState } from "react";
import { usePlanner } from "./PlannerProvider";
import { Icon, PATH } from "./icons";
import type { Block, Job } from "@/lib/types";
import { DEPT_VAR } from "@/lib/types";

function JobChip({ job, done }: { job: Job; done: boolean }) {
  return (
    <span className={"job" + (job.overdue && !done ? " od" : "")}>
      <i style={{ background: DEPT_VAR[job.department] ?? "var(--text-faint)" }} />
      {job.department} · {job.activity.replace(/_/g, " ")}
      {done ? " · done" : job.overdue ? " · overdue" : ""}
    </span>
  );
}

export function BlockRow({ block, showDate = false }: {
  block: Block; showDate?: boolean;
}) {
  const {
    plan, store, isApproved, isDone, toggleApproval, toggleDone, approvals,
  } = usePlanner();
  const [busy, setBusy] = useState<"approve" | "done" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const approved = isApproved(block);
  const done = isDone(block);
  const connected = !!store?.connected;
  const start = new Date(block.start);
  const end = new Date(block.end);
  const sameDay = start.toDateString() === end.toDateString();
  const sectionName = plan?.sections?.[block.section_id] ?? block.section_id;
  const record = approvals.get(`${block.section_id}@${block.start}`);

  const run = async (which: "approve" | "done", fn: () => Promise<void>) => {
    setBusy(which); setErr(null);
    try { await fn(); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };

  return (
    <div className={"block" + (block.shared ? " shared" : "")
      + (block.overdue_count && !done ? " has-overdue" : "")
      + (done ? " done" : "")}>
      <div className="when">
        {start.toTimeString().slice(0, 5)}–{end.toTimeString().slice(0, 5)}
        <small>
          {showDate
            ? start.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " · "
            : ""}
          {block.hours} h{sameDay ? "" : " · +1d"}
        </small>
      </div>

      <div>
        <div className="where">
          {sectionName}<code>{block.section_id}</code>
        </div>
        <div className="jobs">
          {block.tasks.map((t) => (
            <JobChip key={t.id} job={t} done={isDone(block)} />
          ))}
        </div>
        {record && (
          <div className="meta">
            approved by {record.decided_by} ·{" "}
            {new Date(record.decided_at).toLocaleString()}
          </div>
        )}
        {err && <div className="meta" style={{ color: "var(--bad)" }}>{err}</div>}
      </div>

      <div className="cost">
        <b>{block.train_hours.toFixed(1)}</b>
        <span>train-hours</span>
        {block.saving > 0.05 && (
          <span className="save">saves {block.saving.toFixed(1)} by sharing</span>
        )}
        <div className="acts">
          <button type="button" className={approved ? "on" : ""}
            disabled={!connected || busy !== null}
            aria-pressed={approved}
            title={connected ? undefined : "Connect Supabase to record decisions"}
            onClick={() => run("approve", () => toggleApproval(block))}>
            {approved && <Icon d={PATH.check} size={13} />}
            {busy === "approve" ? "…" : approved ? "Approved" : "Approve"}
          </button>
          <button type="button" className={done ? "on" : ""}
            disabled={!connected || busy !== null}
            aria-pressed={done}
            title={connected ? undefined : "Connect Supabase to record decisions"}
            onClick={() => run("done", () => toggleDone(block))}>
            {done && <Icon d={PATH.check} size={13} />}
            {busy === "done" ? "…" : done ? "Done" : "Mark done"}
          </button>
        </div>
      </div>
    </div>
  );
}
