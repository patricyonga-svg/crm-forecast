import type { Metadata, Viewport } from "next";
import { Fredoka, Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
// Police arrondie du nom « Cerise » : ludique mais sobre.
const fredoka = Fredoka({ subsets: ["latin"], weight: ["600"], variable: "--font-fredoka" });

export const metadata: Metadata = {
  title: "Cerise",
  description: "Suivi des affaires, du forecast et des objectifs de l'équipe commerciale SUSU",
  applicationName: "Cerise",
  appleWebApp: { capable: true, title: "Cerise", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14213d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${inter.variable} ${fredoka.variable}`}>
      <body className="antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
