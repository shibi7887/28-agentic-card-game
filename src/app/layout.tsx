import type { Metadata } from "next";
import { Cinzel, Playfair_Display, Jost } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-cinzel",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-playfair",
  display: "swap",
});

const jost = Jost({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jost",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Thuruppu — Twenty-Eight Card Game",
  description: "Play the classic Kerala card game Twenty-eight (Irupathiyettu) against AI opponents",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${playfair.variable} ${jost.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
