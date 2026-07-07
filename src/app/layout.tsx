import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import SwRegister from '@/components/SwRegister';
import GlobalWakeLock from '@/components/GlobalWakeLock';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
};

export const metadata: Metadata = {
    title: 'SingSync',
    description: 'Спільний перегляд текстів пісень з синхронним скролом.',
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className="dark overflow-x-clip">
            <head>
                <link rel="manifest" href="/manifest.json" />
            </head>
            <body className={`${inter.className} overflow-x-clip w-full`}>
                <SwRegister />
                <GlobalWakeLock />
                {children}
            </body>
        </html>
    );
}
