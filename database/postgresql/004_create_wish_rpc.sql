-- Public RPC for the static GitHub Pages frontend.
-- The callable function lives in the exposed public schema; the wishes table stays private.
-- Run this once in the Supabase SQL Editor after 001_create_private_wishes.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_wish(p_content text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    saved birthday_private.wishes%ROWTYPE;
BEGIN
    IF p_content IS NULL
       OR length(btrim(translate(p_content, chr(9) || chr(10) || chr(13) || ' ', ''))) = 0 THEN
        RAISE EXCEPTION 'content is required' USING ERRCODE = '22023';
    END IF;
    IF birthday_private.utf16_length(p_content) > 2000 THEN
        RAISE EXCEPTION 'content is too long' USING ERRCODE = '22001';
    END IF;

    INSERT INTO birthday_private.wishes (content)
    VALUES (p_content)
    RETURNING * INTO saved;

    RETURN jsonb_build_object(
        'wishId', saved.wish_id,
        'createdAt', to_char(saved.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"'),
        'isRead', saved.is_read,
        'source', saved.source
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_wish(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_wish(text) TO anon;

-- Make the new RPC visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';

COMMIT;
