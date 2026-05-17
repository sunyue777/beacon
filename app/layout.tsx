import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentAccount } from "@/lib/auth/server-session";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap"
});

const fraunces = Fraunces({
  subsets: ["latin"],
  // Variable font: omit `weight` so next/font loads the variable cut (any weight,
  // optical sizing, SOFT/WONK axes available via font-variation-settings).
  style: ["normal", "italic"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
  display: "swap"
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Dyna Beacon",
  description: "Wealth RM copilot demo platform for Dyna.AI"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const account = await getCurrentAccount();
  const fontVariables = `${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable}`;
  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <body>
        <AppShell role={account.role}>{children}</AppShell>
      </body>
    </html>
  );
}
