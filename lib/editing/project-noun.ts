/**
 * Maps `editing_projects.project_type` to the human-friendly singular and
 * plural noun used in activity logs, email copy, and chat pings. After
 * migration 302 the DB enum is binary (`editing | calendar`), so this
 * collapses into two buckets the client sees: post (calendar) and
 * deliverable (editing).
 *
 * Defaulting to "deliverable" (not "video" or "cut") keeps copy correct for
 * static-image / mixed-media projects where calling the asset a "cut" is
 * actively misleading. Legacy values (organic_content / social_ads /
 * ctv_ads / general / other) are still recognised so any pre-migration
 * cached row, share-link payload, or in-flight webhook keeps producing
 * the right noun until the data is fully migrated through.
 */
export type ProjectNoun = {
  singular: string;
  plural: string;
};

export function nounForProjectType(
  projectType: string | null | undefined,
): ProjectNoun {
  switch (projectType) {
    case 'calendar':
    case 'organic_content':
      return { singular: 'post', plural: 'posts' };
    case 'editing':
    case 'social_ads':
    case 'ctv_ads':
    case 'general':
    case 'other':
    default:
      return { singular: 'deliverable', plural: 'deliverables' };
  }
}

/** Convenience: "a post" / "an ad" / "a deliverable". */
export function articleSingular(noun: ProjectNoun): string {
  const a = /^[aeiou]/i.test(noun.singular) ? 'an' : 'a';
  return `${a} ${noun.singular}`;
}
