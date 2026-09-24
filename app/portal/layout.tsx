import type { Metadata } from "next";
import "./portal-accessibility.css";

export const metadata: Metadata = {
  title: "Client Portal | Highline Brand Strategy",
  description: "Private Highline Brand Strategy client workspace.",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
