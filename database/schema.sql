-- Schema for BookMyShow Clone (PostgreSQL)

DROP TABLE IF EXISTS waitlist CASCADE;
DROP TABLE IF EXISTS admin_audit_logs CASCADE;
DROP TABLE IF EXISTS seat_holds CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS booking_snacks CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS shows CASCADE;
DROP TABLE IF EXISTS snacks CASCADE;
DROP TABLE IF EXISTS movies CASCADE;
DROP TABLE IF EXISTS seats CASCADE;
DROP TABLE IF EXISTS screens CASCADE;
DROP TABLE IF EXISTS cinemas CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS loyalty_ledger CASCADE;
DROP TABLE IF EXISTS waitlist CASCADE;
DROP TABLE IF EXISTS audit_actions CASCADE;
DROP TABLE IF EXISTS payment_methods CASCADE;
DROP TABLE IF EXISTS payment_statuses CASCADE;
DROP TABLE IF EXISTS hold_statuses CASCADE;
DROP TABLE IF EXISTS waitlist_statuses CASCADE;
DROP TABLE IF EXISTS booking_statuses CASCADE;
DROP TABLE IF EXISTS seat_types CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Lookup/reference tables keep domain values normalized and viva-friendly.
CREATE TABLE user_roles (
    role VARCHAR(20) PRIMARY KEY
);

CREATE TABLE seat_types (
    seat_type VARCHAR(50) PRIMARY KEY
);

CREATE TABLE booking_statuses (
    status VARCHAR(20) PRIMARY KEY
);

CREATE TABLE waitlist_statuses (
    status VARCHAR(20) PRIMARY KEY
);

CREATE TABLE hold_statuses (
    status VARCHAR(20) PRIMARY KEY
);

CREATE TABLE payment_statuses (
    status VARCHAR(20) PRIMARY KEY
);

CREATE TABLE payment_methods (
    method VARCHAR(30) PRIMARY KEY
);

CREATE TABLE audit_actions (
    action VARCHAR(50) PRIMARY KEY
);

INSERT INTO user_roles (role) VALUES ('user'), ('admin');
INSERT INTO seat_types (seat_type) VALUES ('Regular'), ('Premium'), ('VIP');
INSERT INTO booking_statuses (status) VALUES ('Pending'), ('Confirmed'), ('Cancelled'), ('Expired');
INSERT INTO waitlist_statuses (status) VALUES ('Waiting'), ('Notified'), ('Auto-Booked'), ('Expired');
INSERT INTO hold_statuses (status) VALUES ('Active'), ('Released'), ('Expired'), ('Converted');
INSERT INTO payment_statuses (status) VALUES ('Pending'), ('Paid'), ('Failed'), ('Refunded');
INSERT INTO payment_methods (method) VALUES ('Demo'), ('UPI'), ('Card'), ('NetBanking'), ('Wallet'), ('Cash');
INSERT INTO audit_actions (action) VALUES ('CREATE_MOVIE'), ('CREATE_SHOW'), ('UPDATE_SHOW_PRICE'), ('CANCEL_BOOKING'), ('REFUND_PAYMENT');

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    phone VARCHAR(20),
    city VARCHAR(100),
    role VARCHAR(20) NOT NULL DEFAULT 'user' REFERENCES user_roles(role),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE cinemas (
    cinema_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    address TEXT NOT NULL
);

CREATE TABLE screens (
    screen_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cinema_id UUID NOT NULL REFERENCES cinemas(cinema_id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    total_seats INTEGER NOT NULL CHECK (total_seats > 0)
);

CREATE TABLE seats (
    seat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screen_id UUID NOT NULL REFERENCES screens(screen_id) ON DELETE CASCADE,
    row_no VARCHAR(10) NOT NULL,
    seat_no INTEGER NOT NULL,
    seat_type VARCHAR(50) NOT NULL DEFAULT 'Regular' REFERENCES seat_types(seat_type),
    price_multiplier DECIMAL(3, 2) NOT NULL DEFAULT 1.00 CHECK (price_multiplier > 0),
    UNIQUE (screen_id, row_no, seat_no)
);

CREATE TABLE movies (
    movie_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    genre VARCHAR(100),
    duration_mins INTEGER,
    language VARCHAR(50),
    poster_url TEXT,
    banner_url TEXT,
    overview TEXT,
    vote_average DECIMAL(3,1) DEFAULT 0.0,
    vote_count INTEGER DEFAULT 0,
    trailer_key VARCHAR(100),
    release_date DATE
);

CREATE TABLE snacks (
    snack_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0)
);

