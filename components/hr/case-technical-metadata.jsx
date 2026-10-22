"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CaseTechnicalMetadata({ entries }) {
  const [showTechnical, setShowTechnical] = useState(false);

  if (!entries?.length) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Technical Fields</CardTitle>
          <CardDescription>Low-level fields from cases table.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowTechnical((prev) => !prev)}>
          {showTechnical ? "Hide" : "Show"}
        </Button>
      </CardHeader>
      {showTechnical ? (
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {entries.map((entry) => (
              <div key={entry.key} className="rounded-md border bg-background/70 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{entry.key}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm font-medium">{entry.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
