import type { Metadata } from "next";
import { Fredoka, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Police arrondie du nom « Cerise » : ludique mais sobre.
const fredoka = Fredoka({ subsets: ["latin"], weight: ["600"], variable: "--font-fredoka" });

export const metadata: Metadata = {
  title: "Cerise",
  description: "Suivi des affaires, du forecast et des objectifs de l'équipe commerciale SUSU",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${inter.variable} ${fredoka.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
