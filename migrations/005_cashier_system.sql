-- migrations/005_cashier_system.sql
-- Add cashier system with user roles and order modifications

-- Add user role system (safe)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'cashier', 'admin'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_cashier') THEN
        ALTER TABLE users ADD COLUMN is_cashier BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'cashier_verified_at') THEN
        ALTER TABLE users ADD COLUMN cashier_verified_at TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'cashier_balance_limit') THEN
        ALTER TABLE users ADD COLUMN cashier_balance_limit DECIMAL(20,8) DEFAULT 10000;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'cashier_rating') THEN
        ALTER TABLE users ADD COLUMN cashier_rating DECIMAL(3,2) DEFAULT 5.0 CHECK (cashier_rating >= 0 AND cashier_rating <= 5);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'cashier_completed_orders') THEN
        ALTER TABLE users ADD COLUMN cashier_completed_orders INTEGER DEFAULT 0;
    END IF;
END $$;

-- Add cashier_id field to orders tables (safe)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'cashier_id') THEN
        ALTER TABLE orders ADD COLUMN cashier_id UUID REFERENCES users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'accepted_at') THEN
        ALTER TABLE orders ADD COLUMN accepted_at TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'expired_at') THEN
        ALTER TABLE orders ADD COLUMN expired_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Also update p2p_orders table for consistency (safe)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'p2p_orders' AND column_name = 'cashier_id') THEN
        ALTER TABLE p2p_orders ADD COLUMN cashier_id UUID REFERENCES users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'p2p_orders' AND column_name = 'accepted_at') THEN
        ALTER TABLE p2p_orders ADD COLUMN accepted_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Update order statuses to support the new flow
-- Current: ACTIVE, PARTIALLY_FILLED, FILLED, CANCELLED, EXPIRED
-- New: PENDING, MATCHED, PROCESSING, COMPLETED, CANCELLED, EXPIRED

-- Create matches table with correct name (fix duplicate)
DROP TABLE IF EXISTS matches;
CREATE TABLE matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buy_order_id UUID NOT NULL REFERENCES orders(id),
    sell_order_id UUID NOT NULL REFERENCES orders(id), 
    cashier_id UUID NOT NULL REFERENCES users(id),
    amount DECIMAL(20,8) NOT NULL CHECK (amount > 0),
    rate DECIMAL(20,8) NOT NULL CHECK (rate > 0),
    status VARCHAR(20) DEFAULT 'MATCHED' CHECK (status IN ('MATCHED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'DISPUTED')),
    payment_confirmed_by_cashier BOOLEAN DEFAULT FALSE,
    payment_confirmed_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Cashier availability table
CREATE TABLE IF NOT EXISTS cashier_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cashier_id UUID NOT NULL REFERENCES users(id),
    currency_from VARCHAR(10) NOT NULL,
    currency_to VARCHAR(10) NOT NULL,
    min_amount DECIMAL(20,8) DEFAULT 0,
    max_amount DECIMAL(20,8) DEFAULT 100000,
    available_balance DECIMAL(20,8) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cashier_id, currency_from, currency_to)
);

-- Order notifications for cashiers
CREATE TABLE IF NOT EXISTS order_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id),
    cashier_id UUID REFERENCES users(id),
    notification_type VARCHAR(20) NOT NULL CHECK (notification_type IN ('NEW_ORDER', 'ORDER_CANCELLED', 'PAYMENT_RECEIVED')),
    is_read BOOLEAN DEFAULT FALSE,
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Update existing indexes (safe)
CREATE INDEX IF NOT EXISTS idx_orders_cashier_id ON orders(cashier_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_p2p_orders_cashier_id ON p2p_orders(cashier_id);
CREATE INDEX IF NOT EXISTS idx_matches_cashier_id ON matches(cashier_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_cashier_availability_cashier ON cashier_availability(cashier_id);
CREATE INDEX IF NOT EXISTS idx_cashier_availability_active ON cashier_availability(is_active);
CREATE INDEX IF NOT EXISTS idx_order_notifications_cashier ON order_notifications(cashier_id, is_read);

-- Add updated_at triggers for new tables
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_cashier_availability_updated_at') THEN
        CREATE TRIGGER update_cashier_availability_updated_at BEFORE UPDATE ON cashier_availability
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

-- Insert some test cashier data (optional)
-- This will create a few test cashiers for development
INSERT INTO users (id, email, phone, password_hash, role, is_cashier, cashier_verified_at, is_verified, is_active) 
VALUES 
    (uuid_generate_v4(), 'cashier1@test.com', '+59112345001', '$2a$10$5dxor6U7gSJ41QCXSnj5IOYgtmIHvzbk54oWz1glGnxeNeqj6.ggS', 'cashier', true, CURRENT_TIMESTAMP, true, true),
    (uuid_generate_v4(), 'cashier2@test.com', '+59112345002', '$2a$10$5dxor6U7gSJ41QCXSnj5IOYgtmIHvzbk54oWz1glGnxeNeqj6.ggS', 'cashier', true, CURRENT_TIMESTAMP, true, true),
    (uuid_generate_v4(), 'cashier3@test.com', '+59112345003', '$2a$10$5dxor6U7gSJ41QCXSnj5IOYgtmIHvzbk54oWz1glGnxeNeqj6.ggS', 'cashier', true, CURRENT_TIMESTAMP, true, true)
ON CONFLICT (email) DO NOTHING;

-- Set up initial cashier availability for test cashiers
WITH test_cashiers AS (
    SELECT id FROM users WHERE role = 'cashier' AND is_cashier = true LIMIT 3
)
INSERT INTO cashier_availability (cashier_id, currency_from, currency_to, available_balance, max_amount)
SELECT 
    id,
    'USD',
    'BOB', 
    5000.0,
    1000.0
FROM test_cashiers
UNION ALL
SELECT 
    id,
    'BOB',
    'USD',
    35000.0,
    7000.0  
FROM test_cashiers
ON CONFLICT (cashier_id, currency_from, currency_to) DO NOTHING;