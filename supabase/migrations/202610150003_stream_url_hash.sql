-- Hash the complete URL instead of indexing its full text: signed public URLs can exceed B-tree row limits.
BEGIN;
CREATE UNIQUE INDEX streams_channel_url_hash ON public.streams (channel_id, md5(url));
ALTER TABLE public.streams DROP CONSTRAINT streams_channel_id_url_key;
COMMIT;
