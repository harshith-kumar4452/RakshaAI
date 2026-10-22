import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffSignUpForm } from "@/components/auth/staff-signup-form";

const validRoles = ["hr_admin", "compliance_officer"];

export const metadata = {
  title: "Staff Signup | Justra",
};

export default async function StaffSignUpPage({ searchParams }) {
  const params = await searchParams;
  const requestedRole = typeof params?.role === "string" ? params.role : "hr_admin";
  const role = validRoles.includes(requestedRole) ? requestedRole : "hr_admin";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-16 md:px-8">
      <div className="grid w-full gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <Badge variant="outline">Staff Onboarding</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Create role-based staff account
          </h1>
          <p className="max-w-md text-muted-foreground">
            This creates a Supabase auth user via admin API (no email confirmation needed in demo)
            and maps role in `user_roles` for org `00000000-0000-0000-0000-000000000001`.
          </p>
          <Button asChild variant="ghost">
            <Link href="/auth/signup">Back to all profiles</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Staff Sign Up</CardTitle>
            <CardDescription>Use work email + password for initial provisioning.</CardDescription>
          </CardHeader>
          <CardContent>
            <StaffSignUpForm role={role} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
