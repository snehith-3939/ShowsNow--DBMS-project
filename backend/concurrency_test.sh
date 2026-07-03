#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:5000}"
: "${SHOW_ID:?Set SHOW_ID to the show UUID you want to test}"
: "${SEAT_ID:?Set SEAT_ID to the seat UUID you want to test}"
: "${TOKEN:?Set TOKEN to a valid JWT}"

for _ in $(seq 1 20); do
  curl -s -X POST "$BASE_URL/api/bookings" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"show_id\":\"$SHOW_ID\",\"seat_ids\":[\"$SEAT_ID\"],\"snack_ids\":[]}" >/dev/null &
done

wait

cat <<SQL
Run this SQL to verify the database guarantee:

SELECT COUNT(*) AS confirmed_tickets
FROM tickets t
JOIN bookings b ON t.booking_id = b.booking_id
WHERE t.show_id = '$SHOW_ID'
  AND t.seat_id = '$SEAT_ID'
  AND b.status = 'Confirmed';

Expected result: 1
SQL
