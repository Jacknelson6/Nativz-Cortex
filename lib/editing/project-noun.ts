/**
 * Maps `editing_projects.project_type` to the human-friendly singular and
 * plural noun used in activity logs, email copy, and chat pings. The DB
 * enum (`organic_content | social_ads | ctv_ads | general | other`) gets
 * collapsed into three buckets the client sees: post, ad, deliverable.
 *
 * Defaulting to "deliverable" (not "video" or "cut") keeps copy correct for
 * static-image / mixed-media projects where calling the asset a "cut" is
 * actively misleading.
 */
export type ProjectNoun = {
  singular: string;
  plural: string;
};

export function nounForProjectType(
  projectType: string | null | undefined,
): ProjectNoun {
  switch (projectType) {
    case 'organic_content':
      return { singular: 'post', plural: 'posts' };
    case 'social_ads':
    case 'ctv_ads':
      return { singular: 'ad', plural: 'ads' };
    default:
      return { singular: 'deliverable', plural: 'deliverables' };
  }
}

/** Convenience: "a post" / "an ad" / "a deliverable". */
export function articleSingular(noun: ProjectNoun): string {
  const a = /^[aeiou]/i.test(noun.singular) ? 'an' : 'a';
  return `${a} ${noun.singular}`;
}
