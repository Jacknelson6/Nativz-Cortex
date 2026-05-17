'use client';

import {
  SectionEditor,
  EditorField,
  editorInputClass,
} from './section-editor';

type WebhookDraft = {
  chat_webhook_url: string;
  revision_webhook_url: string;
  paid_media_webhook_url: string;
};

export function WebhooksEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: WebhookDraft;
}) {
  return (
    <SectionEditor<WebhookDraft>
      title="Webhooks"
      description="Where Cortex pushes events. Leave blank to disable. URLs are admin-only — clients never see them."
      initial={initial}
      endpoint={`/api/clients/${clientId}`}
      validate={(d) => {
        for (const [label, value] of Object.entries({
          'Chat webhook': d.chat_webhook_url,
          'Revision webhook': d.revision_webhook_url,
          'Paid media webhook': d.paid_media_webhook_url,
        })) {
          const v = value.trim();
          if (!v) continue;
          try {
            new URL(v);
          } catch {
            return `${label} must be a valid URL`;
          }
        }
        return null;
      }}
      buildBody={(d) => ({
        chat_webhook_url: d.chat_webhook_url.trim() || null,
        revision_webhook_url: d.revision_webhook_url.trim() || null,
        paid_media_webhook_url: d.paid_media_webhook_url.trim() || null,
      })}
    >
      {(d, set) => (
        <>
          <EditorField
            label="Chat webhook"
            hint="Google Chat space URL — gets every approval comment + new-drop ping."
          >
            <input
              type="url"
              value={d.chat_webhook_url}
              onChange={(e) => set({ chat_webhook_url: e.target.value })}
              className={editorInputClass}
              placeholder="https://chat.googleapis.com/v1/spaces/..."
            />
          </EditorField>
          <EditorField label="Revision webhook" hint="Frame.io / Monday / Slack — fires on revision request.">
            <input
              type="url"
              value={d.revision_webhook_url}
              onChange={(e) => set({ revision_webhook_url: e.target.value })}
              className={editorInputClass}
              placeholder="https://"
            />
          </EditorField>
          <EditorField label="Paid media webhook" hint="Where paid-media all-clear pings land.">
            <input
              type="url"
              value={d.paid_media_webhook_url}
              onChange={(e) => set({ paid_media_webhook_url: e.target.value })}
              className={editorInputClass}
              placeholder="https://"
            />
          </EditorField>
        </>
      )}
    </SectionEditor>
  );
}

type UpPromoteDraft = { uppromote_api_key: string };

/**
 * UpPromote key never round-trips its value. Editor accepts a new key on
 * save; an empty submission clears it. The page itself only displays
 * "Connected" / "Not connected" from a boolean.
 */
export function UpPromoteEditor({
  clientId,
  connected,
}: {
  clientId: string;
  connected: boolean;
}) {
  return (
    <SectionEditor<UpPromoteDraft>
      label={connected ? 'Update' : 'Connect'}
      title="UpPromote API key"
      description="Used to pull affiliate earnings + new signups for the weekly digest."
      initial={{ uppromote_api_key: '' }}
      endpoint={`/api/clients/${clientId}`}
      buildBody={(d) => ({
        uppromote_api_key: d.uppromote_api_key.trim() || null,
      })}
    >
      {(d, set) => (
        <EditorField
          label="API key"
          hint={connected ? 'Paste a new key to replace the current one. Submit blank to disconnect.' : 'Paste the key from UpPromote → Settings → API.'}
        >
          <input
            type="password"
            autoComplete="off"
            value={d.uppromote_api_key}
            onChange={(e) => set({ uppromote_api_key: e.target.value })}
            className={editorInputClass}
            placeholder={connected ? '••••••••••••' : 'up_live_...'}
          />
        </EditorField>
      )}
    </SectionEditor>
  );
}
