import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aeroprint Cloud Dashboard",
  description: "Monitor and manage your Aeroprint kiosk fleet from anywhere.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
