'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Building2, X } from 'lucide-react';

interface ClientSelectorProps {
  value: string | null;
  onChange: (clientId: string | null) => void;
}

interface ClientOption {
  id: string;
  name: string;
}

export function ClientSelector({ value, onChange }: ClientSelectorProps) {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function fetchClients() {
      const supabase = createClient();
      const { data } = await supabase
        .from('clients')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (data) setClients(data);
    }
    fetchClients();
  }, []);

  const selected = clients.find((c) => c.id === value);

  if (clients.length === 0) return null;

  return (
    <div className="relative">
      {value && selected ? (
        <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-surface px-3 py-1.5 text-xs font-medium text-accent-text">
          <Building2 size={12} />
          {selected.name}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="ml-0.5 rounded-full p-0.5 hover:bg-accent/20 transition-colors"
          >
            <X size={10} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-nativz-border px-3 py-1.5 text-xs text-text-muted hover:border-text-muted hover:text-text-secondary transition-colors"
        >
          <Building2 size={12} />
          Attach to client
        </button>
      )}

      {open && !value && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded-lg border border-nativz-border bg-surface py-1 shadow-dropdown animate-fade-in">
          {clients.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => {
                onChange(client.id);
                setOpen(false);
              }}
              className="block w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-hover transition-colors"
            >
              {client.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
