import type { ReactNode } from "react";

import StudioAiRuntimeBridge from "./StudioAiRuntimeBridge";
import StudioCommandAccessibilityV29 from "./StudioCommandAccessibilityV29";
import StudioCommandCenterV27 from "./StudioCommandCenterV27";
import StudioPlannerLauncherV29 from "./StudioPlannerLauncherV29";
import "./studio-unified-v25.css";
import "./studio-unified-v25-fix.css";
import "./studio-command-center-v27.css";
import "./studio-command-center-v27-fix.css";
import "./assignment-intelligence-v28.css";
import "./student-workload-planner-v29.css";
import "./student-workload-planner-v29-fix.css";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="studioV25Scope">
      <StudioAiRuntimeBridge>
        <StudioCommandCenterV27 />
        <StudioCommandAccessibilityV29 />
        <StudioPlannerLauncherV29 />
        {children}
      </StudioAiRuntimeBridge>
    </div>
  );
}