CREATE TABLE shows (
    show_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movie_id UUID NOT NULL REFERENCES movies(movie_id) ON DELETE CASCADE,
    screen_id UUID NOT NULL REFERENCES screens(screen_id) ON DELETE CASCADE,
    show_time TIMESTAMP NOT NULL,
    base_price DECIMAL(10, 2) NOT NULL CHECK (base_price > 0),
    surge_multiplier DECIMAL(3, 2) NOT NULL DEFAULT 1.00 CHECK (surge_multiplier >= 1.00),
    available_seats INTEGER NOT NULL CHECK (available_seats >= 0),
    UNIQUE(screen_id, show_time)
);

CREATE TABLE bookings (
    booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    show_id UUID NOT NULL REFERENCES shows(show_id) ON DELETE CASCADE,
    booking_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_amount DECIMAL(10, 2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'Pending' REFERENCES booking_statuses(status)
);

CREATE TABLE tickets (
    ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    show_id UUID NOT NULL REFERENCES shows(show_id) ON DELETE CASCADE,
    seat_id UUID NOT NULL REFERENCES seats(seat_id) ON DELETE CASCADE,
    final_price DECIMAL(10, 2) NOT NULL CHECK (final_price >= 0),
    UNIQUE(booking_id, seat_id),
    UNIQUE(show_id, seat_id)
);

CREATE TABLE payments (
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

CREATE TABLE seat_holds (
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

CREATE TABLE booking_snacks (
    booking_id UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    snack_id UUID NOT NULL REFERENCES snacks(snack_id),
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    PRIMARY KEY (booking_id, snack_id)
);

CREATE TABLE waitlist (
    waitlist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    show_id UUID NOT NULL REFERENCES shows(show_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    requested_seats INTEGER NOT NULL CHECK (requested_seats > 0),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'Waiting' REFERENCES waitlist_statuses(status),
    UNIQUE(show_id, user_id)
);

CREATE TABLE loyalty_ledger (
    ledger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    booking_id UUID NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
    points_earned INTEGER NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
    points_spent INTEGER NOT NULL DEFAULT 0 CHECK (points_spent >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    CHECK (points_earned > 0 OR points_spent > 0)
);

CREATE TABLE admin_audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL REFERENCES audit_actions(action),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Advanced DBMS Features: Performance Indexes
CREATE INDEX idx_shows_movie_id ON shows(movie_id);
CREATE INDEX idx_shows_screen_id ON shows(screen_id);
CREATE INDEX idx_shows_show_time ON shows(show_time);
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_show_id ON bookings(show_id);
CREATE INDEX idx_bookings_user_status ON bookings(user_id, status);
CREATE INDEX idx_tickets_booking_id ON tickets(booking_id);
CREATE INDEX idx_tickets_seat_id ON tickets(seat_id);
CREATE INDEX idx_tickets_show_seat ON tickets(show_id, seat_id);
CREATE UNIQUE INDEX idx_active_seat_holds_unique ON seat_holds(show_id, seat_id) WHERE status = 'Active';
CREATE INDEX idx_seat_holds_user_show ON seat_holds(user_id, show_id, status);
CREATE INDEX idx_payments_booking_status ON payments(booking_id, status);
CREATE INDEX idx_seats_screen_id ON seats(screen_id);
CREATE INDEX idx_cinemas_city ON cinemas(city);
CREATE INDEX idx_admin_audit_created_at ON admin_audit_logs(created_at DESC);
CREATE INDEX idx_shows_movie_time ON shows(movie_id, show_time);
CREATE INDEX idx_shows_screen_time ON shows(screen_id, show_time);

-- Advanced DBMS Features: Views
CREATE VIEW v_revenue_by_city AS
SELECT c.city, COUNT(b.booking_id) as total_bookings, COALESCE(SUM(b.total_amount), 0) as revenue
FROM bookings b
JOIN shows s ON b.show_id = s.show_id
JOIN screens sc ON s.screen_id = sc.screen_id
JOIN cinemas c ON sc.cinema_id = c.cinema_id
WHERE b.status = 'Confirmed'
GROUP BY c.city;

CREATE VIEW v_active_movies AS
SELECT DISTINCT m.* FROM movies m
JOIN shows s ON m.movie_id = s.movie_id
WHERE s.show_time >= NOW();

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
