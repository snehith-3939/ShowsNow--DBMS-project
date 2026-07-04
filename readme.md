<div align="center">

# ShowsNow 🎬

### A full-stack DBMS movie ticket booking platform built with React, Node.js, and PostgreSQL.

*Built to demonstrate relational modeling, transactions, DB constraints, PL/pgSQL triggers, temporary seat holds, reporting views, and an AI-assisted booking flow.*

</div>

---

## What This Project Is

ShowsNow is a working, database-driven booking platform built as part of a DBMS course project, designed to demonstrate relational database engineering, transactional integrity, and modern full-stack development.

The platform supports multi-city movie browsing, interactive seat selection, checkout with snack bundling and loyalty point redemption, payment records, a role-gated admin dashboard, a waitlist system, and an AI-assisted booking agent. The backend uses PostgreSQL constraints, transactions, triggers, views, and row locks for the core booking flow.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19 (Vite), React Router v7, Context API, Vanilla CSS |
| **Backend** | Node.js, Express.js, REST API |
| **Database** | PostgreSQL, PL/pgSQL triggers and functions |
| **Auth** | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` password hashing |
| **Image CDN** | TMDB Global Image CDN (`image.tmdb.org`) |
| **Config** | `dotenv`, `pg` (node-postgres), `pg-pool` |

---

## Architecture

### Database Schema

The schema is normalized across core business tables plus lookup/reference tables, and enforces referential integrity with foreign keys throughout:

This version also includes DBMS project upgrades such as payment records, temporary seat holds, audit logs, lookup/reference tables, expiry routines, and additional reporting views. See [`DBMS_PROJECT_NOTES.md`](DBMS_PROJECT_NOTES.md) and [`database/dbms_checks.sql`](database/dbms_checks.sql) for viva/demo material.

```
users ──────────────────────────────────────────────────────────────┐
                                                                     │
cinemas → screens → seats ──────────────────────────────────────────│
                   └──→ shows ──→ bookings ──→ tickets ─────────────┘
                           │                ├──→ payments
                           │                └──→ booking_snacks
                           ├──→ waitlist
                           └──→ seat_holds
                                            └──→ loyalty_ledger
