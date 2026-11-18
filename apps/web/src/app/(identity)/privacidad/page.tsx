import type { Metadata } from 'next';
import { PrivacyScreen } from '../../../features/customers/components/screens';

export const metadata: Metadata = { title: 'Política de privacidad · Cafetería' };

export default function Page() {
  return <PrivacyScreen />;
}
