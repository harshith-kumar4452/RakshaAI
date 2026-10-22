import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Create Profile | Justra",
};

export default function SignUpProfilePage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 md:px-8">
      <div className="mb-8 space-y-3">
        <Badge variant="outline">Onboarding</Badge>
        <h1 className="bg-gradient-to-r from-[#0f766e] via-[#0c4a6e] to-[#1d4ed8] bg-clip-text text-4xl font-semibold tracking-tight text-transparent md:text-5xl">
          Choose your profile
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Victim personas use OTP + token flow. Staff personas use Supabase email/password with
          role mapping in `user_roles`.
        </p>
      </div>

      <section className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-l-4 border-l-[#0f766e]">
          <CardHeader>
            <Badge className="w-fit">victim_anonymous</Badge>
            <CardTitle className="mt-3">Anonymous Victim</CardTitle>
            <CardDescription>No account required. OTP + text-only reporting.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/report">Continue to Report</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#1d4ed8]">
          <CardHeader>
            <Badge className="w-fit" variant="outline">victim_normal</Badge>
            <CardTitle className="mt-3">Verified Victim</CardTitle>
            <CardDescription>OTP flow with Aadhaar verification in subsequent steps.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" variant="secondary">
              <Link href="/report?mode=normal">Continue to Report</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#6366f1]">
          <CardHeader>
            <Badge className="w-fit" variant="outline">hr_admin</Badge>
            <CardTitle className="mt-3">HR Admin</CardTitle>
            <CardDescription>Create a staff account and map HR role.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" variant="outline">
              <Link href="/auth/signup/staff?role=hr_admin">Create HR Account</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#d97706]">
          <CardHeader>
            <Badge className="w-fit" variant="outline">compliance_officer</Badge>
            <CardTitle className="mt-3">Compliance Officer</CardTitle>
            <CardDescription>Create a staff account and map compliance role.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" variant="outline">
              <Link href="/auth/signup/staff?role=compliance_officer">Create Compliance Account</Link>
            </Button>
          </CardContent>
        </Card>

      </section>
    </div>
  );
}
