import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Omada Voucher Analytics | Usage Dashboard',
  description: 'Monitor your Omada OC200 voucher usage, traffic consumption, and status in real-time.',
  keywords: 'Omada, OC200, Voucher, Usage, Dashboard, Analytics, TP-Link',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
