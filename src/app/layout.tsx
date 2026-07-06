import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import { EnsureStudentOnAuth } from "@/components/EnsureStudentOnAuth";
import { ConditionalSiteHeader } from "@/components/ConditionalSiteHeader";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Education Copilot",
  description: "Teacher-controlled AI for VCE practice, feedback and classroom insight—built for Victorian schools.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased min-h-screen flex flex-col`}
      >
        <ConditionalSiteHeader />
        <EnsureStudentOnAuth />
        {children}
      </body>
    </html>
  );
}
