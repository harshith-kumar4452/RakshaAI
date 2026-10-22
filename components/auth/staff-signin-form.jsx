"use client";

import { useActionState } from "react";

import { signInStaff } from "@/app/auth/staff-signin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState = { error: "" };

export function StaffSignInForm({ nextPath = "" }) {
  const [state, action, pending] = useActionState(signInStaff, initialState);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={nextPath} />

      <div className="space-y-2">
        <Label htmlFor="email">Work Email</Label>
        <Input id="email" name="email" type="email" placeholder="hr@organization.com" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" required />
      </div>

      {state?.error ? <p className="text-sm text-red-700">{state.error}</p> : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in..." : "Sign In"}
      </Button>
    </form>
  );
}
