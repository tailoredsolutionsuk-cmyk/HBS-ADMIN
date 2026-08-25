import type { Metadata } from "next";
import "./globals.css";
import "./admin/admin.css";

export const metadata: Metadata = {
  title: "HBS Admin — Website operations",
  description: "Manage websites, clients, deployments, and connected services from one workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

