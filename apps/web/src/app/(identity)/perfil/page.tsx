import type { Metadata } from 'next';
import { ProfileScreen } from '../../../features/customers/components/screens';

export const metadata: Metadata = { title: 'Mi perfil · Cafetería' };

export default function Page() {
  return <ProfileScreen />;
}
