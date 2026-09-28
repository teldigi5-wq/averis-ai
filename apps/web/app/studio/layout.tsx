import type { ReactNode } from "react";

import StudioAiRuntimeBridge from "./StudioAiRuntimeBridge";
import StudioCommandCenterV27 from "./StudioCommandCenterV27";
import "./studio-unified-v25.css";
import "./studio-unified-v25-fix.css";
import "./studio-command-center-v27.css";
import "./studio-command-center-v27-fix.css";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="studioV25Scope">
      <StudioAiRuntimeBridge>
        <StudioCommandCenterV27 />
        {children}
      </StudioAiRuntimeBridge>
    </div>
  );
}
