import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // todo menos estáticos e imágenes
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|screenshots/|~offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
