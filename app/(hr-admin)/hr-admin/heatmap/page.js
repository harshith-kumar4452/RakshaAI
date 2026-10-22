import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Safety Heatmap | Justra",
};

export default function HrHeatmapPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8">
      <div className="mb-6">
        <Badge variant="outline">HR Admin</Badge>
        <h1 className="mt-3 text-3xl font-semibold">Safety Heatmap</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Department Risk Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72 rounded-lg border border-dashed bg-muted" />
        </CardContent>
      </Card>
    </div>
  );
}
