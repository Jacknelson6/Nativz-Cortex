-- Competitor intelligence watch flow creates benchmark rows directly (no
-- originating audit). Relax the NOT NULL on client_benchmarks.audit_id so
-- those rows can be persisted. FK is preserved, and rows created from the
-- audit flow continue to set audit_id as before.

alter table client_benchmarks alter column audit_id drop not null;
