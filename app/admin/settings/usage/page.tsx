import { AiRoutingSection } from '@/components/settings/ai-routing-section';
import { LlmCredentialsSection } from '@/components/settings/llm-credentials-section';
import { UsageDashboard } from '@/components/settings/usage-dashboard';

export default function UsagePage() {
  return (
    <div className="cortex-page-gutter space-y-6">
      <div>
        <h1 className="ui-page-title-md">AI models</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Models for topic search, agents, and everything else — plus API keys when you don’t want to use env vars only.
        </p>
      </div>
      <AiRoutingSection />
      <LlmCredentialsSection />
      <div>
        <h2 className="mb-3 text-sm font-semibold text-text-primary">Usage</h2>
        <UsageDashboard />
      </div>
    </div>
  );
}
