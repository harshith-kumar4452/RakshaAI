"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CaseAssignmentPanel({ caseId, sessionId, backUrl }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [payload, setPayload] = useState(null);

  const [selectedAuthority, setSelectedAuthority] = useState("");
  const [escalateTo, setEscalateTo] = useState("");
  const [note, setNote] = useState("");

  const officerOptions = useMemo(() => {
    const fromApi = Array.isArray(payload?.officerOptions) ? payload.officerOptions : [];
    const set = new Set(fromApi.filter(Boolean));
    if (selectedAuthority) set.add(selectedAuthority);
    if (escalateTo) set.add(escalateTo);
    return Array.from(set);
  }, [payload, selectedAuthority, escalateTo]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/nyaya/assignment?caseId=${encodeURIComponent(caseId)}&sessionId=${encodeURIComponent(sessionId)}`);
        const data = await response.json();
        if (!response.ok) {
          setError(data?.error || "Failed to load assignment details.");
          return;
        }
        setPayload(data);
        setSelectedAuthority(data?.assignment?.selected_authority || data?.suggested?.authority || "");
        setEscalateTo(data?.assignment?.escalate_to || data?.suggested?.escalate_to || "");
        setNote(data?.assignment?.note || "");
      } catch {
        setError("Failed to load assignment details.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [caseId, sessionId]);

  const applyAssignment = useCallback(async ({ silent = false } = {}) => {
    if (!selectedAuthority) return;

    if (!silent) {
      setSaving(true);
      setMessage("");
      setError("");
    }

    try {
      const response = await fetch("/api/nyaya/assignment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          sessionId,
          selectedAuthority,
          escalateTo: escalateTo || null,
          note,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || "Failed to save assignment.");
        return;
      }

      setMessage("Assignment synced to case pipeline.");
      setPayload((prev) => ({
        ...(prev || {}),
        current: {
          ...(prev?.current || {}),
          routed_to: selectedAuthority,
          escalated_to: escalateTo || null,
          status: data?.case_status || "assigned",
        },
        assignment: data?.assignment,
      }));
    } catch {
      setError("Failed to save assignment.");
    } finally {
      if (!silent) setSaving(false);
    }
  }, [caseId, sessionId, selectedAuthority, escalateTo, note]);

  useEffect(() => {
    if (!payload) return;
    if (!selectedAuthority) return;

    const timer = setTimeout(() => {
      applyAssignment({ silent: true });
    }, 500);

    return () => clearTimeout(timer);
    // Intentionally autosave authority/escalation changes for live pipeline updates.
  }, [selectedAuthority, escalateTo, payload, applyAssignment]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">Loading assignment workflow...</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Officer Assignment Pipeline</CardTitle>
          <CardDescription>
            AI suggested authority is pre-selected from act routing config. HR can override and changes sync to DB immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
          {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Act Code</p>
              <p className="mt-1 text-sm font-semibold">{payload?.suggested?.act_code || "n/a"}</p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Priority</p>
              <p className="mt-1 text-sm font-semibold">{payload?.suggested?.priority_label || "n/a"}</p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Routed To</p>
              <p className="mt-1 text-sm font-semibold">{payload?.current?.routed_to || "Pending"}</p>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Current Status</p>
              <p className="mt-1 text-sm font-semibold">{payload?.current?.status || "submitted"}</p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Assign To Officer</p>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={selectedAuthority}
              onChange={(event) => setSelectedAuthority(event.target.value)}
            >
              <option value="">Select officer/authority</option>
              {officerOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Escalate To</p>
            <select
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={escalateTo}
              onChange={(event) => setEscalateTo(event.target.value)}
            >
              <option value="">No immediate escalation</option>
              {officerOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">HR Note</p>
            <textarea
              className="min-h-[90px] w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional assignment reason or instruction"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => applyAssignment()} disabled={saving || !selectedAuthority}>
              {saving ? "Saving..." : "Save Assignment Now"}
            </Button>
            {backUrl ? (
              <Button asChild variant="outline">
                <a href={backUrl}>Back</a>
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hierarchy Reference</CardTitle>
          <CardDescription>Configured route levels from act_routing_config for this act.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(Array.isArray(payload?.levels) ? payload.levels : []).map((row, idx) => (
            <div key={`level-${idx}`} className="rounded border bg-muted/20 p-3 text-sm">
              Level {row.level} ({row.priority}) - {row.authority} - {row.days} day(s){row.escalate_to ? ` - escalate to ${row.escalate_to}` : ""}
            </div>
          ))}
          {(!payload?.levels || payload.levels.length === 0) ? (
            <p className="text-sm text-muted-foreground">No hierarchy config found for this case act.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
