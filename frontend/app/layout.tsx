import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TravelBuddy",
  description: "Crowd-verified journey planner for Mumbai — locals tell you the truth, we fact-check them.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {/* z-index above Leaflet's controls (1000) so the map never covers the header */}
        <header className="sticky top-0 z-[1100] border-b border-line bg-surface/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-ink" aria-hidden>
                TB
              </span>
              <span className="text-lg">TravelBuddy</span>
            </Link>
            <span className="hidden text-sm text-muted sm:block">Mumbai · crowd-verified routes</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
