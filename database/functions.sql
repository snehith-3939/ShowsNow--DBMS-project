-- Database Triggers and Functions for BookMyShow Clone

-- 1. Dynamic Pricing (Surge Pricing Trigger)
-- When a booking is confirmed, update available_seats in shows.
-- If (total_seats - available_seats)/total_seats > 0.8, set is_surge_active = true.

CREATE OR REPLACE FUNCTION update_show_availability_and_surge()
RETURNS TRIGGER AS $$
DECLARE
    v_total_seats INTEGER;
    v_available_seats INTEGER;
    v_screen_id UUID;
    v_tickets_booked INTEGER;
BEGIN
    IF NEW.status = 'Confirmed' AND OLD.status != 'Confirmed' THEN
        -- Get screen id
        SELECT screen_id INTO v_screen_id FROM shows WHERE show_id = NEW.show_id;
        
        -- Get total seats
        SELECT total_seats INTO v_total_seats FROM screens WHERE screen_id = v_screen_id;
        
        -- Get tickets booked count for this booking
        SELECT COUNT(*) INTO v_tickets_booked FROM tickets WHERE booking_id = NEW.booking_id;
        
        -- Update available seats
        UPDATE shows SET available_seats = available_seats - v_tickets_booked
        WHERE show_id = NEW.show_id
        RETURNING available_seats INTO v_available_seats;
        
        -- Check surge condition (Tiered Occupancy Surge)
        DECLARE
            v_percent_empty FLOAT;
        BEGIN
            v_percent_empty := CAST(v_available_seats AS FLOAT) / v_total_seats;
            IF v_percent_empty < 0.05 THEN
                UPDATE shows SET surge_multiplier = 1.50 WHERE show_id = NEW.show_id;
            ELSIF v_percent_empty < 0.20 THEN
                UPDATE shows SET surge_multiplier = 1.25 WHERE show_id = NEW.show_id;
            ELSIF v_percent_empty < 0.50 THEN
                UPDATE shows SET surge_multiplier = 1.10 WHERE show_id = NEW.show_id;
            ELSE
                UPDATE shows SET surge_multiplier = 1.00 WHERE show_id = NEW.show_id;
            END IF;
        END;
        
    ELSIF NEW.status = 'Cancelled' AND OLD.status = 'Confirmed' THEN
        -- Get tickets booked count for this cancelled booking
        SELECT COUNT(*) INTO v_tickets_booked FROM tickets WHERE booking_id = NEW.booking_id;
        
        -- Add seats back
        UPDATE shows SET available_seats = available_seats + v_tickets_booked
        WHERE show_id = NEW.show_id
        RETURNING available_seats INTO v_available_seats;
        
        -- Recalculate surge after cancellation
        SELECT total_seats INTO v_total_seats FROM screens WHERE screen_id = (SELECT screen_id FROM shows WHERE show_id = NEW.show_id);
        
        DECLARE
            v_percent_empty FLOAT;
        BEGIN
            v_percent_empty := CAST(v_available_seats AS FLOAT) / v_total_seats;
            IF v_percent_empty < 0.05 THEN
                UPDATE shows SET surge_multiplier = 1.50 WHERE show_id = NEW.show_id;
            ELSIF v_percent_empty < 0.20 THEN
                UPDATE shows SET surge_multiplier = 1.25 WHERE show_id = NEW.show_id;
            ELSIF v_percent_empty < 0.50 THEN
                UPDATE shows SET surge_multiplier = 1.10 WHERE show_id = NEW.show_id;
            ELSE
                UPDATE shows SET surge_multiplier = 1.00 WHERE show_id = NEW.show_id;
            END IF;
        END;

    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_booking_status_change
AFTER UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION update_show_availability_and_surge();

-- 2. Loyalty Points Ledger Trigger
-- When a booking is Confirmed, grant 50 points PER TICKET to the user, expiring in 60 days.
CREATE OR REPLACE FUNCTION grant_loyalty_points()
RETURNS TRIGGER AS $$
DECLARE
    ticket_count INTEGER;
BEGIN
    IF NEW.status = 'Confirmed' AND OLD.status != 'Confirmed' THEN
        -- Count how many tickets are in this booking
        SELECT COUNT(*) INTO ticket_count FROM tickets WHERE booking_id = NEW.booking_id;
        
        -- Insert 50 points * ticket_count into the ledger
        IF ticket_count > 0 THEN
            INSERT INTO loyalty_ledger (user_id, booking_id, points_earned, expires_at)
            VALUES (NEW.user_id, NEW.booking_id, ticket_count * 50, CURRENT_TIMESTAMP + INTERVAL '60 days');
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_grant_loyalty_points
AFTER UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION grant_loyalty_points();
