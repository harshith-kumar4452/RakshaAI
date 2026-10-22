"use server";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

const STAFF_ROLES = ["hr_admin", "compliance_officer"];
const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001";

export async function signUpStaff(_, formData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "");
  const orgId = String(formData.get("org_id") || "").trim() || DEFAULT_ORG_ID;

  if (!email || !password || !role) {
    return { error: "Email, password, and role are required.", success: "" };
  }

  if (!STAFF_ROLES.includes(role)) {
    return { error: "Invalid role selected.", success: "" };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters.", success: "" };
  }

  try {
    const serviceClient = createSupabaseServiceRoleClient();

    const { data: createdUser, error: createUserError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        staff_role: role,
      },
    });

    if (createUserError) {
      return {
        error: `Account creation failed: ${createUserError.message}`,
        success: "",
      };
    }

    const userId = createdUser?.user?.id;
    if (!userId) {
      return {
        error: "Account creation failed: missing user id from Supabase admin API.",
        success: "",
      };
    }

    const { error: orgError } = await serviceClient.from("organizations").upsert(
      {
        id: orgId,
        name: "Justra Demo Org",
      },
      {
        onConflict: "id",
      }
    );

    if (orgError) {
      return {
        error: `User created but organization setup failed: ${orgError.message}`,
        success: "",
      };
    }

    const { data: existingRole } = await serviceClient
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", role)
      .maybeSingle();

    if (!existingRole) {
      const { error: insertError } = await serviceClient.from("user_roles").insert({
        id: crypto.randomUUID(),
        user_id: userId,
        org_id: orgId,
        role,
      });

      if (insertError) {
        return {
          error: `User created but role mapping failed: ${insertError.message}`,
          success: "",
        };
      }
    }

    return {
      error: "",
      success:
        "Staff account created and role mapped successfully. No confirmation email required in this demo flow; sign in directly.",
    };
  } catch {
    return {
      error:
        "Staff signup requires service key access. Configure SUPABASE_SERVICE_ROLE_KEY (or service_role) and retry.",
      success: "",
    };
  }
}
