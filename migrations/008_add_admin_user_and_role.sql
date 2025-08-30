-- migrations/008_add_admin_user_and_role.sql

-- Add role column to users table (if it doesn't exist)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- Update existing users with appropriate roles
UPDATE users SET role = 'user' WHERE is_cashier = false;
UPDATE users SET role = 'cashier' WHERE is_cashier = true;

-- Create admin user with unique ID
INSERT INTO users (id, email, phone, password_hash, is_verified, is_active, is_cashier, cashier_balance_usd, role) VALUES 
    ('12345678-90ab-cdef-1234-567890abcdef', 'admin@p2p-bolivia.com', '+59178999333', '$2a$10$5dxor6U7gSJ41QCXSnj5IOYgtmIHvzbk54oWz1glGnxeNeqj6.ggS', true, true, false, 0, 'admin')
ON CONFLICT (email) DO NOTHING;

-- Set specific role for admin user (in case it was created before)
UPDATE users SET role = 'admin' WHERE email = 'admin@p2p-bolivia.com';

-- Create wallets for admin user
INSERT INTO wallets (user_id, currency, balance, locked_balance) VALUES 
    ('12345678-90ab-cdef-1234-567890abcdef', 'USD', 0.00000000, 0.00000000),
    ('12345678-90ab-cdef-1234-567890abcdef', 'BOB', 0.00000000, 0.00000000),
    ('12345678-90ab-cdef-1234-567890abcdef', 'USDT', 0.00000000, 0.00000000)
ON CONFLICT (user_id, currency) DO NOTHING;

-- Create user profile for admin
INSERT INTO user_profiles (user_id, first_name, last_name, ci_number, country) 
VALUES 
    ('12345678-90ab-cdef-1234-567890abcdef', 'Admin', 'P2P Bolivia', '00000000', 'BO')
ON CONFLICT (user_id) DO NOTHING;