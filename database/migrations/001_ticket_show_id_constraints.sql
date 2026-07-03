-- Adds DB-level double-booking protection for existing databases.
-- Run after backing up the database:
--   psql "$DATABASE_URL" -f database/migrations/001_ticket_show_id_constraints.sql

BEGIN;

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS show_id UUID REFERENCES shows(show_id) ON DELETE CASCADE;

UPDATE tickets t
SET show_id = b.show_id
FROM bookings b
WHERE t.booking_id = b.booking_id
  AND t.show_id IS NULL;

ALTER TABLE tickets
  ALTER COLUMN show_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tickets_show_id_seat_id_key'
  ) THEN
    ALTER TABLE tickets
      ADD CONSTRAINT tickets_show_id_seat_id_key UNIQUE (show_id, seat_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tickets_show_seat ON tickets(show_id, seat_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_show_id_user_id_key'
  ) THEN
    ALTER TABLE waitlist
      ADD CONSTRAINT waitlist_show_id_user_id_key UNIQUE (show_id, user_id);
  END IF;
END $$;

COMMIT;
