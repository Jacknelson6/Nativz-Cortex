import { redirect } from 'next/navigation';

export default async function AccountingPeriodRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/tools/accounting/${id}`);
}
