import type { Metadata } from 'next';
import { ForgotScreen } from '../../../features/identity/components/screens';

export const metadata: Metadata = { title: 'Recuperar contraseña · Cafetería' };

export default function Page() {
  return <ForgotScreen />;
}
