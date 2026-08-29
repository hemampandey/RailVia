import type {
  Approval, Block, Completion, Plan, StoreStatus,
} from "./types";

/** Planning parameters. Kept in one place so every view asks for the same
 *  instance — decisions are keyed by instance_id, and a mismatch would
 *  silently show approvals against the wrong plan. */
export interface PlanParams {
  days: number;
  tasks: number;
  grounded: boolean;
  timeLimit: number;
}

export const DEFAULT_PARAMS: PlanParams = {
  days: 7, tasks: 120, grounded: true, timeLimit: 30,
};

/** The FastAPI service. Called directly, not through Next's rewrite proxy:
 *  a solve can take 60 seconds and the dev proxy drops the socket long
 *  before that. Override with NEXT_PUBLIC_API_ORIGIN when deploying. */
export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8077";

const qs = (p: PlanParams) =>
  new URLSearchParams({
    grounded: String(p.grounded),
    tasks: String(p.tasks),
    days: String(p.days),
    seed: "42",
    time_limit: String(p.timeLimit),
  }).toString();

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const getPlan = (p: PlanParams) =>
  json<Plan>(`${API_ORIGIN}/api/plan?${qs(p)}`);

export const getStore = () => json<StoreStatus>(`${API_ORIGIN}/api/store`);

export const getDecisions = (instanceId: string) =>
  json<{ approvals: Approval[]; completions: Completion[] }>(
    `${API_ORIGIN}/api/decisions?instance_id=${encodeURIComponent(instanceId)}`,
  );

export const approve = (instanceId: string, b: Block) =>
  json<Approval>(`${API_ORIGIN}/api/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instance_id: instanceId, section_id: b.section_id, start_iso: b.start,
    }),
  });

export const unapprove = (instanceId: string, b: Block) =>
  json<{ removed: boolean }>(
    `${API_ORIGIN}/api/approvals?${new URLSearchParams({
      instance_id: instanceId, section_id: b.section_id, start_iso: b.start,
    })}`,
    { method: "DELETE" },
  );

export const completeJob = (instanceId: string, taskId: string) =>
  json<Completion>(`${API_ORIGIN}/api/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instance_id: instanceId, task_id: taskId }),
  });

export const uncompleteJob = (instanceId: string, taskId: string) =>
  json<{ removed: boolean }>(
    `${API_ORIGIN}/api/completions?${new URLSearchParams({
      instance_id: instanceId, task_id: taskId,
    })}`,
    { method: "DELETE" },
  );
