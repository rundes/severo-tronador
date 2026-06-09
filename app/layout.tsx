import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
  title: "Severo Tronador",
  description:
    "Contactación segmentada multicanal con propósito investigativo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Vercel Web Analytics + Speed Insights: recogen page views por ruta
            (incluidas /e/[slug] y /encuesta/[token]) y Web Vitals. Solo emiten
            datos en deploys de Vercel; en local/otros hosts no-opean. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
