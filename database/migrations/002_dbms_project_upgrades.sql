-- DBMS v2 upgrade: lookup tables, payments, seat holds, audit logs, reports.
-- Run after 001_ticket_show_id_constraints.sql on an existing database.

BEGIN;

CREATE TABLE IF NOT EXISTS user_roles (role VARCHAR(20) PRIMARY KEY);
CREATE TABLE IF NOT EXISTS seat_types (seat_type VARCHAR(50) PRIMARY KEY);
CREATE TABLE IF NOT EXISTS booking_statuses (status VARCHAR(20) PRIMARY KEY);
CREATE TABLE IF NOT EXISTS waitlist_statuses (status VARCHAR(20) PRIMARY KEY);
CREATE TABLE IF NOT EXISTS hold_statuses (status VARCHAR(20) PRIMARY KEY);
CREATE TABLE IF NOT EXISTS payment_statuses (status VARCHAR(20) PRIMARY KEY);
CREATE TABLE IF NOT EXISTS payment_methods (method VARCHAR(30) PRIMARY KEY);
CREATE TABLE IF NOT EXISTS audit_actions (action VARCHAR(50) PRIMARY KEY);

INSERT INTO user_roles (role) VALUES ('user'), ('admin') ON CONFLICT DO NOTHING;
INSERT INTO seat_types (seat_type) VALUES ('Regular'), ('Premium'), ('VIP') ON CONFLICT DO NOTHING;
INSERT INTO booking_statuses (status) VALUES ('Pending'), ('Confirmed'), ('Cancelled'), ('Expired') ON CONFLICT DO NOTHING;
INSERT INTO waitlist_statuses (status) VALUES ('Waiting'), ('Notified'), ('Auto-Booked'), ('Expired') ON CONFLICT DO NOTHING;
INSERT INTO hold_statuses (status) VALUES ('Active'), ('Released'), ('Expired'), ('Converted') ON CONFLICT DO NOTHING;
INSERT INTO payment_statuses (status) VALUES ('Pending'), ('Paid'), ('Failed'), ('Refunded') ON CONFLICT DO NOTHING;
INSERT INTO payment_methods (method) VALUES ('Demo'), ('UPI'), ('Card'), ('NetBanking'), ('Wallet'), ('Cash') ON CONFLICT DO NOTHING;
INSERT INTO audit_actions (action) VALUES
('CREATE_MOVIE'), ('CREATE_SHOW'), ('UPDATE_SHOW_PRICE'), ('CANCEL_BOOKING'), ('REFUND_PAYMENT')
ON CONFLICT DO NOTHING;

UPDATE users SET role = 'user' WHERE role IS NULL;
UPDATE bookings SET total_amount = 0 WHERE total_amount IS NULL;
UPDATE bookings SET status = 'Pending' WHERE status IS NULL;
UPDATE seats SET seat_type = 'Regular' WHERE seat_type IS NULL;
UPDATE seats SET price_multiplier = 1.00 WHERE price_multiplier IS NULL;
UPDATE shows SET surge_multiplier = 1.00 WHERE surge_multiplier IS NULL;
UPDATE waitlist SET status = 'Waiting' WHERE status IS NULL;
UPDATE loyalty_ledger SET points_earned = 0 WHERE points_earned IS NULL;
UPDATE loyalty_ledger SET points_spent = 0 WHERE points_spent IS NULL;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE waitlist DROP CONSTRAINT IF EXISTS waitlist_status_check;
ALTER TABLE screens DROP CONSTRAINT IF EXISTS screens_total_seats_positive;
ALTER TABLE seats DROP CONSTRAINT IF EXISTS seats_price_multiplier_positive;
ALTER TABLE snacks DROP CONSTRAINT IF EXISTS snacks_price_nonnegative;
ALTER TABLE shows DROP CONSTRAINT IF EXISTS shows_surge_multiplier_min;
ALTER TABLE booking_snacks DROP CONSTRAINT IF EXISTS booking_snacks_quantity_positive;

