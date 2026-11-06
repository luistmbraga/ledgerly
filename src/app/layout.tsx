import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import { getInvestorProfile } from "@/db/repositories/personality";
import "./globals.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Ledgerly",
  description: "Single-user personal finance",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        <div className="flex min-h-screen">
          <Sidebar briefingLocked={!getInvestorProfile()} />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </body>
    </html>
  );
}
