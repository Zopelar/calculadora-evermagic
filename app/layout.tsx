import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Inter, Press_Start_2P } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const pixel = Press_Start_2P({ variable: "--font-press-start", weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Evermagic Prize Pool · calculadora não oficial",
  description: "Quanto cada jogador ganharia se a Season 0 Alpha do Evermagic acabasse agora.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${pixel.variable} antialiased`}>
      <body className="min-h-screen font-sans">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
