import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { LoginGate } from "@/components/LoginGate";
import { PlannerProvider } from "@/components/PlannerProvider";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Block Planner — SIH26027",
  description:
    "Coordinated maintenance block scheduling for Indian Railways. "
    + "Traffic data is real; maintenance jobs are simulated.",
};

/* Set the theme before first paint. Without this the page renders in the
   default theme and then flips, which reads as a rendering fault. */
const THEME_BOOT = `
try {
  var t = localStorage.getItem('bp-theme');
  if (t) document.documentElement.dataset.theme = t;
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the boot script below sets data-theme on
    // <html> before React hydrates, so the server markup deliberately differs
    // from the client. This is the one case React sanctions suppressing.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&family=Fira+Sans:wght@400;500;600;700&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <AuthProvider>
          <LoginGate>
            <PlannerProvider>
              <div className="shell">
                <Sidebar />
                <main className="content" id="main">{children}</main>
              </div>
            </PlannerProvider>
          </LoginGate>
        </AuthProvider>
      </body>
    </html>
  );
}
