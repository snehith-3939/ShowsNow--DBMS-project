# BookMyShow Clone

A full-stack, production-ready movie ticket booking platform inspired by BookMyShow. This project features a robust PostgreSQL database, a secure Node.js/Express backend, and a dynamic React frontend.

It includes advanced features like an **AI Autonomous Booking Agent** that can process natural language requests to book tickets and snacks, and a comprehensive **Admin Dashboard** for managing the theater's inventory and analyzing transactions.

---

## ✨ Version 2.0: BookMyShow Experience Overhaul

We've completely revamped the platform to deliver a premium, production-grade BookMyShow experience:
- **Dynamic Movie Catalog:** Integrated 15 blockbuster movies with ultra-fast, unblocked poster and banner images fetched directly from the **TMDB Global Image CDN**.
- **Realistic Cinema Scheduling:** Shows are now auto-scheduled using real-world cinema slots (e.g., 10:30 AM, 1:30 PM, 4:30 PM) ensuring they are always in the future, correctly formatted in IST.
- **Advanced UI/UX:** A brand new interactive `Home.jsx` featuring a dynamic hero carousel with blurred backgrounds, genre filter tabs, premium movie cards with hover "Book Now" overlays, and format badges (IMAX, 4DX, 2D).
- **Bulletproof Architecture:** Fixed core database scheduling bugs by introducing staggered minute-offsets, solving silent `UNIQUE(screen_id, show_time)` constraint failures.

---

## ⚡ Core Features

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React (Vite), React Router DOM, Context API, Vanilla CSS |
| **Backend** | Node.js, Express.js |
| **Database** | PostgreSQL |
| **Auth** | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` |
| **Config** | `dotenv` |

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- [PostgreSQL](https://www.postgresql.org/) installed and running locally

### 1. Database Setup

1. Open **pgAdmin** or `psql` and create a new database named `bookmyshow`.
2. Run the schema file to create all tables:
   ```bash
   psql -U postgres -d bookmyshow -f database/schema.sql
   ```
3. *(Optional)* Seed the database with sample data:
   ```bash
   psql -U postgres -d bookmyshow -f database/seed.sql
   ```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` folder:

```env
PORT=5000
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_NAME=bookmyshow
JWT_SECRET=your_super_secret_jwt_key
```

Start the backend server:

```bash
npm run dev
```

The API will be available at `http://localhost:5000`.

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open your browser at `http://localhost:5173`.

---

## 🛡️ Admin Access

1. Register a new user account via the frontend.
2. In pgAdmin (or psql), promote your account to admin:
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'your@email.com';
   ```
3. **Sign out and sign back in.** An **Admin Panel** button will appear in the top navbar.

---

## 📂 Project Structure

```text
archives/
├── readme.md
│
├── backend/
│   ├── .env                  # Environment variables (DB, JWT secret)
│   ├── db.js                 # PostgreSQL connection pool
│   ├── index.js              # Express app: all API routes & AI agent logic
│   ├── seedData.js           # Script to programmatically seed the database
│   ├── migrate_admin.js      # Migration: adds 'role' column to users
│   ├── promote.js            # Utility: promotes a user to admin role
│   ├── package.json
│   └── node_modules/
│
├── frontend/
│   ├── index.html
│   ├── package.json
│   └── src/
│       ├── main.jsx          # App entry point
│       ├── App.jsx           # Route definitions
│       ├── index.css         # Global design system & CSS variables
│       ├── App.css
│       ├── assets/
│       ├── context/
│       │   └── AppContext.jsx     # Global state: auth, city, search
│       ├── components/
│       │   ├── Navbar.jsx         # Top nav, city picker, Login/Register modal
│       │   ├── Footer.jsx         # Site footer
│       │   └── AutonomousBot.jsx  # AI booking agent floating widget
│       └── pages/
│           ├── Home.jsx           # Landing page: movie listings & carousel
│           ├── MovieDetails.jsx   # Movie overview & cast info
│           ├── ShowTimings.jsx    # Date & cinema-wise show timings
│           ├── SeatLayout.jsx     # Interactive seat selection grid
│           ├── Checkout.jsx       # Cart, snacks, payment confirmation
│           ├── AdminDashboard.jsx # Admin panel: stats, movies, shows, bookings
│           ├── Category.jsx       # Events/Plays category listings
│           └── Stream.jsx         # Streaming content page
│
└── database/
    ├── schema.sql            # All table definitions (CREATE TABLE, constraints)
    ├── seed.sql              # Sample data (movies, cinemas, shows, seats)
    └── functions.sql         # PostgreSQL stored functions & triggers
```

---

## 🗄️ Database Schema

The database is designed with relational integrity and transactional safety. Key tables:

| Table | Purpose |
|---|---|
| `users` | Registered users with hashed passwords and loyalty points |
| `movies` | Movie catalog (title, genre, language, ratings) |
| `cinemas` | Theaters with city and address |
| `screens` | Individual screens inside a cinema |
| `seats` | Seat layout per screen (type: Standard / Premium / VIP) |
| `shows` | Scheduled screenings linking a movie to a screen and time |
| `bookings` | Transaction record per user per show |
| `tickets` | Individual seat tickets within a booking |
| `snacks` | Available food and beverage items |
| `booking_snacks` | Snack add-ons linked to a booking |
| `waitlist` | Waitlist entries for sold-out shows |

---

## 🤖 AI Booking Agent — How It Works

The agent runs at `POST /api/autonomous-agent` (JWT-protected) and parses the user's natural language prompt through the following pipeline:

1. **Extract Quantity** — e.g., "2 tickets", "three seats"
2. **Extract City** — e.g., "in Mumbai", "Bengaluru"
3. **Extract Genre** — e.g., "action movie", "comedy"
4. **Extract Time** — e.g., "at 6 PM", "evening", "tonight"
5. **Extract Movie Title** — e.g., "for Zootopia 2"
6. **Extract Snack** — e.g., "with nachos", "popcorn"
7. **Search Database** — finds the best matching upcoming show using filtered SQL
8. **Auto-select Seats** — picks the best available seats (VIP → Premium → Standard)
9. **Return Payload** — sends a pre-filled cart payload directly to the Checkout page
