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

  const typeOptions = [
    { value: 'all', label: 'All types' },
    { value: 'client_strategy', label: 'Brand' },
    { value: 'general', label: 'Topic' },
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
          id="filter-type"
          label="Type"
          options={typeOptions}
          value={searchParams.get('type') || 'all'}
          onChange={(e) => updateParam('type', e.target.value)}
        />
      </div>
    </div>
  );
}
