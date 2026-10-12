"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Las pestañas del panel. Mobile first: una fila que se desplaza de costado si
// no entra. "juegos" también cubre /admin/jugar (probar).

const TABS = [
  { key: "hoy", href: "/admin", label: "hoy" },
  { key: "grupos", href: "/admin/grupos", label: "grupos" },
  { key: "usuarios", href: "/admin/usuarios", label: "usuarios" },
  { key: "juegos", href: "/admin/juegos", label: "juegos", also: ["/admin/jugar"] },
  { key: "avisos", href: "/admin/avisos", label: "avisos" },
  { key: "registro", href: "/admin/registro", label: "registro" },
] as const;

export function AdminTabs() {
  const pathname = usePathname();
  const isActive = (t: (typeof TABS)[number]) => {
    if (t.href === "/admin") return pathname === "/admin";
    const alsoActive = "also" in t && t.also.some((p) => pathname === p || pathname.startsWith(p + "/"));
    return pathname === t.href || pathname.startsWith(t.href + "/") || alsoActive;
  };
  return (
    <nav aria-label="pestañas del panel" className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="admin-tabs">
      <ul className="flex w-max gap-2 pb-1">
        {TABS.map((t) => {
          const active = isActive(t);
          return (
            <li key={t.key}>
              <Link href={t.href} className={`chip block whitespace-nowrap ${active ? "bg-rana text-contorno" : ""}`} aria-current={active ? "page" : undefined} data-testid={`admin-tab-${t.key}`}>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
