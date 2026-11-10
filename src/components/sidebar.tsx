"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";

const NAV_PRIMARY = [
  { href: "/", label: "Dashboard" },
  { href: "/update", label: "Update" },
  { href: "/assets", label: "Assets" },
  { href: "/goals", label: "Goals" },
  { href: "/activity", label: "Activity" },
] as const;

const NAV_SECONDARY = [
  { href: "/liabilities", label: "Liabilities" },
  { href: "/emergency-fund", label: "Emergency fund" },
  { href: "/projection", label: "Projection" },
  { href: "/personality", label: "Personality" },
  { href: "/briefing", label: "Briefing" },
  { href: "/settings", label: "Settings" },
] as const;

const NAV = [...NAV_PRIMARY, ...NAV_SECONDARY] as const;

const BRIEFING_GATE =
  "Complete the investor personality quiz to unlock your briefing.";

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ briefingLocked = false }: { briefingLocked?: boolean }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar — md+ */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-stone-200 bg-white">
        <div className="flex h-14 items-center border-b border-stone-200 px-4">
          <span className="text-base font-semibold tracking-tight text-teal-900">
            Ledgerly
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
                  className="cursor-not-allowed rounded-md px-3 py-2 text-sm text-stone-400"
                >
                  {item.label}
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${
                  active
                    ? "bg-teal-50 font-medium text-teal-900"
                    : "text-stone-700 hover:bg-stone-100"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {briefingLocked && (
            <p className="mt-1 px-3 text-xs text-stone-500">{BRIEFING_GATE}</p>
          )}
        </nav>
      </aside>

      {/* Mobile bottom tab bar — < md */}
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 flex border-t border-stone-200 bg-white"
      >
        {NAV_PRIMARY.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700 ${
                active
                  ? "font-semibold text-teal-900"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <span
                className={`h-0.5 w-6 rounded transition-colors ${active ? "bg-teal-700" : "bg-transparent"}`}
              />
              {item.label}
            </Link>
          );
        })}

        {/* More button */}
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          onClick={() => setMoreOpen((o) => !o)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs text-stone-600 hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700"
        >
          <span className="h-0.5 w-6 rounded bg-transparent" />
          More
        </button>

        {/* More drawer */}
        {moreOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-30"
              onClick={() => setMoreOpen(false)}
              aria-hidden="true"
            />
            <div
              role="menu"
              className="absolute bottom-full inset-x-0 z-40 border-t border-stone-200 bg-white shadow-lg"
            >
              {NAV_SECONDARY.map((item) => {
                const active = isActive(pathname, item.href);
                const locked = item.href === "/briefing" && briefingLocked;
                if (locked) {
                  return (
                    <div key={item.href} className="px-4 py-3">
                      <span className="text-sm text-stone-400">{item.label}</span>
                      <p className="mt-0.5 text-xs text-stone-500">{BRIEFING_GATE}</p>
                    </div>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    aria-current={active ? "page" : undefined}
                    onClick={() => setMoreOpen(false)}
                    className={`block px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-700 ${
                      active
                        ? "bg-teal-50 font-semibold text-teal-900"
                        : "text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </nav>
    </>
  );
}