ALTER TABLE users ALTER COLUMN role SET NOT NULL;
ALTER TABLE screens ALTER COLUMN cinema_id SET NOT NULL;
ALTER TABLE screens ADD CONSTRAINT screens_total_seats_positive CHECK (total_seats > 0) NOT VALID;
ALTER TABLE seats ALTER COLUMN screen_id SET NOT NULL;
ALTER TABLE seats ALTER COLUMN seat_type SET NOT NULL;
ALTER TABLE seats ALTER COLUMN price_multiplier SET NOT NULL;
ALTER TABLE seats ADD CONSTRAINT seats_price_multiplier_positive CHECK (price_multiplier > 0) NOT VALID;
ALTER TABLE snacks ADD CONSTRAINT snacks_price_nonnegative CHECK (price >= 0) NOT VALID;
ALTER TABLE shows ALTER COLUMN movie_id SET NOT NULL;
ALTER TABLE shows ALTER COLUMN screen_id SET NOT NULL;
ALTER TABLE shows ALTER COLUMN surge_multiplier SET NOT NULL;
ALTER TABLE shows ADD CONSTRAINT shows_surge_multiplier_min CHECK (surge_multiplier >= 1.00) NOT VALID;
ALTER TABLE bookings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN show_id SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN total_amount SET NOT NULL;
ALTER TABLE bookings ALTER COLUMN status SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN booking_id SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN show_id SET NOT NULL;
ALTER TABLE tickets ALTER COLUMN seat_id SET NOT NULL;
ALTER TABLE booking_snacks ALTER COLUMN booking_id SET NOT NULL;
ALTER TABLE booking_snacks ALTER COLUMN snack_id SET NOT NULL;
ALTER TABLE booking_snacks ADD CONSTRAINT booking_snacks_quantity_positive CHECK (quantity > 0) NOT VALID;
ALTER TABLE waitlist ALTER COLUMN show_id SET NOT NULL;
ALTER TABLE waitlist ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE waitlist ALTER COLUMN status SET NOT NULL;
ALTER TABLE loyalty_ledger ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE loyalty_ledger ALTER COLUMN booking_id SET NOT NULL;
ALTER TABLE loyalty_ledger ALTER COLUMN points_earned SET NOT NULL;
ALTER TABLE loyalty_ledger ALTER COLUMN points_spent SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_lookup_fkey') THEN
    ALTER TABLE users ADD CONSTRAINT users_role_lookup_fkey FOREIGN KEY (role) REFERENCES user_roles(role);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seats_seat_type_lookup_fkey') THEN
    ALTER TABLE seats ADD CONSTRAINT seats_seat_type_lookup_fkey FOREIGN KEY (seat_type) REFERENCES seat_types(seat_type);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_status_lookup_fkey') THEN
    ALTER TABLE bookings ADD CONSTRAINT bookings_status_lookup_fkey FOREIGN KEY (status) REFERENCES booking_statuses(status);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waitlist_status_lookup_fkey') THEN
    ALTER TABLE waitlist ADD CONSTRAINT waitlist_status_lookup_fkey FOREIGN KEY (status) REFERENCES waitlist_statuses(status);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL UNIQUE REFERENCES bookings(booking_id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    method VARCHAR(30) NOT NULL DEFAULT 'Demo' REFERENCES payment_methods(method),
    status VARCHAR(20) NOT NULL DEFAULT 'Paid' REFERENCES payment_statuses(status),
    transaction_ref VARCHAR(100) UNIQUE DEFAULT (gen_random_uuid()::text),
    paid_at TIMESTAMP,
    refund_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
    refunded_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seat_holds (
    hold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    show_id UUID NOT NULL REFERENCES shows(show_id) ON DELETE CASCADE,
    seat_id UUID NOT NULL REFERENCES seats(seat_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    hold_token UUID NOT NULL DEFAULT gen_random_uuid(),
    status VARCHAR(20) NOT NULL DEFAULT 'Active' REFERENCES hold_statuses(status),
    expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '10 minutes'),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL REFERENCES audit_actions(action),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_status ON bookings(user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_active_seat_holds_unique ON seat_holds(show_id, seat_id) WHERE status = 'Active';
CREATE INDEX IF NOT EXISTS idx_seat_holds_user_show ON seat_holds(user_id, show_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_booking_status ON payments(booking_id, status);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created_at ON admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shows_movie_time ON shows(movie_id, show_time);
CREATE INDEX IF NOT EXISTS idx_shows_screen_time ON shows(screen_id, show_time);

DROP VIEW IF EXISTS v_top_users;
DROP VIEW IF EXISTS v_show_occupancy;
DROP VIEW IF EXISTS v_revenue_by_cinema;
DROP VIEW IF EXISTS v_revenue_by_movie;

CREATE OR REPLACE VIEW v_revenue_by_city AS
SELECT c.city, COUNT(b.booking_id) as total_bookings, COALESCE(SUM(b.total_amount), 0) as revenue
FROM bookings b
JOIN shows s ON b.show_id = s.show_id
JOIN screens sc ON s.screen_id = sc.screen_id
JOIN cinemas c ON sc.cinema_id = c.cinema_id
WHERE b.status = 'Confirmed'
GROUP BY c.city;

CREATE VIEW v_revenue_by_movie AS
WITH ticket_counts AS (
    SELECT booking_id, COUNT(*) AS ticket_count
    FROM tickets
    GROUP BY booking_id
)
SELECT m.movie_id, m.title,
       COUNT(b.booking_id) AS total_bookings,
       COALESCE(SUM(tc.ticket_count), 0) AS tickets_sold,
       COALESCE(SUM(b.total_amount), 0) AS revenue
FROM movies m
JOIN shows s ON m.movie_id = s.movie_id
LEFT JOIN bookings b ON s.show_id = b.show_id AND b.status = 'Confirmed'
LEFT JOIN ticket_counts tc ON b.booking_id = tc.booking_id
GROUP BY m.movie_id, m.title;

CREATE VIEW v_revenue_by_cinema AS
WITH ticket_counts AS (
    SELECT booking_id, COUNT(*) AS ticket_count
    FROM tickets
    GROUP BY booking_id
)
SELECT c.cinema_id, c.name AS cinema_name, c.city,
       COUNT(b.booking_id) AS total_bookings,
       COALESCE(SUM(tc.ticket_count), 0) AS tickets_sold,
       COALESCE(SUM(b.total_amount), 0) AS revenue
FROM cinemas c
JOIN screens sc ON c.cinema_id = sc.cinema_id
JOIN shows s ON sc.screen_id = s.screen_id
LEFT JOIN bookings b ON s.show_id = b.show_id AND b.status = 'Confirmed'
LEFT JOIN ticket_counts tc ON b.booking_id = tc.booking_id
GROUP BY c.cinema_id, c.name, c.city;

CREATE VIEW v_show_occupancy AS
SELECT s.show_id, m.title, c.name AS cinema_name, sc.name AS screen_name,
       s.show_time, sc.total_seats, s.available_seats,
       (sc.total_seats - s.available_seats) AS booked_seats,
       ROUND(((sc.total_seats - s.available_seats)::numeric / NULLIF(sc.total_seats, 0)) * 100, 2) AS occupancy_percent,
       s.surge_multiplier
FROM shows s
JOIN movies m ON s.movie_id = m.movie_id
JOIN screens sc ON s.screen_id = sc.screen_id
JOIN cinemas c ON sc.cinema_id = c.cinema_id;

CREATE VIEW v_top_users AS
WITH booking_totals AS (
    SELECT user_id, COUNT(*) AS confirmed_bookings, SUM(total_amount) AS total_spent
    FROM bookings
    WHERE status = 'Confirmed'
    GROUP BY user_id
),
loyalty_totals AS (
    SELECT user_id, SUM(points_earned - points_spent) AS loyalty_balance
    FROM loyalty_ledger
    WHERE expires_at IS NULL OR expires_at > NOW()
    GROUP BY user_id
)
SELECT u.user_id, u.name, u.email,
       COALESCE(bt.confirmed_bookings, 0) AS confirmed_bookings,
       COALESCE(bt.total_spent, 0) AS total_spent,
       COALESCE(lt.loyalty_balance, 0) AS loyalty_balance
FROM users u
LEFT JOIN booking_totals bt ON u.user_id = bt.user_id
LEFT JOIN loyalty_totals lt ON u.user_id = lt.user_id;

CREATE OR REPLACE FUNCTION expire_seat_holds()
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE seat_holds
    SET status = 'Expired',
        released_at = CURRENT_TIMESTAMP
    WHERE status = 'Active'
      AND expires_at <= CURRENT_TIMESTAMP;

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION expire_pending_bookings(p_cutoff INTERVAL DEFAULT INTERVAL '10 minutes')
RETURNS INTEGER AS $$
DECLARE
    expired_count INTEGER;
BEGIN
    UPDATE bookings
    SET status = 'Expired'
    WHERE status = 'Pending'
      AND booking_time <= CURRENT_TIMESTAMP - p_cutoff;

    GET DIAGNOSTICS expired_count = ROW_COUNT;
    RETURN expired_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
