import Link from "next/link";

import CaseAssignmentPanel from "@/components/nyaya/CaseAssignmentPanel";
import HrShell from "@/components/hr/hr-shell";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Nyaya Case Assignment | Justra",
};

export default async function NyayaAssignmentPage({ params }) {
  const { id, sessionId } = await params;

  return (
    <HrShell currentPath="/hr-admin/cases" heading="Assign Case To Next Officer">
      <div className="mb-3 flex items-center justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={`/cases/${id}/nyaya/results/${sessionId}`}>Back To Nyaya Result</Link>
        </Button>
      </div>
      <CaseAssignmentPanel
        caseId={id}
        sessionId={sessionId}
        backUrl={`/cases/${id}/nyaya/results/${sessionId}`}
      />
    </HrShell>
  );
}
