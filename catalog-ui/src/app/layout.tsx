import type { Metadata } from "next";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "@/providers/QueryProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Service Catalog | Platform Portal",
  description: "Discover, deploy, and manage application blueprints",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <body className="min-h-screen antialiased">
        <QueryProvider>
          <TooltipProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <main className="flex-1 pl-72">
                <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/20">
                  {children}
                </div>
              </main>
            </div>
          </TooltipProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

