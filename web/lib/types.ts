export type Dept = "ENGG" | "TRD" | "S&T";

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
