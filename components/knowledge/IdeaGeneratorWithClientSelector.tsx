'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { ClientSelector } from '@/components/search/client-selector';
import { IdeaGenerator } from './IdeaGenerator';

interface Client {
  id: string;
  name: string;
}

interface IdeaGeneratorWithClientSelectorProps {
  clients: Client[];
}

export function IdeaGeneratorWithClientSelector({ clients }: IdeaGeneratorWithClientSelectorProps) {
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  return (
    <div className="space-y-6">
      {/* Header + client selector */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-surface">
            <Sparkles size={20} className="text-accent-text" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Idea generator</h1>
            <p className="text-sm text-text-secondary">
              Generate AI-powered video ideas from brand context and research
            </p>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-nativz-border p-4">
          <label className="block text-sm font-medium text-text-secondary mb-2">
            Select a client
          </label>
          <ClientSelector
            value={selectedClientId}
            onChange={setSelectedClientId}
          />
        </div>
      </div>

      {/* Idea generator or empty state */}
      {selectedClient ? (
        <IdeaGenerator clientId={selectedClient.id} clientName={selectedClient.name} />
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface border border-nativz-border mb-4">
            <Sparkles size={24} className="text-text-muted" />
          </div>
          <p className="text-sm text-text-muted">
            Select a client above to start generating ideas
          </p>
        </div>
      )}
    </div>
  );
}
