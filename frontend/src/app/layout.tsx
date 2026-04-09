import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AEM Train Me — Deloitte AEM Labs",
  description: "AI-powered AEM Architect Trainer for junior developers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="overflow-hidden">{children}</body>
    </html>
  );
}
