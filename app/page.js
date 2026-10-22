import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollLoopVideo } from "@/components/landing/scroll-loop-video";

export default function Home() {
  return (
    <div className="w-full flex-1">
      <section className="relative">
        <ScrollLoopVideo />
        <div className="absolute inset-x-0 top-0 z-10 mx-auto flex h-full w-full max-w-6xl items-center justify-center px-4 md:px-8">
          <div className="max-w-3xl space-y-4 rounded-2xl border border-white/40 bg-white/12 p-6 text-center text-white shadow-[0_24px_60px_-35px_rgba(0,0,0,0.8)] backdrop-blur-sm md:p-8">
            <Badge className="mx-auto w-fit border-white/50 bg-white/15 text-white" variant="outline">
              Justra Platform
            </Badge>
            <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
              Anonymous, secure, role-based harassment reporting
            </h1>
            <p className="max-w-2xl text-white/90">
              Create your profile in one step, then continue directly to reporting, HR operations,
              and compliance analytics.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button asChild className="bg-white text-[#0c4a6e] hover:bg-[#ecfeff]">
                <Link href="/auth/signup">Direct Login To Profile</Link>
              </Button>
              <Button asChild variant="outline" className="border-white/60 bg-white/10 text-white hover:bg-white/20">
                <Link href="/auth/staff-signin">Staff Sign In</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-14 md:grid-cols-3 md:px-8">
        <Card className="border-l-4 border-l-[#0f766e]">
          <CardHeader>
            <Badge className="w-fit">Victim</Badge>
            <CardTitle className="mt-3">Anonymous Intake</CardTitle>
            <CardDescription>Phone OTP + token pair identity.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/report">Start Report</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#1d4ed8]">
          <CardHeader>
            <Badge className="w-fit">HR Admin</Badge>
            <CardTitle className="mt-3">Case Lifecycle Control</CardTitle>
            <CardDescription>Review triage, manage evidence, escalate POCSO cases.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" variant="secondary">
              <Link href="/hr-admin/dashboard">Open HR Dashboard</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[#d97706]">
          <CardHeader>
            <Badge className="w-fit">Compliance</Badge>
            <CardTitle className="mt-3">Aggregated Insights</CardTitle>
            <CardDescription>View trends and export statutory compliance reports.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full" variant="outline">
              <Link href="/compliance/dashboard">Open Compliance Dashboard</Link>
            </Button>
          </CardContent>
        </Card>

      </section>
    </div>
  );
}
