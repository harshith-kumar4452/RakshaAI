import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function formatDate(dateValue) {
  if (!dateValue) return "No date";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return String(dateValue);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function normalizeTimeline(timeline) {
  if (!Array.isArray(timeline)) return [];

  return timeline
    .map((entry, index) => ({
      id: `${entry?.date || "unknown"}-${index}`,
      date: String(entry?.date || "").trim(),
      description: String(entry?.description || "").trim(),
      place: String(entry?.place || "").trim(),
    }))
    .filter((entry) => entry.date || entry.description || entry.place)
    .sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.date ? new Date(b.date).getTime() : Number.POSITIVE_INFINITY;
      return ta - tb;
    });
}

export default function CaseTimeline({ timeline }) {
  const entries = normalizeTimeline(timeline);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Incident Timeline</CardTitle>
        <CardDescription>Chronological view with vertical incident markers.</CardDescription>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No timeline events available.</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, index) => {
              const isLast = index === entries.length - 1;
              return (
                <div key={entry.id} className="flex gap-3">
                  <div className="flex w-12 flex-col items-center">
                    <p className="text-xs font-medium text-muted-foreground">{formatDate(entry.date)}</p>
                    <span className="mt-1 h-3 w-3 rounded-full bg-blue-600" />
                    {!isLast ? <span className="mt-1 h-14 w-0.5 rounded-full bg-blue-300" /> : null}
                  </div>
                  <div className="flex-1 rounded-lg border bg-background/70 p-3">
                    <p className="text-sm font-medium">{entry.description || "No description"}</p>
                    {entry.place ? (
                      <p className="mt-1 text-xs text-muted-foreground">Location: {entry.place}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
