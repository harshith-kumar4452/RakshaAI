"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function titleCaseStatus(value) {
  return String(value || "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

export function CaseStatus({ initialCaseId = "" }) {
  const [caseId, setCaseId] = useState(initialCaseId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [caseData, setCaseData] = useState(null);

  const fetchStatus = useCallback(async (idValue, showLoader = true) => {
    const token = String(idValue || "").trim();
    if (!token) {
      setError("Please enter your Case ID");
      return;
    }

    if (showLoader) {
      setLoading(true);
    }
    setError("");

    try {
      const response = await fetch(
        `/api/complaints/status?caseId=${encodeURIComponent(token)}`
      );
      const data = await response.json();

      if (!response.ok) {
        setCaseData(null);
        setError(data.error || "Unable to fetch case status");
        return;
      }

      setCaseData(data.case);
    } catch (fetchError) {
      console.error(fetchError);
      setCaseData(null);
      setError("Network error while fetching status");
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, []);

  async function handleCheckStatus() {
    await fetchStatus(caseId, true);
  }

  useEffect(() => {
    if (!caseData?.caseId) return;

    const timer = setInterval(() => {
      fetchStatus(caseData.caseId, false);
    }, 10000);

    return () => clearInterval(timer);
  }, [caseData?.caseId, fetchStatus]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 md:px-8">
      <Card className="border-blue-100 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="w-fit border-blue-200 bg-blue-50 text-blue-700">
            Case Dashboard
          </Badge>
          <CardTitle className="mt-3">Track Case Status</CardTitle>
          <CardDescription>
            Enter your Case ID to continue tracking your report.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="public-token">Case ID</Label>
            <Input
              id="public-token"
              placeholder="JUST-4829"
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
            />
          </div>

          <Button className="w-full bg-blue-600 text-white hover:bg-blue-700" onClick={handleCheckStatus} disabled={loading}>
            {loading ? "Loading..." : "View Status"}
          </Button>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          {caseData ? (
            <div className="space-y-4 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
              <div>
                <p className="text-xs text-muted-foreground">Case ID</p>
                <p className="font-mono text-sm font-semibold">{caseData.caseId}</p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">Current: {titleCaseStatus(caseData.status)}</Badge>
                {caseData.nextStatus ? (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Next: {titleCaseStatus(caseData.nextStatus)}</Badge>
                ) : null}
                {caseData.routedTo ? <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">Routed To: {caseData.routedTo}</Badge> : null}
                {typeof caseData.etaDays === "number" ? (
                  <Badge className="bg-blue-600 text-white hover:bg-blue-600">Est. {caseData.etaDays} day(s)</Badge>
                ) : null}
              </div>

              {Array.isArray(caseData.workflow) && caseData.workflow.length > 0 ? (
                <div className="space-y-2 rounded-lg border border-blue-100 bg-background/90 p-3">
                  <p className="text-xs text-muted-foreground">Status Progress</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {caseData.workflow.map((step, index) => {
                      const currentIndex = caseData.workflow.findIndex((s) => s.status === caseData.status);
                      const isDone = index <= currentIndex;
                      return (
                        <div key={step.status} className="flex items-center gap-2">
                          <span
                            className={[
                              "rounded-full px-3 py-1 text-xs",
                              isDone ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500",
                            ].join(" ")}
                          >
                            {step.label || titleCaseStatus(step.status)}
                          </span>
                          {index < caseData.workflow.length - 1 ? (
                            <span className="text-muted-foreground">|</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {!caseData.isAnonymous && caseData.identifiedProfile ? (
                <div className="space-y-2 rounded-lg border border-blue-100 bg-background/90 p-3">
                  <p className="text-xs text-muted-foreground">Identified User Details</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Full Name</p>
                      <p className="text-sm font-medium">{caseData.identifiedProfile.full_name}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="text-sm font-medium">{caseData.identifiedProfile.gender || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">DOB</p>
                      <p className="text-sm font-medium">
                        {caseData.identifiedProfile.date_of_birth || caseData.identifiedProfile.year_of_birth || "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Aadhaar</p>
                      <p className="text-sm font-medium">{caseData.identifiedProfile.aadhaar_masked || "-"}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-xs text-muted-foreground">Address</p>
                      <p className="text-sm font-medium">
                        {[
                          caseData.identifiedProfile.address_line,
                          caseData.identifiedProfile.district,
                          caseData.identifiedProfile.state,
                          caseData.identifiedProfile.pincode,
                        ]
                          .filter(Boolean)
                          .join(", ") || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {caseData.victimName || caseData.victimRole ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {caseData.victimName ? (
                    <div>
                      <p className="text-xs text-muted-foreground">Victim Name</p>
                      <p className="text-sm">{caseData.victimName}</p>
                    </div>
                  ) : null}
                  {caseData.victimRole ? (
                    <div>
                      <p className="text-xs text-muted-foreground">Victim Role</p>
                      <p className="text-sm">{caseData.victimRole}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div>
                <p className="text-xs text-muted-foreground">Current Status</p>
                <p className="text-sm font-semibold">{titleCaseStatus(caseData.status)}</p>
              </div>

              {caseData.summary ? (
                <div>
                  <p className="text-xs text-muted-foreground">Summary</p>
                  <p className="text-sm">{caseData.summary}</p>
                </div>
              ) : null}

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="text-sm">{formatDateTime(caseData.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Updated</p>
                  <p className="text-sm">{formatDateTime(caseData.updatedAt)}</p>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
