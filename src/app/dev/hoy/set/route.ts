import { NextResponse } from "next/server";
import { FAKE_TODAY_COOKIE, readFakeToday } from "@/lib/api";
import { addDays, isDateString, todayInTz } from "@/lib/time";

export const dynamic = "force-dynamic";

// Solo en desarrollo. Fija la fecha simulada en una cookie y vuelve a /dev/hoy.
//   /dev/hoy/set?fecha=2026-09-25   /dev/hoy/set?adelantar=1   /dev/hoy/set?reset=1
export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") return new NextResponse(null, { status: 404 });
  const url = new URL(req.url);
  const current = (await readFakeToday()) ?? todayInTz("America/Montevideo");
  const fecha = url.searchParams.get("fecha");
  const adelantar = url.searchParams.get("adelantar");
  const reset = url.searchParams.get("reset");

  // el origen se arma con el Host de la petición: Next puede normalizar
  // url.origin a localhost y la cookie quedaría en otro origen (127.0.0.1)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const res = NextResponse.redirect(new URL("/dev/hoy", `${proto}://${host}`));
  if (isDateString(fecha)) res.cookies.set(FAKE_TODAY_COOKIE, fecha, { path: "/", sameSite: "lax" });
  else if (adelantar) res.cookies.set(FAKE_TODAY_COOKIE, addDays(current, Number(adelantar) || 1), { path: "/", sameSite: "lax" });
  else if (reset) res.cookies.set(FAKE_TODAY_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
