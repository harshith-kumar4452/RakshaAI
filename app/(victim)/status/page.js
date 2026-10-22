import { CaseStatus } from "@/components/victim/case-status";

export const metadata = {
  title: "Case Status | Justra",
};

export default async function VictimStatusPage({ searchParams }) {
  const params = await searchParams;
  const caseId = typeof params?.caseId === "string" ? params.caseId : "";

  return <CaseStatus initialCaseId={caseId} />;
}
