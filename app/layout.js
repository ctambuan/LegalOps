// app/layout.js
import "./globals.css";
import { AuthProvider } from "../lib/auth";

export const metadata = {
  title: "Clause Library Workbench",
  description: "Confidential & Legally Privileged — internal use only.",
  robots: "noindex, nofollow",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
