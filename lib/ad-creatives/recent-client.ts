/** Recent clients with creative activity — shared by admin ad-creatives page and hub UI (avoid importing from `page.tsx`). */
export type RecentClient = {
  clientId: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  creativeCount: number;
};
