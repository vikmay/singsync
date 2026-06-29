import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import SwRegister from '@/components/SwRegister';

const inter = Inter({ subsets: ['latin'] });

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
        <html lang="en" className="dark">
            <head>
                <link rel="manifest" href="/manifest.json" />
            </head>
            <body className={inter.className}>
                <SwRegister />
                {children}
            </body>
        </html>
    );
}
