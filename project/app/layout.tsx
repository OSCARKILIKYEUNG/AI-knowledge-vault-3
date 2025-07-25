import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AI Knowledge Vault',
  description: 'Your intelligent knowledge management system',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={cn(inter.className, 'min-h-screen bg-background antialiased')}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}