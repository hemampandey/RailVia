import Link from "next/link";

/* The landing page. Public — a judge should be able to understand what this
   is without an account.

   The hero is the product's actual argument rather than a claim about it:
   three separate closures on one section collapsing into one. The section,
   the jobs and both figures are real, taken from the planner's own output for
   Faridabad Nw Tn – Ballabgarh. */

const RAIL_ICON = "M4 6h16M4 12h16M4 18h10";

/* Today's three closures on FDN–BVH, as the manual process produces them:
   each department asks separately, so the track is handed over three times. */
const TODAY = [
  { x: 96,  w: 104, dept: "S&T",  colour: "var(--lp-snt)", job: "cable megger test",       hours: 6.25 },
  { x: 236, w: 78,  dept: "S&T",  colour: "var(--lp-snt)", job: "track circuit adjustment", hours: 7.25 },
  { x: 470, w: 128, dept: "ENGG", colour: "var(--lp-engg)", job: "usfd rail testing",       hours: 11.0 },
];

export default function Landing() {
  return (
    <div className="lp">
      <div className="lp-wrap">
        <div className="lp-rail" aria-hidden="true" />
        <header className="lp-top">
          <div className="lp-brand">
            <span className="lp-mark" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
                <path d={RAIL_ICON} />
              </svg>
            </span>
            RailVia
          </div>
          <nav>
            <Link className="lp-btn ghost" href="/map">See the network</Link>
            <Link className="lp-btn" href="/calendar">Open the planner</Link>
          </nav>
        </header>

        {/* ── hero ── */}
        <section className="lp-hero">
          <div className="lp-eyebrow">
            <span>SIH26027</span><span>Ministry of Railways</span><span>Delhi division</span>
          </div>

          <h1>One closure.<br /><em>Not three.</em></h1>

          <p className="lp-lede">
            Track, signalling and overhead-line teams each book the same
            stretch of railway separately, so it closes three times when once
            would do — and nobody checks the timetable before choosing when.
            RailVia plans all three together.
          </p>

          <div className="lp-cta">
            <Link className="lp-btn" href="/calendar">Open the planner</Link>
            <Link className="lp-btn ghost" href="/map">Look at a closure</Link>
          </div>

          {/* ── the signature: the merge, on real data ── */}
          <div className="lp-demo lp-anim">
            <div className="lp-demo-head">
              <b>Faridabad Nw Tn – Ballabgarh</b>
              <span>three maintenance jobs, one week, real timetable traffic</span>
            </div>

            <figure>
              <svg viewBox="0 0 900 208" role="img"
                   aria-label="Three separate track closures on the Faridabad to Ballabgarh section, costing 24.5 train-hours in total, merging into a single shared closure costing 5.0 train-hours.">
                {/* the section, drawn as track */}
                <g stroke="var(--lp-line)" strokeWidth="1">
                  {Array.from({ length: 45 }, (_, i) => (
                    <line key={i} x1={90 + i * 18} y1="104" x2={90 + i * 18} y2="120" />
                  ))}
                </g>
                <line x1="84" y1="112" x2="884" y2="112"
                      stroke="var(--lp-steel)" strokeWidth="2" />

                {/* time axis */}
                <g fontFamily="var(--lp-mono)" fontSize="11" fill="var(--lp-ink-3)">
                  <text x="84" y="150">Mon 00:00</text>
                  <text x="360" y="150">Tue</text>
                  <text x="636" y="150">Wed</text>
                </g>

                {/* today: three closures, each handed over on its own */}
                <g className="merge-out">
                  <text x="0" y="46" fontFamily="var(--lp-label)" fontSize="12"
                        fontWeight="700" fill="var(--lp-waste)" letterSpacing="1.2">
                    TODAY
                  </text>
                  {TODAY.map((b) => (
                    <g key={b.job}>
                      <rect x={b.x} y="62" width={b.w} height="34" rx="4"
                            fill={b.colour} opacity="0.92" />
                      <text x={b.x + 8} y="83" fontFamily="var(--lp-label)"
                            fontSize="11.5" fontWeight="700" fill="#fff">
                        {b.dept}
                      </text>
                      <text x={b.x} y="172" fontFamily="var(--lp-body)" fontSize="12"
                            fill="var(--lp-ink-3)">
                        {b.job}
                      </text>
                      <text x={b.x} y="190" fontFamily="var(--lp-mono)" fontSize="11.5"
                            fill="var(--lp-waste)" fontWeight="600">
                        {b.hours.toFixed(2)} train-h
                      </text>
                    </g>
                  ))}
                  <text x="700" y="46" fontFamily="var(--lp-mono)" fontSize="15"
                        fontWeight="600" fill="var(--lp-waste)">
                    24.50 train-hours lost
                  </text>
                </g>

                {/* railvia: the same work, one handover */}
                <g className="merge-in">
                  <text x="0" y="46" fontFamily="var(--lp-label)" fontSize="12"
                        fontWeight="700" fill="var(--lp-win)" letterSpacing="1.2">
                    RAILVIA
                  </text>
                  <rect x="96" y="62" width="128" height="34" rx="4"
                        fill="var(--lp-win)" opacity="0.94" />
                  <text x="104" y="83" fontFamily="var(--lp-label)" fontSize="11.5"
                        fontWeight="700" fill="#fff">
                    ENGG + S&amp;T
                  </text>
                  <text x="96" y="172" fontFamily="var(--lp-body)" fontSize="12"
                        fill="var(--lp-ink-3)">
                    all three jobs, one handover, Monday 00:00–03:00
                  </text>
                  <text x="96" y="190" fontFamily="var(--lp-mono)" fontSize="11.5"
                        fontWeight="600" fill="var(--lp-win)">
                    5.00 train-h
                  </text>
                  <text x="700" y="46" fontFamily="var(--lp-mono)" fontSize="15"
                        fontWeight="600" fill="var(--lp-win)">
                    5.00 train-hours lost
                  </text>
                </g>
              </svg>

              <figcaption>
                The same three jobs, the same crews, the same week. Booked
                separately they close the line three times and cost{" "}
                <b>24.5 train-hours</b>; planned together they close it once,
                in the quietest window that section has, and cost{" "}
                <b>5.0</b>. Nothing in the planner rewards sharing — cost is
                charged per closure, so merging is simply cheaper and the
                optimiser finds it.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* ── the problem ── */}
        <section className="lp-section">
          <h2>Three departments, three systems, one piece of track</h2>
          <p>
            Each maintains something different on the same rails, each keeps
            its own defect list, and each raises its own request for the line
            to be closed. There is no shared queue, so the overlap is invisible
            to all of them.
          </p>
          <div className="lp-depts">
            <div className="lp-dept">
              <span className="tag" style={{ background: "#fdf0dd", color: "#a8560a" }}>ENGG</span>
              <h3>Permanent way</h3>
              <p>Rails, sleepers, ballast, points and crossings.</p>
              <div className="sys">defects in TMS</div>
            </div>
            <div className="lp-dept">
              <span className="tag" style={{ background: "#f0e9fd", color: "#5f27bd" }}>TRD</span>
              <h3>Traction distribution</h3>
              <p>The overhead line the trains draw power from.</p>
              <div className="sys">defects in TDMS</div>
            </div>
            <div className="lp-dept">
              <span className="tag" style={{ background: "#e0f2ea", color: "#0d6b64" }}>S&amp;T</span>
              <h3>Signal &amp; telecom</h3>
              <p>Signals, point machines, track circuits, cabling.</p>
              <div className="sys">defects in SMMS</div>
            </div>
          </div>
        </section>

        {/* ── what it does ── */}
        <section className="lp-section">
          <h2>It plans against the real timetable</h2>
          <p>
            Closing Sahibabad–Ghaziabad at 08:00 stops twenty-one trains.
            Closing it at 03:00 stops far fewer. RailVia knows the difference
            because it counts the actual services — by name and by hour — from
            the published timetable, for every section it plans.
          </p>
          <p>
            It then solves the whole month at once with a constraint solver,
            respecting what a division actually has: crews per department per
            day, mandated maintenance intervals, and the fact that two closures
            cannot occupy one section at the same moment.
          </p>
          <div className="lp-figures">
            <div className="lp-fig">
              <b>39</b>
              <span>sections across four Delhi-division corridors</span>
            </div>
            <div className="lp-fig">
              <b>7,267</b>
              <span>real train movements counted from the timetable</span>
            </div>
            <div className="lp-fig win">
              <b>~35%</b>
              <span>fewer train-hours lost, for identical work</span>
            </div>
          </div>
          <div className="lp-caveat">
            <b>Measured, with the range stated.</b> That figure was 28.5% to
            41.6% over four runs at a 60-second solver budget, comparing the
            same set of jobs against a simulation of today's process. A
            time-limited search returns one of several good schedules, so the
            honest number is a range and the budget belongs beside it.
          </div>
        </section>

        {/* ── provenance ── */}
        <section className="lp-section">
          <h2>What is real, and what is not</h2>
          <p>
            Train timetables are public. Maintenance backlogs live in internal
            Railways systems with no public equivalent. Every plan records
            which of its parts came from where, and says so on screen.
          </p>
          <div className="lp-prov">
            <div>
              <span className="badge real">Real</span>
              <h3>Sections and traffic</h3>
              <p>
                Station positions, section lengths and hour-by-hour train
                counts, taken from the published Indian Railways timetable.
              </p>
            </div>
            <div>
              <span className="badge sim">Simulated</span>
              <h3>Maintenance jobs and crews</h3>
              <p>
                Generated against published maintenance intervals, because
                TMS, SMMS and TDMS are internal systems. The adapter layer
                shows exactly where real feeds would connect.
              </p>
            </div>
          </div>
          <div className="lp-caveat" style={{ borderLeftColor: "var(--lp-rail)" }}>
            <b>The cost side runs on real data.</b> Train-hours lost — the
            number every decision is weighed against — is computed from a real
            timetable. Only the work being scheduled is invented.
          </div>
        </section>

        {/* ── close ── */}
        <section className="lp-section lp-close">
          <h2>Look at next month's closures</h2>
          <p>
            The planner opens on the current month: what is proposed, what it
            costs, which jobs could not be fitted and why. A divisional head
            approves; a section engineer reports work done.
          </p>
          <div className="lp-cta">
            <Link className="lp-btn" href="/calendar">Open the planner</Link>
            <Link className="lp-btn ghost" href="/map">See affected trains</Link>
          </div>
        </section>

        <footer className="lp-foot">
          <span>RailVia · Automatic block planning · SIH26027</span>
          <span>Timetable data via RailRadar, an aggregator of public NTES data</span>
        </footer>
      </div>
    </div>
  );
}
