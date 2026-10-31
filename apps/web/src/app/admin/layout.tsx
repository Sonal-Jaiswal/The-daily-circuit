import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Newsroom dashboard", template: "%s | Newsroom dashboard" },
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-paper">{children}</div>;
}
