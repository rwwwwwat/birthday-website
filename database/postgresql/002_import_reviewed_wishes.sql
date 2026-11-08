-- REVIEW ONLY. This script contains NO real wishes and is NEVER executed by the API.
-- Future operator must use a fresh, dedicated connection with no pending transaction.
-- A separately approved importer must supply these settings on the SAME connection, using parameters:
--   birthday_migration.payload: JSON array, each row with exactly wishId/content/createdAtUtc/isRead/source.
--   createdAtUtc MUST be the original UTC value formatted yyyy-MM-ddTHH:mm:ss.fffffffZ (7 digits).
--   birthday_migration.source_identity: independently captured SQL Server identity current value.
-- Do not pass payload/passwords on a command line or log parameters. Do not execute empty placeholders.
-- Do not enable production writes until import, verification AND sequence state are reviewed.
-- PostgreSQL sequence changes are NOT transactional: failure after setval can leave a harmless gap.
-- This script never rewinds a sequence and never overwrites/updates/deletes an existing wish.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(105, 1);
LOCK TABLE birthday_private.wishes IN ACCESS EXCLUSIVE MODE;
DO $migration$
DECLARE
    payload jsonb := nullif(current_setting('birthday_migration.payload', true), '')::jsonb;
    source_identity bigint := nullif(current_setting('birthday_migration.source_identity', true), '')::bigint;
    item jsonb;
    created_text text;
    largest_id bigint;
    previous_sequence bigint;
BEGIN
    IF payload IS NULL OR jsonb_typeof(payload) <> 'array' OR jsonb_array_length(payload) = 0
        OR source_identity IS NULL OR source_identity < 1 OR source_identity >= 9223372036854775807 THEN
        RAISE EXCEPTION 'Reviewed payload and valid source identity metadata are required';
    END IF;
    IF EXISTS (SELECT 1 FROM birthday_private.wishes) THEN
        RAISE EXCEPTION 'Target is not empty; no merge or overwrite is allowed';
    END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
        IF jsonb_typeof(item) <> 'object' OR (SELECT count(*) FROM jsonb_object_keys(item)) <> 5
            OR NOT (item ?& ARRAY['wishId','content','createdAtUtc','isRead','source'])
            OR jsonb_typeof(item->'wishId') IS DISTINCT FROM 'number'
            OR jsonb_typeof(item->'content') IS DISTINCT FROM 'string'
            OR jsonb_typeof(item->'createdAtUtc') IS DISTINCT FROM 'string'
            OR jsonb_typeof(item->'isRead') IS DISTINCT FROM 'boolean'
            OR jsonb_typeof(item->'source') IS DISTINCT FROM 'string' THEN
            RAISE EXCEPTION 'Invalid import field shape or types';
        END IF;
        IF (item->>'wishId') !~ '^[1-9][0-9]*$' OR (item->>'wishId')::bigint > source_identity THEN
            RAISE EXCEPTION 'Source wish ID/identity metadata mismatch';
        END IF;
        created_text := item->>'createdAtUtc';
        IF created_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{7}Z$' THEN
            RAISE EXCEPTION 'Original UTC timestamp with exactly seven fractional digits is required';
        END IF;
        IF to_char((left(created_text, 26) || 'Z')::timestamptz AT TIME ZONE 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.US') <> left(created_text, 26) THEN
            RAISE EXCEPTION 'Timestamp would be normalized or rounded; original value must be retained';
        END IF;
        -- Truncate the TEXT before casting so PostgreSQL cannot round the seventh digit away.
        INSERT INTO birthday_private.wishes
            (wish_id, content, created_at, created_at_100ns_remainder, is_read, source)
        VALUES ((item->>'wishId')::bigint, item->>'content',
            (left(created_text, 26) || 'Z')::timestamptz, substring(created_text FROM 27 FOR 1)::smallint,
            (item->>'isRead')::boolean, item->>'source');
    END LOOP;
    SELECT max(wish_id) INTO largest_id FROM birthday_private.wishes;
    SELECT last_value INTO previous_sequence FROM birthday_private.wishes_wish_id_seq;
    PERFORM setval('birthday_private.wishes_wish_id_seq'::regclass,
        greatest(largest_id, source_identity, previous_sequence), true);
END $migration$;
COMMIT;
-- Required independent verification after success: all fields/IDs/hashes, timestamp remainder,
-- record counts, defaults/checks/indexes, sequence next value and no Data API exposure.
-- Do not INSERT a test wish to check the sequence; inspect sequence metadata only.
