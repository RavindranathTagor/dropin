import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree } from "next/font/google";
import "./globals.css";
import { BusyBar } from "@/components/busy-bar";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" });
const body = Figtree({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "Dropin",
  description: "Share one vehicle home. The fare splits as people hold seats.",
  applicationName: "Dropin",
};

export const viewport: Viewport = {
  themeColor: "#FFC107",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable} antialiased`} suppressHydrationWarning>
        <BusyBar />
        {children}
      </body>
    </html>
  );
}
