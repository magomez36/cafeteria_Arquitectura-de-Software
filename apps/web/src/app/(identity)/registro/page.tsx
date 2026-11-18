import type { Metadata } from 'next';
import { RegisterScreen } from '../../../features/identity/components/screens';

export const metadata: Metadata = { title: 'Crear cuenta · Cafetería' };

export default function Page() {
  return <RegisterScreen />;
}
