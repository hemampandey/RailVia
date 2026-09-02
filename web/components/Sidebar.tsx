"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon, PATH } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { usePlanner } from "./PlannerProvider";
import { useAuth } from "./AuthProvider";
import { ROLE_LABEL, DIVISIONS } from "@/lib/types";
import { getReports } from "@/lib/api";

/* Intake first: a defect exists before a plan for it does. */
const NAV = [
  { href: "/report", label: "Raise a job", icon: PATH.flag },
  { href: "/calendar", label: "Calendar", icon: PATH.calendar },
  { href: "/plan", label: "Plan", icon: PATH.list },
  { href: "/map", label: "Map", icon: PATH.map },
  { href: "/approved", label: "Approved", icon: PATH.check },
  { href: "/completed", label: "Completed", icon: PATH.done },
];

export function Sidebar() {
  const path = usePathname();
  const { plan, approvals, completions, division, setDivision } = usePlanner();
  const { me, session, signOut, error: authError } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [openReports, setOpenReports] = useState(0);

  /* Reports waiting on the head. Fetched here rather than in the intake page
     so the badge is visible from every view — an emergency defect nobody has
     looked at is exactly the thing that must not need a click to discover. */
  useEffect(() => {
    const token = session?.access_token;
    if (!token) { setOpenReports(0); return; }
    let live = true;
    getReports(token)
      .then((r) => { if (live) setOpenReports(r.reports.filter((x) => x.status === "open").length); })
      .catch(() => { /* the intake page reports the reason */ });
    return () => { live = false; };
  }, [session?.access_token]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--sidebar", collapsed ? "72px" : "236px");
  }, [collapsed]);

  /** Counts on the nav so the sidebar says what needs attention without
   *  making anyone open each view to find out. */
  const badge = (href: string): { text: string; warn?: boolean } | null => {
    // Checked before the plan guard: a waiting report matters whether or
    // not a plan has finished loading.
    if (href === "/report") {
      return openReports ? { text: String(openReports), warn: true } : null;
    }
    if (!plan) return null;
    if (href === "/calendar") return { text: String(plan.block_count) };
    if (href === "/plan") {
      return plan.exceptions.length
        ? { text: String(plan.exceptions.length), warn: true }
        : { text: String(plan.block_count) };
    }
    if (href === "/map") {
      return { text: String(new Set(plan.blocks.map((b) => b.section_id)).size) };
    }
    if (href === "/approved") return { text: String(approvals.size) };
    return { text: String(completions.size) };
  };

  return (
    <aside className={"side" + (collapsed ? " collapsed" : "")}>
      <div className="brand">
        {!collapsed && (
          <div className="brand-main">
            <div>
              <b>RailVia</b>
            </div>
          </div>
        )}
        <button
          type="button"
          className="collapse-toggle"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
        </button>
      </div>

      {/* Division Selector */}
      {!collapsed ? (
        <div className="division-picker">
          <div className="division-picker-label">
            <span className="dot-indicator" />
            <span>Division</span>
          </div>
          <div className="division-select-wrap">
            <select
              value={division.id}
              onChange={(e) => {
                const found = DIVISIONS.find((d) => d.id === e.target.value);
                if (found) setDivision(found);
              }}
              className="division-select"
              aria-label="Select Railway Division"
            >
              {DIVISIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.id})
                </option>
              ))}
            </select>
            <div className="division-select-arrow" aria-hidden="true">▾</div>
          </div>
          <div className="division-zone-info">
            <span>{division.zone}</span>
          </div>
        </div>
      ) : (
        <div
          className="division-collapsed-chip"
          title={`${division.name} (${division.id}) · ${division.zone}`}
        >
          {division.id}
        </div>
      )}

      <nav aria-label="Views">
        {NAV.map((item) => {
          const b = badge(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={path === item.href ? "page" : undefined}
              title={collapsed ? item.label : undefined}
            >
              <Icon d={item.icon} size={16} />
              {!collapsed && <span className="nav-label">{item.label}</span>}
              {b && (
                <span className={"count" + (b.warn ? " warn" : "")}>{b.text}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="side-foot">
        {!collapsed && session && (
          <div className="who">
            <b>{me?.email ?? session.user.email}</b>
            <span className={"role" + (me?.role === "engineer" ? " eng" : "")
              + (me ? "" : " unknown")}
              title={me ? undefined : authError ?? "waiting for the API"}>
              {me ? ROLE_LABEL[me.role] : "role unknown"}
            </span>
          </div>
        )}
        {!collapsed && <ThemeToggle />}
        {!collapsed && session && (
          <button className="theme-btn" type="button" onClick={signOut}>
            Sign out
          </button>
        )}
      </div>
    </aside>
  );
}
