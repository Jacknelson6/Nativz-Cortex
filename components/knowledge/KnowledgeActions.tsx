'use client';

import { useState } from 'react';
import { Loader2, Brain, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface KnowledgeActionsProps {
  clientId: string;
  hasWebsite: boolean;
}

export function KnowledgeActions({ clientId, hasWebsite }: KnowledgeActionsProps) {
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [scraping, setScraping] = useState(false);

  async function handleGenerateBrandProfile() {
    setGeneratingProfile(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/knowledge/brand-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to generate brand profile.');
        return;
      }
      toast.success('Brand profile generated successfully.');
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setGeneratingProfile(false);
    }
  }

  async function handleScrapeWebsite() {
    setScraping(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/knowledge/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to scrape website.');
        return;
      }
      toast.success('Website scraped successfully.');
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setScraping(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={handleGenerateBrandProfile}
        disabled={generatingProfile}
      >
        {generatingProfile ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
        {generatingProfile ? 'Generating...' : 'Generate brand profile'}
      </Button>
      {hasWebsite && (
        <Button
          size="sm"
          variant="outline"
          onClick={handleScrapeWebsite}
          disabled={scraping}
        >
          {scraping ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
          {scraping ? 'Scraping...' : 'Scrape website'}
        </Button>
      )}
    </div>
  );
}
