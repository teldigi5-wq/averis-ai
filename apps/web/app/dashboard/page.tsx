import type { Metadata } from "next";

import DashboardProgressSemanticsV36 from "./DashboardProgressSemanticsV36";
import StudentDashboardV36 from "./StudentDashboardV36";

export const metadata: Metadata = {
  title: "Student Dashboard — Averis",
  description: "A local-first overview of assignment workspaces, deadlines, writing progress and academic review tasks.",
};

export default function DashboardPage() {
  return (
    <>
      <DashboardProgressSemanticsV36 />
      <StudentDashboardV36 />
    </>
  );
}
