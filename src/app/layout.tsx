import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { getAppLanguage } from "@/lib/app-locale";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "OrionShop — Wildberries Profit Dashboard",
  description: "Profitability analytics dashboard for Wildberries sellers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={getAppLanguage()} className={inter.variable} suppressHydrationWarning>
      <body className={`${inter.className} bg-background text-foreground antialiased`}>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
