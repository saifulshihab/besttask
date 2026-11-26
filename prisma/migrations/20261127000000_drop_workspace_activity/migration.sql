-- Activity is read per project only since workspace Activity was removed.

-- Workspace-level events (no project): nothing can read them any more, and
-- the API no longer writes them.
DELETE FROM "ActivityEvent" WHERE "projectId" IS NULL;

-- Events of projects that no longer exist. Soft-deleted projects are still in
-- "Project" during their Undo window, so their history is kept.
DELETE FROM "ActivityEvent" e
WHERE NOT EXISTS (SELECT 1 FROM "Project" p WHERE p."id" = e."projectId");
