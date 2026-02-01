import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UniShield | The Dark Hook - Agentic Finance",
  description: "Intent-based gasless trading powered by iExec TEE and Uniswap v4 Hooks",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`antialiased`}>
        {children}
      </body>
    </html>
  );
}
