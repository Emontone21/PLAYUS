"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
      className="fixed inset-x-0 bottom-0 z-10 border-t border-superficie bg-fondo pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex w-full max-w-[480px]">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`block py-4 text-center text-base font-extrabold ${
                  active ? "text-oro" : "text-tinta-suave"
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
