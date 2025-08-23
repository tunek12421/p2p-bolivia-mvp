-- migrations/002_seed_data.sql

-- Insert test users
INSERT INTO users (id, email, phone, password_hash, is_verified, kyc_level)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'user1@test.com', '70000001', '$2a$10$YourHashedPasswordHere', true, 2),
    ('22222222-2222-2222-2222-222222222222', 'user2@test.com', '70000002', '$2a$10$YourHashedPasswordHere', true, 1);

-- Insert user profiles
INSERT INTO user_profiles (user_id, first_name, last_name, city)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Juan', 'Pérez', 'La Paz'),
    ('22222222-2222-2222-2222-222222222222', 'María', 'González', 'Santa Cruz');

-- Insert wallets
INSERT INTO wallets (user_id, currency, balance, locked_balance)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'BOB', 10000.00, 0),
    ('11111111-1111-1111-1111-111111111111', 'USD', 1000.00, 0),
    ('11111111-1111-1111-1111-111111111111', 'USDT', 500.00, 0),
    ('22222222-2222-2222-2222-222222222222', 'BOB', 5000.00, 0),
    ('22222222-2222-2222-2222-222222222222', 'USD', 500.00, 0),
    ('22222222-2222-2222-2222-222222222222', 'USDT', 100.00, 0);

-- Insert sample P2P orders
INSERT INTO p2p_orders (user_id, order_type, currency_from, currency_to, amount, remaining_amount, rate, payment_methods, status)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'SELL', 'USD', 'BOB', 100.00, 100.00, 6.90, ARRAY['bank_transfer', 'qr_simple'], 'ACTIVE'),
    ('22222222-2222-2222-2222-222222222222', 'BUY', 'USD', 'BOB', 50.00, 50.00, 6.85, ARRAY['bank_transfer'], 'ACTIVE');

-- Insert default deposit accounts for banking
INSERT INTO deposit_accounts (currency, account_holder, bank, account_number) VALUES
('BOB', 'P2P Bolivia SRL', 'Banco Nacional de Bolivia', '1234567890'),
('USD', 'P2P Bolivia SRL', 'Banco Nacional de Bolivia', '0987654321');