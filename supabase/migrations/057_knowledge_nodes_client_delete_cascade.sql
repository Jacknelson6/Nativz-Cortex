-- Client delete was blocked by knowledge_nodes rows (Brand DNA / graph sync).
-- Match pattern from 056_client_delete_cascade_fks.sql.
-- Table may exist only in environments where the knowledge graph was provisioned.

DO $body$
BEGIN
  IF to_regclass('public.knowledge_nodes') IS NOT NULL THEN
    ALTER TABLE knowledge_nodes DROP CONSTRAINT IF EXISTS knowledge_nodes_client_id_fkey;
    ALTER TABLE knowledge_nodes ADD CONSTRAINT knowledge_nodes_client_id_fkey
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
  END IF;
END $body$;
