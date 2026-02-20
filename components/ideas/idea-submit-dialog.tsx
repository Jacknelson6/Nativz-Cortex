'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Send } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface IdeaSubmitDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: string;
  onSubmitted: () => void;
}

const CATEGORY_OPTIONS = [
  { value: 'trending', label: 'Trending thing I saw' },
  { value: 'content_idea', label: 'Content idea' },
  { value: 'request', label: 'Request for the team' },
  { value: 'other', label: 'Other' },
];

export function IdeaSubmitDialog({ open, onClose, clientId, onSubmitted }: IdeaSubmitDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [category, setCategory] = useState('content_idea');
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setTitle('');
    setDescription('');
    setSourceUrl('');
    setCategory('content_idea');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Give your idea a title.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          title: title.trim(),
          description: description.trim() || null,
          source_url: sourceUrl.trim() || null,
          category,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to submit idea.');
        return;
      }

      toast.success('Idea submitted! Your team will review it.');
      resetForm();
      onClose();
      onSubmitted();
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Submit an idea">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="idea_title"
          label="What's the idea or trend?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., This TikTok format is blowing up"
          required
        />
        <Textarea
          id="idea_description"
          label="Tell us more (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Why this would work, where you saw it, any context..."
          rows={3}
        />
        <Input
          id="idea_source_url"
          label="Link (optional)"
          type="url"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="https://..."
        />
        <Select
          id="idea_category"
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={CATEGORY_OPTIONS}
        />
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting}>
            <Send size={14} />
            {submitting ? 'Submitting...' : 'Submit idea'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
