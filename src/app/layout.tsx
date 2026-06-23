import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
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
    <html lang="ru">
      <body className={`${inter.variable} font-sans`}>
        <DashboardLayout>{children}</DashboardLayout>
      </body>
    </html>
  );
}
