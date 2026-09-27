"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LilyTab } from "@/components/lily";

const TABS = [
  { href: "/hoy", label: "hoy" },
  { href: "/grupo", label: "grupo" },
  { href: "/perfil", label: "perfil" },
] as const;

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="secciones"
      className="fixed inset-x-0 bottom-0 z-10 bg-barra pb-[env(safe-area-inset-bottom)]"
      style={{ borderTop: "3px solid var(--contorno)" }}
    >
      <ul className="mx-auto flex w-full max-w-[480px]">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 pb-4 pt-2 text-center text-base ${
                  active ? "display text-rana" : "display-bold text-tinta-suave"
                }`}
              >
                <span className="h-3">{active ? <LilyTab /> : null}</span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
