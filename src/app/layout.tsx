import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compras AG – Licitaciones",
  description: "Licitaciones de materia prima y Torre de Compras – Grupo AG",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
