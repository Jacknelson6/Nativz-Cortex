'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Select } from '@/components/ui/select';

interface HistoryFiltersProps {
  clients: { id: string; name: string }[];
}

export function HistoryFilters({ clients }: HistoryFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/admin/search/history?${params.toString()}`);
  }

  const clientOptions = [
    { value: 'all', label: 'All clients' },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];

  const statusOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'completed', label: 'Completed' },
    { value: 'processing', label: 'Processing' },
    { value: 'pending', label: 'Pending' },
    { value: 'failed', label: 'Failed' },
  ];

  const approvalOptions = [
    { value: 'all', label: 'All' },
    { value: 'approved', label: 'Sent' },
    { value: 'pending', label: 'Not sent' },
  ];

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-48">
        <Select
          id="filter-client"
          label="Client"
          options={clientOptions}
          value={searchParams.get('client') || 'all'}
          onChange={(e) => updateParam('client', e.target.value)}
        />
      </div>
      <div className="w-40">
        <Select
          id="filter-status"
          label="Status"
          options={statusOptions}
          value={searchParams.get('status') || 'all'}
          onChange={(e) => updateParam('status', e.target.value)}
        />
      </div>
      <div className="w-40">
        <Select
          id="filter-approval"
          label="Approval"
          options={approvalOptions}
          value={searchParams.get('approval') || 'all'}
          onChange={(e) => updateParam('approval', e.target.value)}
        />
      </div>
    </div>
  );
}
