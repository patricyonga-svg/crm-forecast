import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Forecast",
  description: "Suivi des affaires et du forecast de l'équipe commerciale",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
