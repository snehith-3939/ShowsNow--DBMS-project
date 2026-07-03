<div align="center">

# ShowsNow 🎬

### A full-stack, production-grade movie ticket booking platform built with React, Node.js, and PostgreSQL.

*Architected to mirror BookMyShow's core booking engine — from tiered surge pricing and real-time seat locking to a loyalty ledger and an AI booking agent.*

</div>

---

## What This Project Is

ShowsNow is not a tutorial clone. It is a working, database-driven booking platform built as part of a DBMS course project, designed to demonstrate mastery of relational database engineering, transactional integrity, and modern full-stack development.

The platform supports multi-city movie browsing, interactive seat selection, a full checkout flow with snack bundling and loyalty points redemption, a role-gated admin dashboard, a waitlist system, and an autonomous AI booking agent — all backed by a carefully normalized PostgreSQL schema with triggers, views, and enforced constraints.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 (Vite), React Router v6, Context API, Vanilla CSS |
| **Backend** | Node.js, Express.js, REST API |
| **Database** | PostgreSQL, PL/pgSQL triggers and functions |
| **Auth** | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` password hashing |
| **Image CDN** | TMDB Global Image CDN (`image.tmdb.org`) |
| **Config** | `dotenv`, `pg` (node-postgres), `pg-pool` |

---

## Architecture

### Database Schema

The schema is fully normalized with 11 tables and enforces referential integrity with `ON DELETE CASCADE` throughout:

```
users ──────────────────────────────────────────────────────────────┐
                                                                     │
cinemas → screens → seats ──────────────────────────────────────────│
                   └──→ shows ──→ bookings ──→ tickets ─────────────┘
                           │                └──→ booking_snacks
                           └──→ waitlist
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
| `booking_snacks` | Composite-key junction table linking food add-ons to a booking |
| `waitlist` | Queue system for sold-out shows with auto-status updates (`Waiting`, `Notified`, `Auto-Booked`, `Expired`) |
| `loyalty_ledger` | Immutable ledger of points earned and spent, with a 60-day expiry per entry |

### Performance Indexes

9 targeted B-tree indexes on all high-frequency join and filter columns (`shows.movie_id`, `shows.show_time`, `bookings.user_id`, `seats.screen_id`, `cinemas.city`, etc.) to keep queries fast under load.

### Database Views

- **`v_revenue_by_city`** — Aggregates confirmed booking revenue grouped by city. Used directly in the Admin Dashboard analytics panel.
- **`v_active_movies`** — Returns only movies that have at least one future show, used by the home page API.

---

## Database Triggers & PL/pgSQL Functions

Two AFTER UPDATE triggers run automatically on the `bookings` table on every status change.

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

This means a nearly sold-out show automatically charges higher prices — entirely at the database level, with zero application code involved.

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
- Shows are scheduled to run for the next 5 days across all cinemas and cities.
- Standard slot times (10:30 AM, 1:30 PM, 4:30 PM, 7:30 PM) displayed in IST.
- Show timings page lets users browse by date and filter by cinema chain.

### Seat Selection
- Visual, interactive seat grid rendered dynamically from the database.
- Seats are color-coded by type: Standard (grey), Premium (blue), VIP (gold).
- Already-booked seats are locked and non-selectable.
- Computed final price per seat factors in: `base_price × surge_multiplier × seat.price_multiplier`.

### Checkout Flow
1. Review selected seats and their computed prices.
2. Add snacks from the food and beverage menu (stored in `booking_snacks`).
3. Apply loyalty points as a discount (1 point = ₹0.25 off).
4. Confirm booking — the backend wraps the entire operation in a PostgreSQL transaction: `INSERT tickets` → `UPDATE booking status` → trigger fires for seat count and loyalty points.

### Loyalty Points System
- Users earn **50 points per ticket** on every confirmed booking.
- Points expire after **60 days** and are tracked in an immutable `loyalty_ledger`.
- Loyalty balance is shown at checkout and can be redeemed for a discount.

### Waitlist
- If a show is sold out, users can join the waitlist specifying how many seats they need.
- Waitlist entries have statuses: `Waiting`, `Notified`, `Auto-Booked`, `Expired`.

### AI Autonomous Booking Agent
An NLP-powered floating widget that lets users book tickets with a single natural language command.

**Example:** *"Book 2 IMAX tickets for Dune in Mumbai tomorrow evening with popcorn"*

The agent runs a multi-step pipeline on the backend:
1. Extracts quantity, city, genre, movie title, time-of-day, and snack preferences from the message.
2. Queries the database for the best matching upcoming show.
3. Auto-selects the optimal available seats (VIP → Premium → Standard priority).
4. Returns a fully pre-filled checkout payload, dropping the user directly at payment confirmation.

### Admin Dashboard
Role-gated behind `role = 'admin'` in the JWT payload.

- **Revenue Analytics** — Revenue breakdown by city pulled from the `v_revenue_by_city` database view.
- **Movie Management** — Add new movies to the catalog with poster URL, genre, runtime, and language.
- **Show Scheduling** — Create new scheduled shows by selecting a movie, cinema, screen, date, time, and base price.
- **Booking Overview** — Browse and manage all bookings across all users.
- **User Management** — View registered users.

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v16+
- [PostgreSQL](https://www.postgresql.org/) installed and running

## Deployment

This repo is configured for a single Render deploy:

- **Web service:** Node/Express serves both `/api/*` and the built React app from `frontend/dist`.
- **Database:** Render PostgreSQL, connected through `DATABASE_URL`.
- **Pre-deploy step:** `npm run deploy:db --prefix backend` creates or migrates the schema, installs triggers/views, and seeds demo data on a fresh database.

Deploy steps:

1. Open [Render Blueprints](https://dashboard.render.com/blueprints) and connect this GitHub repo.
2. Render will detect `render.yaml`.
3. Fill optional `TMDB_API_KEY` and `GEMINI_API_KEY` when prompted, or leave them blank. The app has fallback movie data and the AI agent gracefully degrades without Gemini.
4. Create the Blueprint and wait for the first deploy to finish.

The app will be available at the Render service URL, usually:

```text
https://showsnow.onrender.com
```

If that subdomain is already taken, Render will show the final URL in the service dashboard.

### 1. Database Setup

Connect to PostgreSQL and create the database:
```sql
CREATE DATABASE bookmyshow;
```

Initialize the schema, triggers, and base data:
```bash
cd backend
node resetDb.js   # Runs schema.sql, functions.sql, and seed.sql in sequence
node seedData.js  # Seeds 15 movies, cinemas, screens, seats, and 5 days of shows
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
│   ├── index.js           # All Express API routes and AI agent logic (~870 lines)
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
    ├── functions.sql       # PL/pgSQL triggers: surge pricing + loyalty ledger
    └── seed.sql            # Base cinemas, screens, seats, and snacks data
```
