"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function priorityVariant(priority) {
  if (priority >= 8) return "destructive";
  if (priority >= 6) return "default";
  if (priority >= 3) return "secondary";
  return "outline";
}

function statusTone(status) {
  switch ((status || "").toLowerCase()) {
    case "escalated":
      return "text-red-600";
    case "in_progress":
      return "text-blue-600";
    case "assigned":
      return "text-amber-600";
    case "resolved":
    case "closed":
      return "text-emerald-600";
    default:
      return "text-muted-foreground";
  }
}

export default function HrDashboardClient({ cases }) {
  const [sortOrder, setSortOrder] = useState("desc");
  const [statusFilter, setStatusFilter] = useState("all");

  const statusOptions = useMemo(() => {
    const values = Array.from(new Set((cases || []).map((row) => String(row.status || "submitted").toLowerCase())));
    const preferredOrder = ["submitted", "assigned", "in_progress", "escalated", "resolved", "closed"];
    values.sort((a, b) => preferredOrder.indexOf(a) - preferredOrder.indexOf(b));
    return values;
  }, [cases]);

  const sortedCases = useMemo(() => {
    const filtered = (cases || []).filter((row) => {
      if (statusFilter === "all") return true;
      return String(row.status || "submitted").toLowerCase() === statusFilter;
    });

    const copy = [...filtered];
    copy.sort((a, b) => {
      const pa = Number(a.priority_score ?? 0);
      const pb = Number(b.priority_score ?? 0);
      return sortOrder === "desc" ? pb - pa : pa - pb;
    });
    return copy;
  }, [cases, sortOrder, statusFilter]);

  const openCount = useMemo(
    () => sortedCases.filter((row) => !["resolved", "closed"].includes((row.status || "").toLowerCase())).length,
    [sortedCases]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-blue-100 shadow-sm">
          <CardHeader>
            <CardTitle>Total Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-blue-700">{sortedCases.length}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-100 shadow-sm">
          <CardHeader>
            <CardTitle>Open Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-blue-700">{openCount}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-blue-100 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Cases by Priority</CardTitle>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-blue-200 bg-white px-2 text-sm text-blue-700"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">All Statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status.replaceAll("_", " ")}
                </option>
              ))}
            </select>

            <Button
              variant="outline"
              className="border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
              onClick={() => setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"))}
            >
              Sort: {sortOrder === "desc" ? "High to Low" : "Low to High"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {sortedCases.map((row) => (
              <div key={row.id} className="rounded-lg border border-blue-100 bg-blue-50/40 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-1">
                    <p className="font-medium">{row.token || row.id}</p>
                    <p className={"text-sm " + statusTone(row.status)}>{row.status || "submitted"}</p>
                    {row.is_anonymous === false ? (
                      <p className="text-xs text-blue-700">Identified user</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={priorityVariant(Number(row.priority_score ?? 0))}>
                      Priority {Number(row.priority_score ?? 0)}
                    </Badge>
                    {row.aadhaar_identity?.is_verified ? (
                      <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-100">Aadhaar Verified</Badge>
                    ) : null}
                    <Button asChild size="sm" variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800">
                      <Link href={`/hr-admin/cases/${row.id}/triad`}>Triad Engine</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800">
                      <Link href={`/cases/${row.id}/nyaya`}>Nyaya Council</Link>
                    </Button>
                    <Button asChild size="sm" className="bg-blue-600 text-white hover:bg-blue-700">
                      <Link href={`/hr-admin/cases/${row.id}`}>Open Case</Link>
                    </Button>
                  </div>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{row.summary || row.description || "No description"}</p>

                {row.aadhaar_identity ? (
                  <div className="mt-3 rounded-md border border-blue-100 bg-white p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Verified Identity
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {row.aadhaar_identity.full_name || row.victim_name || "Name unavailable"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.aadhaar_identity.gender || "-"} | {row.aadhaar_identity.district || "-"}, {row.aadhaar_identity.state || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.aadhaar_identity.aadhaar_masked || "Masked Aadhaar unavailable"}
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
            {!sortedCases.length ? (
              <p className="text-sm text-muted-foreground">No cases found in the cases table.</p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
