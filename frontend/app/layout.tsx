import type { Metadata } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "CLICKMINT // SYSTEM_READY",
  description: "Base Sepolia terminal — credits, vested CLICK, hourly POT",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${spaceGrotesk.variable} ${inter.variable} min-h-screen bg-black font-body text-on-surface antialiased selection:bg-primary-container selection:text-on-primary-fixed`}
      >
        <Providers>
          {children}
          <Toaster
            theme="dark"
            position="top-center"
            toastOptions={{
              classNames: {
                toast:
                  "rounded-none border border-outline-variant/40 bg-surface-container-low text-primary-fixed font-label text-xs tracking-widest uppercase",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
