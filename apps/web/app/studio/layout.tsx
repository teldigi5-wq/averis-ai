import type { ReactNode } from "react";

import StudioAiRuntimeBridge from "./StudioAiRuntimeBridge";
import "./studio-unified-v25.css";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="studioV25Scope">
      <StudioAiRuntimeBridge>{children}</StudioAiRuntimeBridge>
    </div>
  );
}
