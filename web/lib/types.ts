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
