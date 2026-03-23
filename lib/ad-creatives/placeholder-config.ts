/** Passed from ad wizard → gallery while a batch is generating. */
export type AdBatchPlaceholderConfig = {
  brandColors: string[];
  templateThumbnails: { templateId: string; imageUrl: string; variationIndex: number }[];
  /** Hide template hints under skeletons (Nano Banana batches). */
  skeletonOnly?: boolean;
};
