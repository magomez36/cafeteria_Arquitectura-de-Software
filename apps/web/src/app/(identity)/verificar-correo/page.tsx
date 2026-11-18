import type { Metadata } from 'next';
import { VerifyEmailScreen } from '../../../features/identity/components/screens';

export const metadata: Metadata = { title: 'Confirmar correo · Cafetería' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <VerifyEmailScreen token={token ?? ''} />;
}
