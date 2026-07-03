-- Schema for BookMyShow Clone (PostgreSQL)

DROP TABLE IF EXISTS waitlist CASCADE;
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

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    phone VARCHAR(20),
    city VARCHAR(100),
    role VARCHAR(20) DEFAULT 'user',
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
    cinema_id UUID REFERENCES cinemas(cinema_id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    total_seats INTEGER NOT NULL
);

CREATE TABLE seats (
    seat_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    screen_id UUID REFERENCES screens(screen_id) ON DELETE CASCADE,
    row_no VARCHAR(10) NOT NULL,
    seat_no INTEGER NOT NULL,
    seat_type VARCHAR(50) DEFAULT 'Regular', -- Regular, Premium, VIP
    price_multiplier DECIMAL(3, 2) DEFAULT 1.00,
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
    price DECIMAL(10, 2) NOT NULL
);

CREATE TABLE shows (
    show_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movie_id UUID REFERENCES movies(movie_id) ON DELETE CASCADE,
    screen_id UUID REFERENCES screens(screen_id) ON DELETE CASCADE,
    show_time TIMESTAMP NOT NULL,
    base_price DECIMAL(10, 2) NOT NULL CHECK (base_price > 0),
    surge_multiplier DECIMAL(3, 2) DEFAULT 1.00,
    available_seats INTEGER NOT NULL CHECK (available_seats >= 0),
    UNIQUE(screen_id, show_time)
);

CREATE TABLE bookings (
    booking_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    show_id UUID REFERENCES shows(show_id) ON DELETE CASCADE,
    booking_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    total_amount DECIMAL(10, 2) CHECK (total_amount >= 0),
    status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Confirmed', 'Cancelled'))
);

CREATE TABLE tickets (
    ticket_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(booking_id) ON DELETE CASCADE,
    seat_id UUID REFERENCES seats(seat_id) ON DELETE CASCADE,
    final_price DECIMAL(10, 2) NOT NULL CHECK (final_price >= 0),
    UNIQUE(booking_id, seat_id)
);

CREATE TABLE booking_snacks (
    booking_id UUID REFERENCES bookings(booking_id) ON DELETE CASCADE,
    snack_id UUID REFERENCES snacks(snack_id),
    quantity INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (booking_id, snack_id)
);

CREATE TABLE waitlist (
    waitlist_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    show_id UUID REFERENCES shows(show_id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    requested_seats INTEGER NOT NULL CHECK (requested_seats > 0),
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Waiting' CHECK (status IN ('Waiting', 'Notified', 'Auto-Booked', 'Expired'))
);

CREATE TABLE loyalty_ledger (
    ledger_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(booking_id) ON DELETE CASCADE,
    points_earned INTEGER DEFAULT 0,
    points_spent INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Advanced DBMS Features: Performance Indexes
CREATE INDEX idx_shows_movie_id ON shows(movie_id);
CREATE INDEX idx_shows_screen_id ON shows(screen_id);
CREATE INDEX idx_shows_show_time ON shows(show_time);
CREATE INDEX idx_bookings_user_id ON bookings(user_id);
CREATE INDEX idx_bookings_show_id ON bookings(show_id);
CREATE INDEX idx_tickets_booking_id ON tickets(booking_id);
CREATE INDEX idx_tickets_seat_id ON tickets(seat_id);
CREATE INDEX idx_seats_screen_id ON seats(screen_id);
CREATE INDEX idx_cinemas_city ON cinemas(city);

-- Advanced DBMS Features: Views
CREATE VIEW v_revenue_by_city AS
SELECT c.city, COUNT(b.booking_id) as total_bookings, SUM(b.total_amount) as revenue
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
