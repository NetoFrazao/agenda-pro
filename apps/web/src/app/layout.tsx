import type { Metadata } from 'next';
import { DM_Sans, Syne } from 'next/font/google';
import { AppProviders } from '@/components/AppProviders';
import './globals.css';

const display = Syne({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['500', '600', '700', '800'],
});

const sans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const siteDescription =
  'Agenda online premium para barbeiros e manicures: link público, lembretes no WhatsApp, sinal PIX e painel completo.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://agendapro.app'),
  title: {
    default: 'Agenda Pro',
    template: '%s · Agenda Pro',
  },
  description: siteDescription,
  applicationName: 'Agenda Pro',
  keywords: [
    'agenda online',
    'barbeiro',
    'manicure',
    'agendamento',
    'WhatsApp',
    'PIX',
  ],
  authors: [{ name: 'Agenda Pro' }],
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Agenda Pro',
    title: 'Agenda Pro',
    description: siteDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Agenda Pro',
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
