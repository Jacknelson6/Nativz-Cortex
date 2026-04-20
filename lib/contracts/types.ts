import { z } from 'zod';

export const deliverableSchema = z.object({
  service_tag: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  quantity_per_month: z.number().int().min(0).max(1000),
  notes: z.string().max(500).optional().nullable(),
});

export const extractionResultSchema = z.object({
  services: z.array(z.string().min(1).max(50)).max(30),
  deliverables: z.array(deliverableSchema).max(100),
  effective_start: z.string().date().optional().nullable(),
  effective_end: z.string().date().optional().nullable(),
  suggested_label: z.string().max(80).optional().nullable(),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const confirmContractBodySchema = z.object({
  label: z.string().min(1).max(80),
  status: z.enum(['active', 'ended']),
  effective_start: z.string().date().nullable().optional(),
  effective_end: z.string().date().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  deliverables: z.array(deliverableSchema).max(100),
});

export type ConfirmContractBody = z.infer<typeof confirmContractBodySchema>;

export const patchContractBodySchema = confirmContractBodySchema.partial().extend({
  status: z.enum(['draft', 'active', 'ended']).optional(),
});

export type PatchContractBody = z.infer<typeof patchContractBodySchema>;

export const PARSE_PROMPT_VERSION = 'v1';
