import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DemoToastProvider } from "@/contexts/demo-toast-context";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MYI v3",
  description: "Track your Spotify history with style.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} antialiased bg-background text-foreground`}
      >
        <DemoToastProvider>
          {children}
        </DemoToastProvider>
      </body>
    </html>
  );
}
