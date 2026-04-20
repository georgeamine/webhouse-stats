import type { Metadata } from "next";
import "./globals.css";
import { Inter_Tight } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["500", "600", "800", "900"],
});

export const metadata: Metadata = {
  title: "Webhouse OS",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("dark font-sans scrollbar-hide h-full w-full max-w-none", interTight.variable)}>
      <body className="m-0 min-h-dvh w-full min-w-full max-w-none overflow-x-hidden scrollbar-hide box-border">
        <TooltipProvider delay={200}>{children}</TooltipProvider>
      </body>
    </html>
  );
}
