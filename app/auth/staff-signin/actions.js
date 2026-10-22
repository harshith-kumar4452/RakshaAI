"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signInStaff(_, formData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const nextPath = String(formData.get("next") || "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  // Mock HR login for demo environments without signup flow.
  if (email.toLowerCase() === "hr@justra.local" && password === "hr123") {
    const cookieStore = await cookies();
    cookieStore.set("justra_mock_hr", "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    redirect("/hr-admin/dashboard");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Unable to load authenticated user after sign-in." };
  }

  const { data: roleRows, error: rolesError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (rolesError) {
    return { error: "Role lookup failed. Please contact system administrator." };
  }

  const roles = (roleRows || []).map((row) => row.role);

  const allowedPaths = ["/hr-admin", "/compliance"];
  const safeNextPath = allowedPaths.some((prefix) => nextPath.startsWith(prefix))
    ? nextPath
    : "";

  if (safeNextPath) {
    if (safeNextPath.startsWith("/hr-admin") && roles.includes("hr_admin")) {
      redirect(safeNextPath);
    }

    if (
      safeNextPath.startsWith("/compliance") &&
      roles.includes("compliance_officer")
    ) {
      redirect(safeNextPath);
    }
  }

  if (roles.includes("hr_admin")) {
    redirect("/hr-admin/dashboard");
  }

  if (roles.includes("compliance_officer")) {
    redirect("/compliance/dashboard");
  }

  return {
    error:
      "No staff role mapped in user_roles for this account. Ask admin to assign hr_admin/compliance_officer.",
  };
}

export async function signOutStaff() {
  const cookieStore = await cookies();
  cookieStore.set("justra_mock_hr", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/auth/staff-signin");
}