```

| Table | Purpose |
|---|---|
| `users` | UUID primary keys, bcrypt-hashed passwords, role-based access (`user` / `admin`) |
| `cinemas` | Theater venues indexed by city |
| `screens` | Individual auditoriums inside a cinema with total seat capacity |
| `seats` | Per-seat records with type (`Regular`, `Premium`, `VIP`) and a `price_multiplier` |
| `movies` | Full movie catalog — genre, language, runtime, ratings, poster/banner URLs, trailer key |
| `shows` | Scheduled screenings linking a movie to a screen, with `base_price`, `available_seats`, and a live `surge_multiplier` |
| `bookings` | Transactional booking record per user per show, with status (`Pending` → `Confirmed` → `Cancelled`) |
| `tickets` | Individual seat within a booking, with the final computed price at time of purchase |
| `payments` | Payment method/status/transaction record linked one-to-one with a booking |
| `seat_holds` | Temporary checkout locks so selected seats cannot be grabbed by another user |
| `booking_snacks` | Composite-key junction table linking food add-ons to a booking |
| `waitlist` | Queue system for sold-out shows with auto-status updates (`Waiting`, `Notified`, `Auto-Booked`, `Expired`) |
| `loyalty_ledger` | Immutable ledger of points earned and spent, with a 60-day expiry per entry |
| `admin_audit_logs` | Audit trail for admin/system actions such as show changes, cancellations, and refunds |

### Performance Indexes

Targeted B-tree and partial indexes on all high-frequency join and filter columns (`shows.movie_id`, `shows.show_time`, `bookings.user_id`, `seats.screen_id`, `cinemas.city`, active seat holds, payments, etc.) keep queries fast under load.

### Database Views

- **`v_revenue_by_city`** — Aggregates confirmed booking revenue grouped by city. Used directly in the Admin Dashboard analytics panel.
- **`v_active_movies`** — Returns only movies that have at least one future show, used by the home page API.
- **`v_revenue_by_movie`** — Aggregates bookings, tickets sold, and revenue by movie.
- **`v_revenue_by_cinema`** — Aggregates bookings, tickets sold, and revenue by cinema.
- **`v_show_occupancy`** — Tracks booked seats, available seats, occupancy percentage, and surge multiplier per show.
- **`v_top_users`** — Ranks users by spend, bookings, and loyalty balance.

---

## Database Triggers & PL/pgSQL Functions

Two AFTER UPDATE triggers run automatically on the `bookings` table on every status change.

Two utility functions, `expire_seat_holds()` and `expire_pending_bookings()`, keep temporary checkout state clean.

### 1. `update_show_availability_and_surge`

Fires when a booking transitions to `Confirmed` or `Cancelled`. It:
- Decrements `available_seats` in the `shows` table by the exact ticket count in that booking.
- On cancellation, restores those seats.
- After every change, recomputes the `surge_multiplier` using tiered occupancy thresholds:

| Seats Remaining | Surge Multiplier |
|---|---|
| > 50% empty | 1.00× (base price) |
| 20–50% empty | 1.10× |
| 5–20% empty | 1.25× |
| < 5% empty | 1.50× |

This means a nearly sold-out show automatically charges higher prices after each confirmed/cancelled booking status change.

### 2. `grant_loyalty_points`

Fires when a booking is confirmed. Inserts a new row into the `loyalty_ledger` granting **50 points per ticket** with a **60-day expiry timestamp**. The ledger is append-only; spending and earning are separate records, ensuring a complete auditable history.

---

## Features

### Movie Discovery
- 15 blockbuster movies with full poster and banner images sourced from the TMDB Global Image CDN.
- Filter movies by genre (Action, Animation, Drama, Horror, Sci-Fi, Musical).
- Search movies by title from the navigation bar.
- Switch between 5 cities (Mumbai, Delhi, Hyderabad, Bangalore, Chennai) to see locally scheduled shows.
- Animated hero carousel auto-rotates through featured movies with genre pills, ratings, runtime, and a trailer launcher.

### Show Scheduling
- Shows are scheduled to run for the next 7 days across all cinemas and cities.
- Standard slot times (10:30 AM, 1:30 PM, 4:30 PM, 7:30 PM) displayed in IST.
- Show timings page lets users browse by date and filter by cinema chain.

### Seat Selection
- Visual, interactive seat grid rendered dynamically from the database.
- Seats are color-coded by type: Regular (green), Premium (blue), VIP (purple).
- Already-booked seats and active holds are non-selectable.
- Logged-in users create a temporary seat hold before checkout; expired holds are cleared when seat/booking APIs run.
- Computed final price per seat factors in: `base_price × surge_multiplier × seat.price_multiplier`.

### Checkout Flow
1. Review selected seats and their computed prices.
2. Add snacks from the food and beverage menu (stored in `booking_snacks`).
3. Apply loyalty points as a discount (1 point = ₹0.10 off, capped at ₹100).
4. Confirm booking — the backend wraps the operation in a PostgreSQL transaction: lock the show row, validate seats/holds, insert booking and tickets, confirm booking, record payment, convert holds.
5. The `UNIQUE(show_id, seat_id)` constraint on `tickets` is the final database-level double-booking protection.

### Loyalty Points System
- Users earn **50 points per ticket** on every confirmed booking.
- Points expire after **60 days** and are tracked in an immutable `loyalty_ledger`.
- Loyalty balance is shown at checkout and can be redeemed for a discount.

### Waitlist
- If a show is sold out, users can join the waitlist specifying how many seats they need.
- Waitlist entries have statuses: `Waiting`, `Notified`, `Auto-Booked`, `Expired`.

### AI-Assisted Booking Agent
An authenticated floating widget that helps users find a show and pre-fill checkout from a natural language command.

**Example:** *"Book 2 IMAX tickets for Dune in Mumbai tomorrow evening with popcorn"*

The agent runs a multi-step backend pipeline:
1. Extracts quantity, city, genre, movie title, time-of-day, and snack preferences from the message.
2. Queries the database for the best matching upcoming show.
3. Auto-selects the optimal available seats (VIP → Premium → Standard priority).
4. Returns a pre-filled checkout payload. The user still completes the normal checkout/payment flow.

If `GEMINI_API_KEY` is configured, Gemini is used for intent extraction. Without that key, the agent still supports clarification flow and database-backed search, but natural-language extraction is limited.

### Admin Dashboard
Role-gated behind `role = 'admin'` in the JWT payload.

- **Revenue Analytics** — Revenue breakdown by city pulled from the `v_revenue_by_city` database view.
- **Movie Management** — Add new movies to the catalog with poster URL, genre, runtime, and language.
- **Show Scheduling** — Create new scheduled shows by selecting a movie, cinema, screen, date, time, and base price.
- **Booking Overview** — Browse and manage all bookings across all users.
- **DBMS Reports API** — Backend exposes revenue/occupancy/top-user reports, though the current frontend dashboard only renders city revenue and booking inventory.

---

## Verified DBMS Notes

- Booking uses PostgreSQL's default `READ COMMITTED` isolation level; no explicit `SET TRANSACTION ISOLATION LEVEL` is configured.
- The booking route locks the `shows` row with `FOR UPDATE`, checks tickets and active holds inside the transaction, then inserts tickets.
- Temporary holds are protected by a partial unique index on active `(show_id, seat_id)` rows.
- Confirmed double-booking is ultimately prevented by the `UNIQUE(show_id, seat_id)` constraint in `tickets`.
- Expired holds are cleaned opportunistically by API calls through `expire_seat_holds()`, not by a cron job.
- Waitlist promotion during cancellation uses `FOR UPDATE SKIP LOCKED` for waiting rows.
- Payment is a demo/local record in the `payments` table, not a real payment gateway integration.

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v16+
- [PostgreSQL](https://www.postgresql.org/) installed and running

### 1. Database Setup

Connect to PostgreSQL and create the database:
```sql
CREATE DATABASE bookmyshow;
```

Initialize the schema, triggers, and base data:
```bash
cd backend
node resetDb.js   # Runs schema.sql, functions.sql, and seed.sql in sequence
node seedData.js  # Seeds 15 movies, cinemas, screens, seats, and 7 days of shows
```

### 2. Backend

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory:

```env
PORT=5000
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_NAME=bookmyshow
JWT_SECRET=your_jwt_secret_key
```

Start the server:
```bash
npm run dev
```

Backend API runs at `http://localhost:5000`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the app at `http://localhost:5173`.

