import type { Metadata } from 'next';
import { LoginScreen } from '../../../features/identity/components/screens';

export const metadata: Metadata = { title: 'Iniciar sesión · Cafetería' };

export default function Page() {
  return <LoginScreen />;
}
