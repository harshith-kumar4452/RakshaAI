import { NextResponse } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

async function getUserRoles(supabase, userId) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error || !data) return [];
  return data.map((row) => row.role);
}

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const { response, user, supabase } = await updateSession(request);
  const mockHrCookie = request.cookies.get("justra_mock_hr")?.value === "1";

  const isHrRoute = pathname.startsWith("/hr-admin");

  if (!isHrRoute) {
    return response;
  }

  // Mock HR mode: allow access to HR routes without Supabase auth.
  if (isHrRoute && mockHrCookie) {
    return response;
  }

  if (!user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/staff-signin";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const roles = await getUserRoles(supabase, user.id);
  const isPlatformAdmin = roles.includes("platform_admin");

  if (isHrRoute && !roles.includes("hr_admin") && !isPlatformAdmin) {
    return NextResponse.redirect(new URL("/auth/staff-signin?error=unauthorized", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/hr-admin/:path*"],
};
