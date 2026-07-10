import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Growthomic — AI Sales Agent",
  description: "AI-powered sales agent dashboard for Facebook, Instagram, and WhatsApp",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: "100%" }}>
      <body style={{ height: "100%", overflow: "hidden" }}>
        {children}
        <Toaster position="top-center" theme="dark" richColors />
      </body>
    </html>
  );
}
