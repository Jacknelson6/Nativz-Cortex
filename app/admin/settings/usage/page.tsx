import { ModelConfig } from '@/components/settings/model-config';
import { UsageDashboard } from '@/components/settings/usage-dashboard';

export default function UsagePage() {
  return (
    <div className="cortex-page-gutter space-y-6">
      <div>
        <h1 className="ui-page-title-md">AI models</h1>
        <p className="text-sm text-text-secondary mt-1">
          Configure your AI model and track usage across all services
        </p>
      </div>
      <ModelConfig />
      <UsageDashboard />
    </div>
  );
}
