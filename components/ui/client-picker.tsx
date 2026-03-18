'use client';

import { useState, useEffect, useRef } from 'react';
import { Building2, Search } from 'lucide-react';
import { lockScroll, unlockScroll } from '@/lib/utils/scroll-lock';
import { ClientLogo } from '@/components/clients/client-logo';

export interface ClientOption {
  id: string;
  name: string;
  logo_url?: string | null;
  agency?: string | null;
}

// ─── Client picker button (opens bento modal) ───────────────────────────────

export function ClientPickerButton({
  clients,
  value,
  onChange,
  disabled,
  placeholder = 'Select a client',
}: {
  clients: ClientOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = clients.find((c) => c.id === value);

  return (
    <>
      {value && selected ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex w-full items-center gap-2.5 rounded-xl border border-accent2/40 bg-accent2-surface px-4 py-3 text-sm font-medium text-accent2-text hover:bg-accent2-surface transition-colors"
        >
          <Building2 size={16} />
          <span className="flex-1 text-left">{selected.name}</span>
          <svg className="h-3.5 w-3.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => !disabled && setOpen(true)}
          className={`flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/40 hover:border-white/[0.12] hover:text-white/60 transition-colors ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <Building2 size={16} />
          <span className="flex-1 text-left">{placeholder}</span>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {open && (
        <ClientPickerModal
          clients={clients}
          value={value}
          onSelect={(id) => {
            onChange(id);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

// ─── Bento client picker modal ──────────────────────────────────────────────

export function ClientPickerModal({
  clients,
  value,
  onSelect,
  onClose,
}: {
  clients: ClientOption[];
  value: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    lockScroll();
    return () => unlockScroll();
  }, []);

  const filtered = search.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : clients;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-xl border border-white/[0.06] bg-surface shadow-2xl animate-modal-pop-in">
        {/* Header */}
        <div className="p-5 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Select a client</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-white/40 hover:bg-white/[0.06] hover:text-white/60 transition-colors"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full rounded-lg border border-white/10 bg-white/[0.04] pl-9 pr-4 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-accent2/50 focus:outline-none focus:ring-1 focus:ring-accent2/50 transition-colors"
            />
          </div>
        </div>

        {/* Bento grid */}
        <div className="px-5 pb-5 max-h-[50vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Search size={20} className="text-white/30 mb-2" />
              <p className="text-sm text-white/40">No clients match &ldquo;{search}&rdquo;</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filtered.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => onSelect(client.id)}
                  className={`flex items-center gap-2.5 rounded-xl border px-3.5 py-3 text-left text-sm transition-all hover:scale-[1.02] active:scale-[0.98] ${
                    client.id === value
                      ? 'border-accent2/50 bg-accent2-surface text-accent2-text font-medium shadow-[0_0_12px_var(--accent2-surface)]'
                      : 'border-white/[0.06] bg-white/[0.03] text-white/70 hover:border-white/[0.12] hover:bg-white/[0.06]'
                  }`}
                >
                  <ClientLogo src={client.logo_url} name={client.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-white/90">{client.name}</p>
                    {client.agency && (
                      <p className={`text-[9px] font-bold uppercase tracking-wider ${
                        client.agency.toLowerCase().includes('anderson') || client.agency.toLowerCase() === 'ac'
                          ? 'text-emerald-400'
                          : 'text-blue-400'
                      }`}>
                        {client.agency.toLowerCase().includes('anderson') || client.agency.toLowerCase() === 'ac' ? 'Anderson Collaborative' : 'Nativz'}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
