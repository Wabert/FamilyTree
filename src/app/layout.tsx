import type { Metadata, Viewport } from "next";
import { Fraunces, Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Family Reunion",
  description: "Add yourself to the family tree and see how you’re related to everyone.",
};

export const viewport: Viewport = {
  themeColor: "#2f6b4f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="h-full">{children}</body>
    </html>
  );
}
