// frontend/src/middleware.ts
// Temporarily simplified — auth bypass for UI preview
// When real Supabase is connected, restore the full version

import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Skip auth for login page
  if (request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/overview", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/login"],
};
