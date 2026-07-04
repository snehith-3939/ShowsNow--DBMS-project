# ShowsNow DBMS Project Notes

## What Improved In This Version

- Added lookup/reference tables for roles, seat types, booking statuses, waitlist statuses, payment statuses, payment methods, hold statuses, and audit actions.
- Added stronger `NOT NULL`, `CHECK`, `UNIQUE`, and foreign-key rules across core tables.
- Added `payments` so booking and payment are stored separately.
- Added `seat_holds` so selected seats can be temporarily locked before checkout.
- Added `admin_audit_logs` so important admin/system actions are traceable.
- Added report views for revenue by city/movie/cinema, show occupancy, and top users.
- Added expiry database functions for stale seat holds and old pending bookings.
- Fixed seeded shows so `available_seats` matches the screen capacity.

## DBMS Concepts Covered

- **Normalization:** users, movies, cinemas, screens, seats, shows, bookings, tickets, snacks, payments, waitlist, loyalty, audit logs are separated by responsibility.
- **Referential integrity:** foreign keys connect dependent data and prevent orphan records.
- **Entity integrity:** UUID primary keys uniquely identify every important entity.
- **Domain integrity:** lookup tables and checks restrict invalid statuses, roles, prices, quantities, and seat types.
- **Transaction management:** booking and cancellation use `BEGIN`, `COMMIT`, and `ROLLBACK`.
- **Concurrency control:** show rows are locked with `FOR UPDATE`; seat uniqueness is enforced by `UNIQUE(show_id, seat_id)`; waitlist uses `FOR UPDATE SKIP LOCKED`.
- **Triggers:** booking status changes update show availability, surge pricing, and loyalty points.
- **Views:** report views simplify analytics queries for the admin dashboard and viva.
- **Indexes:** high-use joins and filters have indexes for better performance.
- **Auditability:** admin/system activity is stored in `admin_audit_logs`.

## Good Viva Points

- The most important rule is enforced in the database, not only in JavaScript: one seat can be confirmed only once per show.
- If two users try to book the same seat, the database unique constraint is the final protection.
- `seat_holds` improves user experience by blocking seats temporarily during checkout.
- `payments` separates financial state from booking state, which is closer to real systems.
- Views make analytics readable and reusable without repeating large joins in application code.
- The loyalty ledger is append-only, which is better for audit history than updating one balance column.

## Useful Demo Queries

Run:

```bash
psql "$DATABASE_URL" -f database/dbms_checks.sql
```

For local PostgreSQL:

```bash
psql -U postgres -d bookmyshow -f database/dbms_checks.sql
```
