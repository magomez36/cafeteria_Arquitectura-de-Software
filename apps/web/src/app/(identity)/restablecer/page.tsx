import type { Metadata } from 'next';
import { ResetScreen } from '../../../features/identity/components/screens';

export const metadata: Metadata = { title: 'Nueva contraseña · Cafetería' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <ResetScreen token={token ?? ''} />;
}
