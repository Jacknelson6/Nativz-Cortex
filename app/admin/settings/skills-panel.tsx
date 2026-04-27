'use client';

import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionPanel } from '@/components/admin/section-tabs';
import { AISettingsSkillsClient } from './skills-client';

interface ClientOption {
  id: string;
  name: string;
  slug: string;
}

/**
 * Lifts the create-dialog state out of `AISettingsSkillsClient` so the
 * `+ New skill` button can sit in the SectionPanel header (same row as the
 * "Skills" title) instead of stacking below it. Uses SectionPanel rather
 * than IconCard because the body is a list of skill cards — wrapping them
 * in another card would nest cards.
 */
export function AISettingsSkillsPanel({ clients }: { clients: ClientOption[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <SectionPanel
      icon={<Sparkles size={18} />}
      title="Skills"
      helpText="Markdown context loaded into the Nerd's system prompt. Each skill picks which harnesses it applies to — the admin Nerd, admin Strategy Lab, and/or the portal Strategy Lab — and can be scoped to a single client."
      action={
        <Button onClick={() => setCreateOpen(true)}>
          <Plus size={14} /> New skill
        </Button>
      }
    >
      <AISettingsSkillsClient
        clients={clients}
        createOpen={createOpen}
        onCreateOpenChange={setCreateOpen}
      />
    </SectionPanel>
  );
}