---

## Admin Access

1. Register a normal user account from the frontend.
2. Promote the account to admin via `psql`:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
   ```
3. Sign out and sign back in. The **Admin Panel** link will appear in the navbar.

---

## Project Structure

```
ShowsNow--DBMS-project/
│
├── backend/
│   ├── db.js              # pg-pool connection with env-based config
│   ├── index.js           # Express API routes, booking transactions, admin reports, AI-assisted flow
│   ├── seedData.js        # Programmatic seeder: 15 movies, cinemas, shows
│   ├── resetDb.js         # Drops and recreates all tables from SQL files
│   └── package.json
│
├── frontend/
│   └── src/
│       ├── context/
│       │   └── AppContext.jsx      # Global auth state, city selector, search query
│       ├── components/
│       │   ├── Navbar.jsx          # City picker, search bar, Login/Register modal
│       │   ├── Footer.jsx
│       │   └── AutonomousBot.jsx   # Floating AI booking agent widget
│       └── pages/
│           ├── Home.jsx            # Hero carousel, genre tabs, movie grid
│           ├── MovieDetails.jsx    # Movie overview, cast, overview text
│           ├── ShowTimings.jsx     # Date picker, cinema filter, show slots
│           ├── SeatLayout.jsx      # Interactive seat grid with live pricing
│           ├── Checkout.jsx        # Cart, snack add-ons, loyalty redemption
│           ├── MyBookings.jsx      # User's booking history
│           ├── Waitlist.jsx        # Waitlist join and status view
│           ├── AdminDashboard.jsx  # Revenue, movies, shows, user management
│           ├── Category.jsx        # Events and Plays browsing
│           └── Stream.jsx          # Streaming content section
│
└── database/
    ├── schema.sql          # All CREATE TABLE, INDEX, and VIEW definitions
    ├── functions.sql       # PL/pgSQL triggers and expiry helpers
    ├── dbms_checks.sql     # Verification queries for DBMS demo/viva
    └── seed.sql            # Base cinemas, screens, seats, and snacks data
```
