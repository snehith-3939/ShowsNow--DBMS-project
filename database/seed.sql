-- Seed Data for BookMyShow Clone

-- Insert Users
INSERT INTO users (user_id, name, email, phone, city) VALUES
('11111111-1111-1111-1111-111111111111', 'John Doe', 'john@example.com', '1234567890', 'Mumbai'),
('22222222-2222-2222-2222-222222222222', 'Jane Smith', 'jane@example.com', '0987654321', 'Mumbai'),
('33333333-3333-3333-3333-333333333333', 'Alice Johnson', 'alice@example.com', '1122334455', 'Delhi');

-- Insert Cinemas
INSERT INTO cinemas (cinema_id, name, city, address) VALUES
('c1111111-1111-1111-1111-111111111111', 'PVR Andheri', 'Mumbai', 'Andheri West'),
('c2222222-2222-2222-2222-222222222222', 'INOX Nariman Point', 'Mumbai', 'Nariman Point'),
('c3333333-3333-3333-3333-333333333333', 'PVR Select Citywalk', 'Delhi', 'Saket'),
('c4444444-4444-4444-4444-444444444444', 'Cinepolis DLF Place', 'Delhi', 'Vasant Kunj'),
('c5555555-5555-5555-5555-555555555555', 'PVR Forum Mall', 'Bangalore', 'Koramangala'),
('c6666666-6666-6666-6666-666666666666', 'INOX Garuda Mall', 'Bangalore', 'Magrath Road'),
('c7777777-7777-7777-7777-777777777777', 'Prasads IMAX', 'Hyderabad', 'Necklace Road'),
('c8888888-8888-8888-8888-888888888888', 'PVR Next Galleria', 'Hyderabad', 'Punjagutta'),
('c9999999-9999-9999-9999-999999999999', 'SPI Cinemas Sathyam', 'Chennai', 'Royapettah'),
('caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PVR VR Mall', 'Chennai', 'Anna Nagar');

-- Insert Screens
INSERT INTO screens (screen_id, cinema_id, name, total_seats) VALUES
('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'Screen 1 (IMAX)', 50),
('b2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 'Screen 2', 40),
('b3333333-3333-3333-3333-333333333333', 'c2222222-2222-2222-2222-222222222222', 'Screen A', 60),
('b4444444-4444-4444-4444-444444444444', 'c3333333-3333-3333-3333-333333333333', 'Audi 1 (Dolby)', 50),
('b5555555-5555-5555-5555-555555555555', 'c3333333-3333-3333-3333-333333333333', 'Audi 2', 50),
('b6666666-6666-6666-6666-666666666666', 'c4444444-4444-4444-4444-444444444444', 'Screen 1', 50),
('b7777777-7777-7777-7777-777777777777', 'c5555555-5555-5555-5555-555555555555', 'PVR PXL', 50),
('b8888888-8888-8888-8888-888888888888', 'c6666666-6666-6666-6666-666666666666', 'Screen 4', 50),
('b9999999-9999-9999-9999-999999999999', 'c7777777-7777-7777-7777-777777777777', 'Large Screen', 50),
('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'c8888888-8888-8888-8888-888888888888', 'Screen 1', 50),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'c9999999-9999-9999-9999-999999999999', 'Santham', 50),
('bccccccc-cccc-cccc-cccc-cccccccccccc', 'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Screen 2', 50);

-- Insert Seats for ALL screens (5 rows A-E, 10 seats each)
DO $$
DECLARE
    s RECORD;
    r RECORD;
    i INT;
BEGIN
    FOR s IN SELECT screen_id FROM screens LOOP
        FOR r IN SELECT unnest(ARRAY['A','B','C','D','E']) AS row_name LOOP
            FOR i IN 1..10 LOOP
                INSERT INTO seats (screen_id, row_no, seat_no, seat_type, price_multiplier)
                VALUES (
                    s.screen_id, 
                    r.row_name, 
                    i, 
                    CASE WHEN r.row_name IN ('A','B') THEN 'Regular' 
                         WHEN r.row_name IN ('C','D') THEN 'Premium' 
                         ELSE 'VIP' END,
                    CASE WHEN r.row_name IN ('A','B') THEN 1.00 
                         WHEN r.row_name IN ('C','D') THEN 1.50 
                         ELSE 2.00 END
                );
            END LOOP;
        END LOOP;
    END LOOP;
END $$;

-- Insert Snacks
INSERT INTO snacks (snack_id, name, description, price) VALUES
('e1111111-1111-1111-1111-111111111111', 'Large Popcorn', 'Salted large popcorn', 250.00),
('e2222222-2222-2222-2222-222222222222', 'Coke', '500ml Coca Cola', 100.00),
('e3333333-3333-3333-3333-333333333333', 'Nachos', 'Cheese Nachos', 300.00);
