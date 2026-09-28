import type { ReactNode } from "react";

import AssignmentRubricBridgeV33 from "./AssignmentRubricBridgeV33";
import AssignmentStructureBridgeV34 from "./AssignmentStructureBridgeV34";
import StudioAiRuntimeBridge from "./StudioAiRuntimeBridge";
import StudioCommandAccessibilityV29 from "./StudioCommandAccessibilityV29";
import StudioCommandCenterV27 from "./StudioCommandCenterV27";
import StudioPlannerLauncherV29 from "./StudioPlannerLauncherV29";
import StudioReferenceLauncherV30 from "./StudioReferenceLauncherV30";
import StudioReadinessLauncherV31 from "./StudioReadinessLauncherV31";
import StudioDocumentQualityLauncherV32 from "./StudioDocumentQualityLauncherV32";
import StudioRubricCoverageLauncherV33 from "./StudioRubricCoverageLauncherV33";
import StudioStructureCoachLauncherV34 from "./StudioStructureCoachLauncherV34";
import "./studio-unified-v25.css";
import "./studio-unified-v25-fix.css";
import "./studio-command-center-v27.css";
import "./studio-command-center-v27-fix.css";
import "./assignment-intelligence-v28.css";
import "./student-workload-planner-v29.css";
import "./student-workload-planner-v29-fix.css";
import "./citation-reference-assistant-v30.css";
import "./citation-reference-assistant-v30-fix.css";
import "./submission-readiness-center-v31.css";
import "./document-quality-center-v32.css";
import "./rubric-claim-coverage-v33.css";
import "./academic-structure-coach-v34.css";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="studioV25Scope">
      <StudioAiRuntimeBridge>
        <AssignmentRubricBridgeV33 />
        <AssignmentStructureBridgeV34 />
        <StudioCommandCenterV27 />
        <StudioCommandAccessibilityV29 />
        <div className="studioV30UtilityDock" aria-label="Student productivity tools">
          <StudioPlannerLauncherV29 />
          <StudioReferenceLauncherV30 />
          <StudioReadinessLauncherV31 />
          <StudioDocumentQualityLauncherV32 />
          <StudioRubricCoverageLauncherV33 />
          <StudioStructureCoachLauncherV34 />
        </div>
        {children}
      </StudioAiRuntimeBridge>
    </div>
  );
}
