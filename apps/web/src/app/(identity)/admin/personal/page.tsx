import type { Metadata } from 'next';
import { StaffAdminScreen } from '../../../../features/identity/components/screens';

export const metadata: Metadata = { title: 'Personal · Cafetería' };

export default function Page() {
  return <StaffAdminScreen />;
}
