import type { Metadata } from "next";
import "./globals.css";
import "./student-ui-v1.css";
import "./professional-ui-v1.css";
import "./print-report.css";

import WorkspaceSwitcher from "./WorkspaceSwitcher";

export const metadata: Metadata = {
  title: "Averis — Academic Integrity Intelligence",
  description: "Evidence-first similarity, scholarly source, and citation review for students.",
  applicationName: "Averis",
  icons: {
    icon: "/brand/averis-symbol.png",
    shortcut: "/brand/averis-symbol.png",
    apple: "/brand/averis-symbol.png",
  },
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
