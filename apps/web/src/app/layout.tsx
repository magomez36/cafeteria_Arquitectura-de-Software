import type { Metadata } from 'next';
import '@cafeteria/ui/tokens.css';
import './globals.css';

export const metadata: Metadata = { title: 'Cafetería', description: 'Plataforma web de Cafetería' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es"><body>{children}</body></html>;
}
