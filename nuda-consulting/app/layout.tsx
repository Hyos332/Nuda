import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner"; // 1. Importamos Sonner
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'NUDA | Soluciones Tecnológicas',
  description: 'Ingeniería de software en su esencia. Soluciones tecnológicas minimalistas y potentes.',
  keywords: ['software', 'tecnología', 'consultoría', 'NUDA'],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        
        {/* 2. Configuramos el Toaster estilo "Terminal" */}
        <Toaster 
          theme="dark" 
          position="bottom-right" 
          toastOptions={{
            style: {
              background: '#000',
              color: '#fff',
              border: '1px solid #a31d1d',
              fontFamily: 'var(--font-geist-mono)',
              borderRadius: '0px',
              textTransform: 'uppercase',
              fontSize: '11px',
              letterSpacing: '1px'
            },
            className: 'border-l-4 border-l-[#a31d1d]' // Un acento extra a la izquierda
          }}
        />
      </body>
    </html>
  );
}