"use client";

import { usePlanner } from "./PlannerProvider";

/** Choose which period to plan.
 *
 * Week shows the Monday-to-Sunday week containing the chosen month's first
 * day; Month shows the whole calendar month, using its real length rather
 * than a flat 30 — February is not 30 days, and a plan that runs past the end
 * of the month it claims to cover is just wrong.
 */
const MONTHS_AHEAD = 9;
const MONTHS_BACK = 2;

const monthLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { month: "long", year: "numeric" });

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Monday of the week containing `d` (Monday-first weeks). */
function mondayOf(d: Date): Date {
  const out = new Date(d);
  out.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return out;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-`
  + `${String(d.getDate()).padStart(2, "0")}`;

export function PeriodPicker() {
  const { params, setParams, plan } = usePlanner();

  const current = plan
    ? new Date(plan.horizon_start + "T00:00:00")
    : new Date();
  const anchor = new Date(current.getFullYear(), current.getMonth(), 1);

  const options: Date[] = [];
  const base = new Date();
  base.setDate(1);
  for (let i = -MONTHS_BACK; i <= MONTHS_AHEAD; i++) {
    options.push(new Date(base.getFullYear(), base.getMonth() + i, 1));
  }

  const apply = (first: Date, mode: "week" | "month") => {
    if (mode === "month") {
      setParams({
        horizonStart: iso(first),
        days: daysInMonth(first.getFullYear(), first.getMonth()),
      });
    } else {
      // Snap to a Monday: the calendar grid is Monday-first, and a week that
      // starts mid-row reads as an off-by-one.
      setParams({ horizonStart: iso(mondayOf(first)), days: 7 });
    }
  };

  const mode: "week" | "month" = params.days === 7 ? "week" : "month";
  const shift = (by: number) => {
    const next = new Date(anchor.getFullYear(), anchor.getMonth() + by, 1);
    apply(mode === "week" && by !== 0 ? next : next, mode);
  };

  return (
    <div className="period">
      <button type="button" className="step" onClick={() => shift(-1)}
        aria-label="Previous month">‹</button>

      <label className="vh" htmlFor="month">Month</label>
      <select id="month" value={iso(anchor)}
        onChange={(e) => apply(new Date(e.target.value + "T00:00:00"), mode)}>
        {options.map((d) => (
          <option key={iso(d)} value={iso(d)}>{monthLabel(d)}</option>
        ))}
      </select>

      <button type="button" className="step" onClick={() => shift(1)}
        aria-label="Next month">›</button>

      <div className="seg">
        {(["week", "month"] as const).map((m) => (
          <button key={m} type="button" aria-pressed={mode === m}
            onClick={() => apply(anchor, m)}>
            {m === "week" ? "Week" : "Month"}
          </button>
        ))}
      </div>
    </div>
  );
}
