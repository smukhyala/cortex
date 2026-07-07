UPDATE "Memory"
SET "status" = 'archived',
    "archivedReason" = COALESCE("archivedReason", 'Archived by user')
WHERE "status" = 'trashed';
