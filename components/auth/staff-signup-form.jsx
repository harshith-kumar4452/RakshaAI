"use client";

import { useActionState } from "react";

import { signUpStaff } from "@/app/auth/signup/staff/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState = { error: "", success: "" };

const roleCopy = {
  hr_admin: "HR Admin",
  compliance_officer: "Compliance Officer",
};

export function StaffSignUpForm({ role = "hr_admin" }) {
  const [state, action, pending] = useActionState(signUpStaff, initialState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="org_id" value="00000000-0000-0000-0000-000000000001" />

      <div className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        Creating account for: <span className="font-semibold text-foreground">{roleCopy[role] || role}</span>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Work Email</Label>
        <Input id="email" name="email" type="email" placeholder="staff@organization.com" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" minLength={8} required />
      </div>

      {state?.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state?.success ? <p className="text-sm text-emerald-700">{state.success}</p> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account..." : "Create Staff Account"}
      </Button>
    </form>
  );
}
