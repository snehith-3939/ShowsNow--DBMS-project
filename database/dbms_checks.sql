-- ShowsNow DBMS verification queries
-- Run after `npm run reset` and `npm run seed` from backend.

-- 1. Core referential integrity and double-booking guarantee.
SELECT conname, contype
FROM pg_constraint
WHERE conname IN (
  'tickets_show_id_seat_id_key',
  'booking_snacks_pkey',
  'waitlist_show_id_user_id_key'
)
ORDER BY conname;

-- 2. Active seat holds can block checkout without creating tickets.
SELECT show_id, seat_id, user_id, status, expires_at
FROM seat_holds
ORDER BY created_at DESC
LIMIT 10;

-- 3. Payment records attached to confirmed bookings.
SELECT b.booking_id, b.status AS booking_status, p.status AS payment_status,
       p.method, p.amount, p.transaction_ref
FROM bookings b
LEFT JOIN payments p ON b.booking_id = p.booking_id
ORDER BY b.booking_time DESC
LIMIT 10;

-- 4. Revenue/analytics views for DBMS reporting.
SELECT * FROM v_revenue_by_city ORDER BY revenue DESC;
SELECT * FROM v_revenue_by_movie ORDER BY revenue DESC, tickets_sold DESC LIMIT 10;
SELECT * FROM v_revenue_by_cinema ORDER BY revenue DESC, tickets_sold DESC LIMIT 10;
SELECT * FROM v_show_occupancy ORDER BY occupancy_percent DESC, show_time ASC LIMIT 10;
SELECT * FROM v_top_users ORDER BY total_spent DESC, confirmed_bookings DESC LIMIT 10;

-- 5. Admin/system audit history.
SELECT action, entity_type, entity_id, details, created_at
FROM admin_audit_logs
ORDER BY created_at DESC
LIMIT 20;

-- 6. Expiry routines used by the backend.
SELECT expire_seat_holds() AS expired_holds;
SELECT expire_pending_bookings() AS expired_pending_bookings;
