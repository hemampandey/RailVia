"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import {
  approve as apiApprove, completeJob, DEFAULT_PARAMS, getDecisions, getPlan,
  getStore, PlanParams, unapprove as apiUnapprove, uncompleteJob,
} from "@/lib/api";
import type { Approval, Block, Completion, Plan, StoreStatus } from "@/lib/types";
import { blockKey } from "@/lib/types";
import { useAuth } from "./AuthProvider";

/** One provider for the whole app.
 *
 * Every view needs the same plan and the same decisions, and a solve costs up
 * to a minute — so it is fetched once here and shared, rather than each route
 * re-requesting it. Decisions are keyed by instance_id, so plan and decisions
 * must always be loaded together or approvals would attach to the wrong plan.
 */
interface Ctx {
  plan: Plan | null;
  store: StoreStatus | null;
  approvals: Map<string, Approval>;
  completions: Map<string, Completion>;
  params: PlanParams;
  loading: boolean;
  error: string | null;
  setParams: (p: Partial<PlanParams>) => void;
  reload: () => void;
  toggleApproval: (b: Block) => Promise<void>;
  toggleDone: (b: Block) => Promise<void>;
  isApproved: (b: Block) => boolean;
  isDone: (b: Block) => boolean;
}

const PlannerContext = createContext<Ctx | null>(null);

export const usePlanner = () => {
  const ctx = useContext(PlannerContext);
  if (!ctx) throw new Error("usePlanner must be used inside PlannerProvider");
  return ctx;
};

export function PlannerProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const [params, setParamsState] = useState<PlanParams>(DEFAULT_PARAMS);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [store, setStore] = useState<StoreStatus | null>(null);
  const [approvals, setApprovals] = useState<Map<string, Approval>>(new Map());
  const [completions, setCompletions] = useState<Map<string, Completion>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const status = await getStore().catch(
          (): StoreStatus => ({
            connected: false, backend: "Supabase", shared: true,
            detail: "API unreachable",
          }),
        );
        const p = await getPlan(params);
        if (cancelled) return;
        setStore(status);
        setPlan(p);
        if (status.connected && token) {
          try {
            const d = await getDecisions(p.instance_id, token);
            if (cancelled) return;
            setApprovals(new Map(d.approvals.map((a) => [
              `${a.section_id}@${a.start_iso}`, a,
            ])));
            setCompletions(new Map(d.completions.map((c) => [c.task_id, c])));
          } catch {
            /* the banner already explains why decisions are unavailable */
          }
        } else {
          setApprovals(new Map());
          setCompletions(new Map());
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params, tick, token]);

  const setParams = useCallback((patch: Partial<PlanParams>) => {
    setParamsState((p) => ({ ...p, ...patch }));
  }, []);

  const isApproved = useCallback(
    (b: Block) => approvals.has(blockKey(b)), [approvals]);
  const isDone = useCallback(
    (b: Block) => b.tasks.every((t) => completions.has(t.id)), [completions]);

  const toggleApproval = useCallback(async (b: Block) => {
    if (!plan || !token) return;
    const key = blockKey(b);
    if (approvals.has(key)) {
      await apiUnapprove(plan.instance_id, b, token);
      setApprovals((m) => { const n = new Map(m); n.delete(key); return n; });
    } else {
      const rec = await apiApprove(plan.instance_id, b, token);
      setApprovals((m) => new Map(m).set(key, rec));
    }
  }, [plan, approvals, token]);

  const toggleDone = useCallback(async (b: Block) => {
    if (!plan || !token) return;
    const currentlyDone = b.tasks.every((t) => completions.has(t.id));
    const next = new Map(completions);
    for (const t of b.tasks) {
      if (currentlyDone) {
        await uncompleteJob(plan.instance_id, t.id, token);
        next.delete(t.id);
      } else {
        next.set(t.id, await completeJob(plan.instance_id, t.id, token));
      }
    }
    setCompletions(next);
  }, [plan, completions, token]);

  const value = useMemo<Ctx>(() => ({
    plan, store, approvals, completions, params, loading, error,
    setParams, reload: () => setTick((t) => t + 1),
    toggleApproval, toggleDone, isApproved, isDone,
  }), [plan, store, approvals, completions, params, loading, error,
    setParams, toggleApproval, toggleDone, isApproved, isDone]);

  return (
    <PlannerContext.Provider value={value}>{children}</PlannerContext.Provider>
  );
}
