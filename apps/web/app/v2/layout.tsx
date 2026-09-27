import type { Metadata } from "next";
import type { ReactNode } from "react";

import Averis2Shell from "./Averis2Shell";

export const metadata: Metadata = {
  title: "Averis 2.0 Preview — Academic Integrity Intelligence",
  description: "Preview shell for the next Averis evidence-first academic review experience.",
};

export default function Averis2Layout({ children }: Readonly<{ children: ReactNode }>) {
  return <Averis2Shell>{children}</Averis2Shell>;
}
