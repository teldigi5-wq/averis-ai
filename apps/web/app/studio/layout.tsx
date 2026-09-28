import type { ReactNode } from "react";

import StudioAiRuntimeBridge from "./StudioAiRuntimeBridge";

export default function StudioLayout({ children }: { children: ReactNode }) {
  return <StudioAiRuntimeBridge>{children}</StudioAiRuntimeBridge>;
}
