import type { ReactNode } from "react";

import EvidenceNavigator from "./EvidenceNavigator";

export default function RevisionLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <EvidenceNavigator />
    </>
  );
}
