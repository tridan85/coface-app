// app/layout.js
import "./globals.css";

export const metadata = {
  title: "Coface – Gestione Appuntamenti",
  description: "Dashboard Coface",
};

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
