/**
 * Gemini per-video grader for the audit pipeline.
 * Stub — implementation added in Task 3. Types exported here for use by Task 2 helpers.
 */

export interface VideoAudit {
  hook_type: 'question' | 'story' | 'demo' | 'stat' | 'controversy' | 'none';
  hook_strength: number; // 1-5
  format: string;
  quality_grade: 'high' | 'medium' | 'low';
  visual_elements: string[];
}
