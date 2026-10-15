import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Opcjonalna ochrona hasłem (HTTP Basic). Włącza się ustawieniem APP_PASSWORD
 * (i opcjonalnie APP_USER, domyślnie "got"). Bez zmiennej aplikacja jest otwarta.
 */
export function proxy(request: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();
  const user = process.env.APP_USER ?? "got";
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const [u, ...rest] = atob(header.slice(6)).split(":");
      if (u === user && rest.join(":") === password) return NextResponse.next();
    } catch {
      /* niepoprawny nagłówek */
    }
  }
  return new NextResponse("Wymagane logowanie", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="GOT PTTK Tracker", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|sw.js).*)"],
};
