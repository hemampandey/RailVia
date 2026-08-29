import type {
  Approval, Block, Completion, Impact, Me, Network, Plan, StoreStatus,
} from "./types";

/** Planning parameters. Kept in one place so every view asks for the same
 *  instance — decisions are keyed by instance_id, and a mismatch would
 *  silently show approvals against the wrong plan. */
export interface PlanParams {
  days: number;
  tasks: number;
  grounded: boolean;
  timeLimit: number;
  /** First day of the horizon, ISO. Empty means the coming Monday. */
  horizonStart: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDate = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const daysInMonth = (y: number, m: number) =>
  new Date(y, m + 1, 0).getDate();

/** Planning parameters for one calendar month. */
export function monthParams(first: Date): Pick<PlanParams, "horizonStart" | "days"> {
  return {
    horizonStart: isoDate(new Date(first.getFullYear(), first.getMonth(), 1)),
    // The month's real length — February is not 30 days, and a plan running
    // past the end of the month it claims to cover is wrong.
    days: daysInMonth(first.getFullYear(), first.getMonth()),
  };
}

export const DEFAULT_PARAMS: PlanParams = {
  // 10s, not 30: measured, 10 gives a better plan than 30 on this instance.
  // See the note beside DEFAULT_UI_BUDGET in src/api/app.py.
  tasks: 120, grounded: true, timeLimit: 10,
  ...monthParams(new Date()),
};

/** The FastAPI service. Called directly, not through Next's rewrite proxy:
 *  a solve can take 60 seconds and the dev proxy drops the socket long
 *  before that. Override with NEXT_PUBLIC_API_ORIGIN when deploying. */
export const API_ORIGIN =
  process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:8077";

const qs = (p: PlanParams) => {
  const q = new URLSearchParams({
    grounded: String(p.grounded),
    tasks: String(p.tasks),
    days: String(p.days),
    seed: "42",
    time_limit: String(p.timeLimit),
  });
  if (p.horizonStart) q.set("horizon_start", p.horizonStart);
  return q.toString();
};

/** Attach the caller's Supabase access token. The API verifies it and then
 *  acts as that user against Postgres, so row-level security decides what
 *  they may do. */
const auth = (token?: string): HeadersInit =>
  token ? { Authorization: `Bearer ${token}` } : {};

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    // A browser reports every network-level failure as the same opaque
    // "Failed to fetch". Nine times out of ten here it means the Python
    // service is not running, so say that rather than repeating the browser.
    throw new Error(
      `Cannot reach the planning API at ${API_ORIGIN}. `
      + "It runs separately from this app — start it with:  "
      + ".venv/bin/uvicorn src.api.app:app --port 8077",
    );
  }
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

/** Station positions and section geometry. Fetched once — it does not change
 *  with the plan. */
export const getNetwork = () => json<Network>(`${API_ORIGIN}/api/network`);

/** The named trains a closure stops. Sliced per closure because the full set
 *  is over seven thousand traversals. */
export const getImpact = (sectionId: string, start: string, end: string) =>
  json<Impact>(
    `${API_ORIGIN}/api/impact?${new URLSearchParams({
      section_id: sectionId, start, end,
    })}`,
  );

export const getMe = (token: string) =>
  json<Me>(`${API_ORIGIN}/api/me`, { headers: auth(token) });

export const getDecisions = (instanceId: string, token: string) =>
  json<{ approvals: Approval[]; completions: Completion[] }>(
    `${API_ORIGIN}/api/decisions?instance_id=${encodeURIComponent(instanceId)}`,
    { headers: auth(token) },
  );

export const approve = (instanceId: string, b: Block, token: string) =>
  json<Approval>(`${API_ORIGIN}/api/approvals`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: JSON.stringify({
      instance_id: instanceId, section_id: b.section_id, start_iso: b.start,
    }),
  });

export const unapprove = (instanceId: string, b: Block, token: string) =>
  json<{ removed: boolean }>(
    `${API_ORIGIN}/api/approvals?${new URLSearchParams({
      instance_id: instanceId, section_id: b.section_id, start_iso: b.start,
    })}`,
    { method: "DELETE", headers: auth(token) },
  );

export const completeJob = (instanceId: string, taskId: string, token: string) =>
  json<Completion>(`${API_ORIGIN}/api/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auth(token) },
    body: JSON.stringify({ instance_id: instanceId, task_id: taskId }),
  });

export const uncompleteJob = (instanceId: string, taskId: string, token: string) =>
  json<{ removed: boolean }>(
    `${API_ORIGIN}/api/completions?${new URLSearchParams({
      instance_id: instanceId, task_id: taskId,
    })}`,
    { method: "DELETE", headers: auth(token) },
  );
