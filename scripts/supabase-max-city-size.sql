-- Enforce a max city save size of 20 MiB in Supabase Postgres.
-- Run this in the Supabase SQL Editor (or via your migration pipeline).

-- 20 MiB = 20 * 1024 * 1024 = 20971520 bytes

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'game_rooms'
      AND c.conname = 'game_rooms_game_state_max_20mb'
  ) THEN
    ALTER TABLE public.game_rooms
      ADD CONSTRAINT game_rooms_game_state_max_20mb
      CHECK (octet_length(game_state) <= 20971520);
  END IF;
END
$$;

