import type { ReactNode } from 'react';
import '../../features/identity/identity.css';

export default function IdentityLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main id="contenido" className="id-page">
      {children}
    </main>
  );
}
