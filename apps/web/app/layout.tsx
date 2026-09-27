import type { Metadata } from "next";
import "./globals.css";
import "./student-ui-v1.css";
import "./professional-ui-v1.css";
import "./professional-ui-v2.css";
import "./brand-ui-v3.css";
import "./workspace-ui-v4.css";
import "./history-ui-v1.css";
import "./auth-experience-v1.css";
import "./report-evidence-ui-v1.css";
import "./enterprise-ui-v10.css";
import "./browser-quality-v12.css";
import "./print-report.css";
import "./enterprise-rebuild-v14.css";
import "./enterprise-a11y-v14.css";

import AuthExperience from "./AuthExperience";
import CinematicIntroGate from "./CinematicIntroGate";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

const githubPages = process.env.GITHUB_PAGES === "true";
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "averis-ai";
const basePath = githubPages ? `/${repositoryName}` : "";
const brandIcon = `${basePath}/brand/averis-enterprise-symbol.svg`;

export const metadata: Metadata = {
  title: "Averis — Academic Integrity Intelligence",
  description: "Evidence-first similarity, scholarly source, citation and guided revision review for students.",
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
        <CinematicIntroGate />
        {children}
        <AuthExperience />
        <WorkspaceSwitcher />
      </body>
    </html>
  );
}
