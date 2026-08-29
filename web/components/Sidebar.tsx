"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, PATH } from "./icons";
import { ThemeToggle } from "./ThemeToggle";
import { usePlanner } from "./PlannerProvider";

const NAV = [
  { href: "/", label: "Calendar", icon: PATH.calendar },
  { href: "/plan", label: "Plan", icon: PATH.list },
  { href: "/approved", label: "Approved", icon: PATH.check },
  { href: "/completed", label: "Completed", icon: PATH.done },
];

export function Sidebar() {
  const path = usePathname();
  const { plan, store, approvals, completions } = usePlanner();

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
    <aside className="side">
      <div className="brand">
        <span className="mark" aria-hidden="true">
          <Icon d={PATH.rail} size={14} />
        </span>
        <b>Block Planner<span>Divisional maintenance · SIH26027</span></b>
      </div>
      <nav aria-label="Views">
        {NAV.map((item) => {
          const b = badge(item.href);
          return (
            <Link key={item.href} href={item.href}
              aria-current={path === item.href ? "page" : undefined}>
              <Icon d={item.icon} size={16} />
              {item.label}
              {b && (
                <span className={"count" + (b.warn ? " warn" : "")}>{b.text}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="side-foot">
        <span className={"store " + (store?.connected ? "on" : "off")}
          title={store?.detail ?? ""}>
          {store?.connected ? "Supabase connected" : "Supabase offline"}
        </span>
        <ThemeToggle />
      </div>
    </aside>
  );
}
