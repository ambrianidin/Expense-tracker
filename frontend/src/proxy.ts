import { NextResponse, type NextRequest } from "next/server";




export function proxy(request: NextRequest) {
  if (!request.cookies.has("budgetly_session")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/accounts/:path*",
    "/transactions/:path*",
    "/budgets/:path*",
    "/savings/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/onboarding/:path*",
  ],
};
