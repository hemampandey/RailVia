"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon, PATH } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { usePlanner } from "./PlannerProvider";
import { useAuth } from "./AuthProvider";
import { ROLE_LABEL } from "@/lib/types";

const NAV = [
  { href: "/", label: "Calendar", icon: PATH.calendar },
  { href: "/plan", label: "Plan", icon: PATH.list },
  { href: "/approved", label: "Approved", icon: PATH.check },
  { href: "/completed", label: "Completed", icon: PATH.done },
];

export function Sidebar() {
  const path = usePathname();
  const { plan, approvals, completions } = usePlanner();
  const { me, session, signOut, error: authError } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--sidebar", collapsed ? "72px" : "236px");
  }, [collapsed]);

  /** Counts on the nav so the sidebar says what needs attention without
   *  making anyone open each view to find out. */
  const badge = (href: string): { text: string; warn?: boolean } | null => {
    if (!plan) return null;
    if (href === "/") return { text: String(plan.block_count) };
    if (href === "/plan") {
      return plan.exceptions.length
        ? { text: String(plan.exceptions.length), warn: true }
        : { text: String(plan.block_count) };
    }
    if (href === "/approved") return { text: String(approvals.size) };
    return { text: String(completions.size) };
  };

  return (
    <aside className={"side" + (collapsed ? " collapsed" : "")}>
      <div className="brand">
        {!collapsed && (
          <div className="brand-main">
            <span className="mark" aria-hidden="true">
              <Icon d={PATH.rail} size={16} />
            </span>
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
