import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffSignInForm } from "@/components/auth/staff-signin-form";

export default async function StaffSignInPage({ searchParams }) {
  const params = await searchParams;
  const nextPath = typeof params?.next === "string" ? params.next : "";
  const error = params?.error;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 items-center px-4 py-16 md:px-8">
      <div className="grid w-full gap-8 md:grid-cols-2">
        <div className="space-y-4">
          <Badge variant="outline">Justra Staff Access</Badge>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Secure role-based access for HR and Compliance teams
          </h1>
          <p className="max-w-md text-muted-foreground">
            Staff authentication uses Supabase Auth. Role authorization is enforced from the
            `user_roles` table at middleware and RLS levels.
          </p>
          <p className="max-w-md rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Mock HR login for demo: hr@justra.local / hr123
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Staff Sign In</CardTitle>
            <CardDescription>Email + Password (MFA can be enabled in Supabase Auth)</CardDescription>
          </CardHeader>
          <CardContent>
            {error === "unauthorized" ? (
              <p className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
                You do not have permission to access that route.
              </p>
            ) : null}
            <StaffSignInForm nextPath={nextPath} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
