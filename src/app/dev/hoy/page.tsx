import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { FAKE_TODAY_COOKIE } from "@/lib/api";

export const dynamic = "force-dynamic";

// Solo en desarrollo: simular "el día siguiente" sin tocar el reloj.
// La cookie la fija /dev/hoy/set (un Route Handler: una página no puede
// escribir cookies) y groupToday() la respeta, igual que DEV_FAKE_TODAY.
export default async function DevTodayPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const active = (await cookies()).get(FAKE_TODAY_COOKIE)?.value || process.env.DEV_FAKE_TODAY || null;

  return (
    <main className="flex flex-col gap-4 px-5 py-8">
      <h1 className="text-3xl font-extrabold">fecha simulada (desarrollo)</h1>
      <p className="text-tinta-suave">
        hoy para la app:{" "}
        <span className="font-extrabold text-tinta" data-testid="fake-today">
          {active ?? "real"}
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        <a href="/dev/hoy/set?adelantar=1" className="rounded-md bg-oro px-4 py-2 font-extrabold text-fondo">
          +1 día
        </a>
        <a href="/dev/hoy/set?reset=1" className="rounded-md border-2 border-agua px-4 py-2 font-bold text-agua">
          volver al día real
        </a>
        <Link href="/hoy" className="rounded-md bg-superficie px-4 py-2 font-bold">
          ir a hoy
        </Link>
      </div>
      <p className="text-xs text-tinta-suave">también: /dev/hoy/set?fecha=AAAA-MM-DD</p>
    </main>
  );
}
