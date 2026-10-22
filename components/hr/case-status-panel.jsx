"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STATUS_STEPS = [
  "submitted",
  "assigned",
  "in_progress",
  "escalated",
  "resolved",
  "closed",
];

const ETA_BY_STATUS = {
  submitted: 1,
  assigned: 2,
  in_progress: 5,
  escalated: 7,
  resolved: 2,
  closed: 0,
};

function displayStatus(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function CaseStatusPanel({ caseId, token, currentStatus, routedTo }) {
  const [liveStatus, setLiveStatus] = useState((currentStatus || "submitted").toLowerCase());
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  const currentIndex = useMemo(
    () => Math.max(0, STATUS_STEPS.indexOf(liveStatus)),
    [liveStatus]
  );

  const etaDays = ETA_BY_STATUS[(STATUS_STEPS[currentIndex + 1] || liveStatus).toLowerCase()] ?? null;
  const nextStatus = STATUS_STEPS[currentIndex + 1] || null;

  async function sendStatusUpdate() {
    setLoading(true);
    setError("");
    setResult("");

    try {
      const response = await fetch(`/api/hr-admin/cases/${caseId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          channel: "sms",
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error || "Failed to send status update.");
      } else {
        if (payload?.status) {
          setLiveStatus(String(payload.status).toLowerCase());
        }
        setResult(payload?.message || "Status sent to user.");
      }
    } catch {
      setError("Failed to send status update.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Case Status</CardTitle>
        <CardDescription>Workflow-driven progress with controlled next-step updates.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Current: {displayStatus(liveStatus)}</Badge>
          {nextStatus ? <Badge variant="secondary">Next: {displayStatus(nextStatus)}</Badge> : null}
          <Badge variant="outline">Routed To: {routedTo || "Pending"}</Badge>
          <Badge>ETA: {etaDays ?? "N/A"} day(s)</Badge>
          <Badge variant="outline">Case: {token || caseId}</Badge>
        </div>

        <div className="space-y-3 rounded-xl border bg-gradient-to-r from-blue-50/70 via-cyan-50/40 to-transparent p-4">
          <p className="text-sm font-medium">Progress</p>
          <div className="grid gap-2 md:grid-cols-6">
            {STATUS_STEPS.map((step, index) => {
              const isDone = index <= currentIndex;
              const isNext = index === currentIndex + 1;
              return (
                <div key={step} className="relative rounded-lg border p-2">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      className={[
                        "h-3 w-3 rounded-full",
                        isDone ? "bg-blue-600" : isNext ? "bg-blue-300" : "bg-slate-300",
                      ].join(" ")}
                    />
                    <p className={[
                      "text-xs font-medium",
                      isDone ? "text-blue-700" : isNext ? "text-slate-700" : "text-muted-foreground",
                    ].join(" ")}>{displayStatus(step)}</p>
                  </div>
                  <div className={[
                    "h-1 rounded-full",
                    isDone ? "bg-blue-500" : isNext ? "bg-blue-200" : "bg-slate-200",
                  ].join(" ")} />
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="case-status-note">Optional Note</Label>
            <Input
              id="case-status-note"
              placeholder="Optional message for audit trail"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={sendStatusUpdate} disabled={loading || !nextStatus}>
            {loading ? "Sending..." : nextStatus ? `Send ${displayStatus(nextStatus)} To User` : "Case Already Closed"}
          </Button>
          {result ? <p className="text-sm text-emerald-600">{result}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
