-- Database Triggers and Functions for ShowsNow

CREATE OR REPLACE FUNCTION recompute_show_surge(p_show_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_seats INTEGER;
    v_available_seats INTEGER;
    v_percent_empty FLOAT;
BEGIN
    SELECT sc.total_seats, s.available_seats
    INTO v_total_seats, v_available_seats
    FROM shows s
    JOIN screens sc ON s.screen_id = sc.screen_id
    WHERE s.show_id = p_show_id;

    IF v_total_seats IS NULL OR v_total_seats = 0 THEN
        RETURN;
    END IF;

    v_percent_empty := CAST(v_available_seats AS FLOAT) / v_total_seats;

    UPDATE shows
    SET surge_multiplier = CASE
        WHEN v_percent_empty < 0.05 THEN 1.50
        WHEN v_percent_empty < 0.20 THEN 1.25
        WHEN v_percent_empty < 0.50 THEN 1.10
        ELSE 1.00
    END
    WHERE show_id = p_show_id;
END;
$$ LANGUAGE plpgsql;

-- Booking status trigger: keeps show inventory and surge pricing consistent.
CREATE OR REPLACE FUNCTION update_show_availability_and_surge()
RETURNS TRIGGER AS $$
DECLARE
    v_tickets_booked INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_tickets_booked
    FROM tickets
    WHERE booking_id = NEW.booking_id;

    IF NEW.status = 'Confirmed' AND OLD.status != 'Confirmed' THEN
        UPDATE shows
        SET available_seats = available_seats - v_tickets_booked
        WHERE show_id = NEW.show_id;

        PERFORM recompute_show_surge(NEW.show_id);

    ELSIF NEW.status = 'Cancelled' AND OLD.status = 'Confirmed' THEN
        UPDATE shows
        SET available_seats = available_seats + v_tickets_booked
        WHERE show_id = NEW.show_id;

        PERFORM recompute_show_surge(NEW.show_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_booking_status_change ON bookings;
CREATE TRIGGER trigger_booking_status_change
AFTER UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION update_show_availability_and_surge();

-- Loyalty ledger trigger: grants 50 points per confirmed ticket.
CREATE OR REPLACE FUNCTION grant_loyalty_points()
RETURNS TRIGGER AS $$
DECLARE
    ticket_count INTEGER;
BEGIN
    IF NEW.status = 'Confirmed' AND OLD.status != 'Confirmed' THEN
        SELECT COUNT(*) INTO ticket_count
        FROM tickets
        WHERE booking_id = NEW.booking_id;

        IF ticket_count > 0 THEN
            INSERT INTO loyalty_ledger (user_id, booking_id, points_earned, expires_at)
            VALUES (NEW.user_id, NEW.booking_id, ticket_count * 50, CURRENT_TIMESTAMP + INTERVAL '60 days');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_grant_loyalty_points ON bookings;
CREATE TRIGGER trigger_grant_loyalty_points
AFTER UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION grant_loyalty_points();

-- Marks expired active seat holds so their partial unique index stops blocking seats.
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

-- Expire stale pending bookings. Pending bookings do not reduce available_seats,
-- but this keeps the status lifecycle clean for reports.
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
