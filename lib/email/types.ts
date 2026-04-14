export type EmailTemplateCategory = 'followup' | 'reminder' | 'calendar' | 'welcome' | 'general';

export interface EmailTemplate {
  id: string;
  name: string;
  category: EmailTemplateCategory;
  subject: string;
  body_markdown: string;
  updated_at: string;
  created_by: string | null;
}

export interface ScheduledEmail {
  id: string;
  recipient_id: string;
  template_id: string | null;
  subject: string;
  body_markdown: string;
  send_at: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  resend_id: string | null;
  failure_reason: string | null;
  scheduled_by: string;
  created_at: string;
}

export interface MergeContext {
  recipient: {
    full_name: string | null;
    email: string | null;
  };
  sender: {
    full_name: string | null;
    email: string | null;
  };
  client: {
    name: string | null;
  };
}
