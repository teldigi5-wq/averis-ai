import type { Metadata } from "next";
import "./globals.css";
import "./student-ui-v1.css";
import "./print-report.css";

import WorkspaceSwitcher from "./WorkspaceSwitcher";

export const metadata: Metadata = {
  title: "Averis — Academic Integrity Intelligence",
  description: "Evidence-first similarity, scholarly source, and citation review for students.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <WorkspaceSwitcher />
      </body>
    </html>
  );
}
