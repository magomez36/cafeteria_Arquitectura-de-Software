import type { Metadata } from 'next';
import { InviteScreen } from '../../../../features/identity/components/screens';

export const metadata: Metadata = { title: 'Invitación al equipo · Cafetería' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return <InviteScreen token={token ?? ''} />;
}
