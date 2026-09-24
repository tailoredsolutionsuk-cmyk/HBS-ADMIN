import type { Metadata } from "next";
import "../../portal/portal.css";
import "../../portal/portal-accessibility.css";

export const metadata: Metadata = {
  title: "Secure sign in | Highline Brand Strategy",
  robots: { index: false, follow: false },
};

export default function AuthCompleteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
