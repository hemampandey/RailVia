export type Dept = "ENGG" | "TRD" | "S&T";

export interface Division {
  id: string;
  name: string;
  zone: string;
  sectionsCount: number;
}

export const DIVISIONS: Division[] = [
  { id: "DLI", name: "Delhi", zone: "Northern Railway (NR)", sectionsCount: 39 },
  { id: "UMB", name: "Ambala", zone: "Northern Railway (NR)", sectionsCount: 28 },
  { id: "MB", name: "Moradabad", zone: "Northern Railway (NR)", sectionsCount: 34 },
  { id: "MMCT", name: "Mumbai Central", zone: "Western Railway (WR)", sectionsCount: 42 },
  { id: "HWH", name: "Howrah", zone: "Eastern Railway (ER)", sectionsCount: 45 },
  { id: "SBC", name: "Bengaluru", zone: "South Western Railway (SWR)", sectionsCount: 30 },
];

export interface Job {
  id: string;
  activity: string;
  department: Dept;
  severity: number;
  overdue: boolean;
}

export interface Block {
  section_id: string;
  start: string;
  end: string;
  hours: number;
  train_hours: number;
  departments: Dept[];
  shared: boolean;
  tasks: Job[];
  separate_cost: number;
  saving: number;
  overdue_count: number;
}

export interface Exception {
  id: string;
  section: string;
  activity: string;
  department: Dept;
  severity: number;
  overdue: boolean;
  due: string;
  criticality: number;
  reason: string;
  fix: string;
}

export interface Plan {
  instance_id: string;
  status: string;
  wall_time: number;
  train_hours_lost: number;
  blocks: Block[];
  block_count: number;
  scheduled: number;
  task_total: number;
  shared_blocks: number;
  unscheduled: string[];
  exceptions: Exception[];
  late_tasks: number;
  total_saving: number;
  horizon_start: string;
  horizon_days: number;
  sections: Record<string, string>;
}

export interface StoreStatus {
  connected: boolean;
  backend: string;
  shared: boolean;
  detail: string;
}

export interface Approval {
  instance_id: string;
  section_id: string;
  start_iso: string;
  decided_by: string;
  decided_at: string;
  note: string;
}

export interface Completion {
  instance_id: string;
  task_id: string;
  completed_at: string;
  completed_by: string;
  note: string;
}

export const DEPT_VAR: Record<Dept, string> = {
  ENGG: "var(--engg)",
  TRD: "var(--trd)",
  "S&T": "var(--snt)",
};

export const blockKey = (b: Pick<Block, "section_id" | "start">) =>
  `${b.section_id}@${b.start}`;

export type Role = "head" | "engineer";

/** Who is signed in and what they may do. Supplied by the API, which reads
 *  the role from Postgres under row-level security — never trusted from the
 *  browser. */
export interface Me {
  user_id: string;
  email: string;
  role: Role;
  can_approve: boolean;
  can_complete: boolean;
}

export const ROLE_LABEL: Record<Role, string> = {
  head: "Divisional head",
  engineer: "Section engineer",
};

export interface Station { name: string; lat: number | null; lng: number | null; }

export interface NetworkSection {
  id: string; a: string; b: string; name: string;
  length_km: number | null; daily_trains: number; peak: number;
}

export interface Network {
  stations: Record<string, Station>;
  sections: NetworkSection[];
  corridors: string[][];
}

export interface AffectedTrain {
  number: string; name: string; entry: number; exit: number | null;
  days: number[]; type: string; at: string;
}

export interface Impact {
  section_id: string; section_name: string;
  start: string; end: string;
  affected_count: number; trains: AffectedTrain[];
}

/* ── field intake ──────────────────────────────────────────────────────
 *
 * A report is what an engineer files when they find something wrong. It is a
 * request, not a scheduled job: it becomes work the planner can place only
 * once the divisional head accepts it.
 */

export type ReportStatus = "open" | "accepted" | "rejected";

export interface Report {
  id: string;
  section_id: string;
  activity_type: string;
  summary: string;
  /** The department that owns the asset and will do the work. */
  department: Dept;
  /** Others who must attend — an OHE isolation, a signal disconnection.
   *  This is the co-location signal: it is why one closure serves two. */
  concerns: Dept[];
  severity: number;
  emergency: boolean;
  duration_minutes: number;
  crew_required: number;
  detail: string;
  status: ReportStatus;
  reported_by: string;
  reported_at: string;
  decided_by: string;
  decided_at: string;
  decision_note: string;
}

/** One entry from the maintenance catalogue. Served by the API rather than
 *  hardcoded here, so the form can only offer work the planner knows how to
 *  schedule. */
export interface Activity {
  activity_type: string;
  label: string;
  department: Dept;
  interval_days: number;
  typical_minutes: number;
  typical_crew: number;
  co_locatable: boolean;
  source: string;
}

export interface QuietWindow {
  start: string;
  end: string;
  train_hours: number;
}

export interface WindowQuote {
  section_id: string;
  section_name: string;
  minutes: number;
  candidates: QuietWindow[];
  earliest: QuietWindow | null;
  permitted_share: number;
  /** True when the month being planned has already run out — a different
   *  fact from the job not fitting, and it needs different words. */
  horizon_over: boolean;
}

export const STATUS_LABEL: Record<ReportStatus, string> = {
  open: "Awaiting the head",
  accepted: "Accepted into the backlog",
  rejected: "Turned down",
};

export const DEPTS: Dept[] = ["ENGG", "TRD", "S&T"];

export const DEPT_FULL: Record<Dept, string> = {
  ENGG: "Permanent way — track, ballast, rails, bridges",
  TRD: "Traction distribution — overhead equipment",
  "S&T": "Signal & telecommunications",
};
