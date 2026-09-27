import type { Metadata } from "next";
import "./globals.css";
import "./student-ui-v1.css";
import "./professional-ui-v1.css";
import "./print-report.css";

import WorkspaceSwitcher from "./WorkspaceSwitcher";

const githubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "averis-ai";
const basePath = githubPages ? `/${repositoryName}` : "";
const brandIcon = `${basePath}/brand/averis-symbol.png`;

export const metadata: Metadata = {
  title: "Averis — Academic Integrity Intelligence",
  description: "Evidence-first similarity, scholarly source, and citation review for students.",
  applicationName: "Averis",
  icons: {
    icon: brandIcon,
    shortcut: brandIcon,
    apple: brandIcon,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-base-path={basePath || undefined}>
      <body>
        {children}
        <WorkspaceSwitcher />
      </body>
    </html>
  );
}
