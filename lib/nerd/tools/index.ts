import { registerTools } from '../registry';
import { taskTools } from './tasks';
import { schedulerTools } from './scheduler';
import { clientTools } from './clients';
import { shootTools } from './shoots';
import { searchTools } from './search';
import { teamTools } from './team';
import { moodboardTools } from './moodboard';
import { notificationTools } from './notifications';
import { analyticsTools } from './analytics';
import { affiliateTools } from './affiliates';
import { knowledgeTools } from './knowledge';
import { agencyKnowledgeTools } from './agency-knowledge';
import { fyxerTools } from './fyxer';

/** Register all tool domains. Call once at startup. */
export function registerAllTools() {
  registerTools(taskTools);
  registerTools(schedulerTools);
  registerTools(clientTools);
  registerTools(shootTools);
  registerTools(searchTools);
  registerTools(teamTools);
  registerTools(moodboardTools);
  registerTools(notificationTools);
  registerTools(analyticsTools);
  registerTools(affiliateTools);
  registerTools(knowledgeTools);
  registerTools(agencyKnowledgeTools);
  registerTools(fyxerTools);
}
