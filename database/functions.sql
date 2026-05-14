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
        
        -- Check surge condition (e.g. less than 20% seats left)
        IF CAST(v_available_seats AS FLOAT) / v_total_seats < 0.2 THEN
            UPDATE shows SET is_surge_active = TRUE WHERE show_id = NEW.show_id;
        END IF;
        
    ELSIF NEW.status = 'Cancelled' AND OLD.status = 'Confirmed' THEN
        -- Get tickets booked count for this cancelled booking
        SELECT COUNT(*) INTO v_tickets_booked FROM tickets WHERE booking_id = NEW.booking_id;
        
        -- Add seats back
        UPDATE shows SET available_seats = available_seats + v_tickets_booked
        WHERE show_id = NEW.show_id
        RETURNING available_seats INTO v_available_seats;
        
        -- Turn off surge if we go above 20% available again
        SELECT total_seats INTO v_total_seats FROM screens WHERE screen_id = (SELECT screen_id FROM shows WHERE show_id = NEW.show_id);
        IF CAST(v_available_seats AS FLOAT) / v_total_seats >= 0.2 THEN
            UPDATE shows SET is_surge_active = FALSE WHERE show_id = NEW.show_id;
        END IF;

        -- Waitlist logic
        -- Let's notify the first person in the waitlist who requested <= available seats
        UPDATE waitlist 
        SET status = 'Notified' 
        WHERE waitlist_id = (
            SELECT waitlist_id FROM waitlist 
            WHERE show_id = NEW.show_id 
              AND status = 'Waiting' 
              AND requested_seats <= v_available_seats
            ORDER BY joined_at ASC LIMIT 1
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_booking_status_change
AFTER UPDATE ON bookings
FOR EACH ROW
EXECUTE FUNCTION update_show_availability_and_surge();
