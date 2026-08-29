"use client";

import { usePlanner } from "./PlannerProvider";

export const Fact = ({ value, label, tone }: {
  value: string; label: string; tone?: "win" | "warn";
}) => (
  <div className={"fact" + (tone ? " " + tone : "")}>
    <b>{value}</b><span>{label}</span>
  </div>
);

export function HorizonToggle() {
  const { params, setDays } = usePlanner();
  return (
    <div className="seg">
      {[[7, "Week"], [30, "Month"]].map(([days, label]) => (
        <button key={String(days)} type="button"
          aria-pressed={params.days === days}
          onClick={() => setDays(days as number)}>{label}</button>
      ))}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <>
      <div className="status"><div className="spin" />{what}</div>
      {[0, 1, 2].map((i) => <div className="sk" key={i} />)}
    </>
  );
}

export function SetupBanner() {
  const { store } = usePlanner();
  return (
    <div className="setup">
      <h3>Supabase is not connected</h3>
      <div className="note">
        Approvals and completions are stored in Supabase only — there is no
        local fallback, so two planners can never approve different things
        without finding out. To switch it on:
      </div>
      <pre>{`1. Create a project at supabase.com
2. Run src/store/schema.sql in the SQL editor
3. Add to .env in the repo root:
     SUPABASE_URL=https://<project>.supabase.co
     SUPABASE_KEY=<anon key>
4. Restart the FastAPI server`}</pre>
      {store?.detail && <div className="note">{store.detail}</div>}
    </div>
  );
}
