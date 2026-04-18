import { registerTools } from '../registry';
import { taskTools } from './tasks';
import { schedulerTools } from './scheduler';
import { clientTools } from './clients';
import { shootTools } from './shoots';
import { searchTools } from './search';
import { teamTools } from './team';
import { moodboardTools } from './moodboard';
import { scriptTools } from './scripts';
import { notificationTools } from './notifications';
import { analyticsTools } from './analytics';
import { affiliateTools } from './affiliates';
import { knowledgeTools } from './knowledge';
import { topicPlanTools } from './topic-plans';
import { topicSignalTools } from './topic-signals';
// Agency knowledge graph tools disabled — KG APIs are still being built,
// and the RPCs error out in production. Re-enable once the graph is ready.
// import { agencyKnowledgeTools } from './agency-knowledge';
import { fyxerTools } from './fyxer';
import { analysisTools } from './analyses';
import { tiktokShopMarketTools } from './tiktok-shop-market';

/** Register all tool domains. Call once at startup. */
export function registerAllTools() {
  registerTools(taskTools);
  registerTools(schedulerTools);
  registerTools(clientTools);
  registerTools(shootTools);
  registerTools(searchTools);
  registerTools(teamTools);
  registerTools(moodboardTools);
  registerTools(scriptTools);
  registerTools(notificationTools);
  registerTools(analyticsTools);
  registerTools(affiliateTools);
  registerTools(knowledgeTools);
  registerTools(topicPlanTools);
  registerTools(topicSignalTools);
  // registerTools(agencyKnowledgeTools);  // disabled — KG not ready
  registerTools(fyxerTools);
  // Progressive-context tools for Strategy Lab + per-analysis drawer.
  registerTools(analysisTools);
  // Live TikTok Shop market-data tools (FastMoss / Cruva-style): let
  // the agent pull fresh industry data on demand.
  registerTools(tiktokShopMarketTools);
}
