"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/assets", label: "Assets" },
  { href: "/liabilities", label: "Liabilities" },
  { href: "/activity", label: "Activity" },
  { href: "/emergency-fund", label: "Emergency fund" },
  { href: "/goals", label: "Goals" },
  { href: "/personality", label: "Personality" },
  { href: "/briefing", label: "Briefing" },
  { href: "/settings", label: "Settings" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const BRIEFING_GATE =
  "Complete the investor personality quiz to unlock your briefing.";

export function Sidebar({ briefingLocked = false }: { briefingLocked?: boolean }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-16 shrink-0 flex-col border-r border-stone-200 bg-white md:w-56">
      <div className="flex h-14 items-center border-b border-stone-200 px-3 md:px-4">
        <span className="text-sm font-semibold tracking-tight text-teal-900 md:text-base">
          <span className="md:hidden" aria-hidden>
            L
          </span>
          <span className="hidden md:inline">Ledgerly</span>
        </span>
      </div>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 p-2">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          const locked = item.href === "/briefing" && briefingLocked;
          if (locked) {
            return (
              <span
                key={item.href}
                aria-disabled="true"
                aria-label={item.label}
                title={BRIEFING_GATE}
                className="cursor-not-allowed rounded-md px-2 py-2 text-sm text-stone-400 md:px-3"
              >
                <span className="md:hidden" aria-hidden>
                  {item.label.slice(0, 1)}
                </span>
                <span className="hidden md:inline">{item.label}</span>
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={`rounded-md px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 md:px-3 ${
                active
                  ? "bg-teal-50 font-medium text-teal-900"
                  : "text-stone-700 hover:bg-stone-100"
              }`}
            >
              <span className="md:hidden" aria-hidden>
                {item.label.slice(0, 1)}
              </span>
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
