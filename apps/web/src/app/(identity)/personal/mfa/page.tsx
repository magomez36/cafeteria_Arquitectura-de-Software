import type { Metadata } from 'next';
import { MfaEnrollScreen } from '../../../../features/identity/components/screens';

export const metadata: Metadata = { title: 'Segundo factor · Cafetería' };

export default function Page() {
  return <MfaEnrollScreen />;
}
