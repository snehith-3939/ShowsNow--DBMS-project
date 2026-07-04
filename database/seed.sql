-- Seed Data for BookMyShow Clone

-- Insert Users
INSERT INTO users (user_id, name, email, phone, city) VALUES
('11111111-1111-1111-1111-111111111111', 'John Doe', 'john@example.com', '1234567890', 'Mumbai'),
('22222222-2222-2222-2222-222222222222', 'Jane Smith', 'jane@example.com', '0987654321', 'Mumbai'),
('33333333-3333-3333-3333-333333333333', 'Alice Johnson', 'alice@example.com', '1122334455', 'Delhi');

-- Dynamic Generation for Massive Scale and Varied Seat Matrices
DO $$
DECLARE
    city_names TEXT[] := ARRAY['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai', 'Pune', 'Chandigarh', 'Kolkata'];
    cinema_brands TEXT[] := ARRAY['PVR', 'INOX', 'Cinepolis', 'Carnival', 'Miraj', 'Asian', 'Mukta A2'];
    curr_city TEXT;
    curr_brand TEXT;
    c_id UUID;
    s_id UUID;
    i INT;
    j INT;
    layout_type INT;
    r RECORD;
    seat_num INT;
    s_type TEXT;
    p_mult NUMERIC;
BEGIN
    -- Generate 8 cinemas for each city
    FOREACH curr_city IN ARRAY city_names LOOP
        FOR i IN 1..8 LOOP
            curr_brand := cinema_brands[1 + (random() * (array_length(cinema_brands, 1) - 1))::INT];
            c_id := gen_random_uuid();
            
            INSERT INTO cinemas (cinema_id, name, city, address) 
            VALUES (c_id, curr_brand || ' ' || curr_city || ' Multiplex ' || i, curr_city, curr_city || ' Premium Area ' || i);
            
            -- Generate 3 screens per cinema
            FOR j IN 1..3 LOOP
                s_id := gen_random_uuid();
                layout_type := j % 4; -- 0 to 3
                
                IF layout_type = 1 THEN
                    -- MODEL 1: Standard 150-seat grid (10 rows, 15 seats)
                    INSERT INTO screens (screen_id, cinema_id, name, total_seats) VALUES (s_id, c_id, 'Screen ' || j || ' (Standard)', 150);
                    FOR r IN SELECT unnest(ARRAY['A','B','C','D','E','F','G','H','I','J']) AS row_name LOOP
                        FOR seat_num IN 1..15 LOOP
                            IF r.row_name IN ('A','B','C') THEN s_type := 'Regular'; p_mult := 1.0;
                            ELSIF r.row_name IN ('D','E','F','G','H') THEN s_type := 'Premium'; p_mult := 1.5;
                            ELSE s_type := 'VIP'; p_mult := 2.5; END IF;
                            INSERT INTO seats (screen_id, row_no, seat_no, seat_type, price_multiplier) VALUES (s_id, r.row_name, seat_num, s_type, p_mult);
                        END LOOP;
                    END LOOP;

                ELSIF layout_type = 2 THEN
                    -- MODEL 2: Wide Premium (6 rows, 25 seats). Top 2 rows VIP.
                    INSERT INTO screens (screen_id, cinema_id, name, total_seats) VALUES (s_id, c_id, 'Screen ' || j || ' (Wide Premium)', 150);
                    FOR r IN SELECT unnest(ARRAY['A','B','C','D','E','F']) AS row_name LOOP
                        FOR seat_num IN 1..25 LOOP
                            IF r.row_name IN ('A','B','C','D') THEN s_type := 'Premium'; p_mult := 1.5;
                            ELSE s_type := 'VIP'; p_mult := 3.0; END IF;
                            INSERT INTO seats (screen_id, row_no, seat_no, seat_type, price_multiplier) VALUES (s_id, r.row_name, seat_num, s_type, p_mult);
                        END LOOP;
                    END LOOP;

                ELSIF layout_type = 3 THEN
                    -- MODEL 3: Split Aisle (10 rows, 14 seats, skipping 7 and 8)
                    INSERT INTO screens (screen_id, cinema_id, name, total_seats) VALUES (s_id, c_id, 'Screen ' || j || ' (Split Aisle)', 140);
                    FOR r IN SELECT unnest(ARRAY['A','B','C','D','E','F','G','H','I','J']) AS row_name LOOP
                        FOR seat_num IN 1..16 LOOP
                            IF seat_num IN (7, 8) THEN CONTINUE; END IF; -- The Aisle!
                            IF r.row_name IN ('A','B','C','D') THEN s_type := 'Regular'; p_mult := 1.0;
                            ELSIF r.row_name IN ('E','F','G','H') THEN s_type := 'Premium'; p_mult := 1.5;
                            ELSE s_type := 'VIP'; p_mult := 2.5; END IF;
                            INSERT INTO seats (screen_id, row_no, seat_no, seat_type, price_multiplier) VALUES (s_id, r.row_name, seat_num, s_type, p_mult);
                        END LOOP;
                    END LOOP;

                ELSE
                    -- MODEL 4 (layout_type = 0): Intimate Luxe (5 rows, 10 seats, ALL VIP)
                    INSERT INTO screens (screen_id, cinema_id, name, total_seats) VALUES (s_id, c_id, 'Screen ' || j || ' (Luxe Recliners)', 50);
                    FOR r IN SELECT unnest(ARRAY['A','B','C','D','E']) AS row_name LOOP
                        FOR seat_num IN 1..10 LOOP
                            INSERT INTO seats (screen_id, row_no, seat_no, seat_type, price_multiplier) VALUES (s_id, r.row_name, seat_num, 'VIP', 3.5);
                        END LOOP;
                    END LOOP;

                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- Insert Snacks
INSERT INTO snacks (snack_id, name, description, price) VALUES
('e1111111-1111-1111-1111-111111111111', 'Large Popcorn', 'Salted large popcorn', 250.00),
('e2222222-2222-2222-2222-222222222222', 'Coke', '500ml Coca Cola', 100.00),
('e3333333-3333-3333-3333-333333333333', 'Nachos', 'Cheese Nachos', 300.00),
('e4444444-4444-4444-4444-444444444444', 'Caramel Popcorn', 'Sweet caramel coated popcorn', 280.00),
('e5555555-5555-5555-5555-555555555555', 'Cold Coffee', 'Freshly brewed iced coffee', 150.00),
('e6666666-6666-6666-6666-666666666666', 'French Fries', 'Crispy salted fries', 180.00),
('e7777777-7777-7777-7777-777777777777', 'Loaded Burger', 'Double patty veg burger', 250.00),
('e8888888-8888-8888-8888-888888888888', 'Iced Tea', 'Lemon iced tea cooler', 120.00),
('e9999999-9999-9999-9999-999999999999', 'Combo 1 (Pop + Coke)', 'Large Popcorn and a Coke', 320.00),
('eaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Bottled Water', '1L Mineral Water', 50.00);
