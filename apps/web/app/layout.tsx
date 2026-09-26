import type { Metadata } from "next";
import "./globals.css";
import "./student-ui-v1.css";

export const metadata: Metadata = {
  title: "Averis — Academic Integrity Intelligence",
  description: "Evidence-first similarity, scholarly source, and citation review for students.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
