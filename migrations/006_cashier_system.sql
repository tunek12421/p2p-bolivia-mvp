-- migrations/006_cashier_system.sql
-- Add cashier system to support AIRTM-like flow where cashiers accept orders

-- Add user roles and cashier fields (safe)
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
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'cashier_balance_usd') THEN
        ALTER TABLE users ADD COLUMN cashier_balance_usd DECIMAL(20,8) DEFAULT 0 CHECK (cashier_balance_usd >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'cashier_balance_bob') THEN
        ALTER TABLE users ADD COLUMN cashier_balance_bob DECIMAL(20,8) DEFAULT 0 CHECK (cashier_balance_bob >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'cashier_locked_usd') THEN
        ALTER TABLE users ADD COLUMN cashier_locked_usd DECIMAL(20,8) DEFAULT 0 CHECK (cashier_locked_usd >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'cashier_locked_bob') THEN
        ALTER TABLE users ADD COLUMN cashier_locked_bob DECIMAL(20,8) DEFAULT 0 CHECK (cashier_locked_bob >= 0);
    END IF;
END $$;

-- Add cashier_id to orders table (safe)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'cashier_id') THEN
        ALTER TABLE orders ADD COLUMN cashier_id UUID REFERENCES users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'min_amount') THEN
        ALTER TABLE orders ADD COLUMN min_amount DECIMAL(20,8);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'max_amount') THEN
        ALTER TABLE orders ADD COLUMN max_amount DECIMAL(20,8);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'payment_methods') THEN
        ALTER TABLE orders ADD COLUMN payment_methods TEXT[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'accepted_at') THEN
        ALTER TABLE orders ADD COLUMN accepted_at TIMESTAMP WITH TIME ZONE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'expires_at') THEN
        ALTER TABLE orders ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Also add cashier_id to p2p_orders for consistency (safe)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'p2p_orders' AND column_name = 'cashier_id') THEN
        ALTER TABLE p2p_orders ADD COLUMN cashier_id UUID REFERENCES users(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'p2p_orders' AND column_name = 'accepted_at') THEN
        ALTER TABLE p2p_orders ADD COLUMN accepted_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Update order status constraints to include new cashier flow statuses
DO $$
BEGIN
    -- Only update constraints if they don't already exist
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_status_check 
            CHECK (status IN ('PENDING', 'MATCHED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'EXPIRED'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'p2p_orders_status_check') THEN
        -- First check if there are any existing records that would violate the constraint
        IF NOT EXISTS (SELECT 1 FROM p2p_orders WHERE status NOT IN ('PENDING', 'MATCHED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'EXPIRED')) THEN
            ALTER TABLE p2p_orders ADD CONSTRAINT p2p_orders_status_check 
                CHECK (status IN ('PENDING', 'MATCHED', 'PROCESSING', 'COMPLETED', 'CANCELLED', 'EXPIRED'));
        END IF;
    END IF;
END $$;

-- Create cashier applications table for verification process
CREATE TABLE IF NOT EXISTS cashier_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_name VARCHAR(255),
    business_type VARCHAR(100),
    experience_years INTEGER,
    daily_volume_estimate DECIMAL(20,8),
    document_urls TEXT[],
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create cashier order tracking for availability
CREATE TABLE IF NOT EXISTS cashier_order_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cashier_id UUID NOT NULL REFERENCES users(id),
    order_id UUID NOT NULL REFERENCES orders(id),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(cashier_id, order_id)
);

-- Create cashier performance metrics
CREATE TABLE IF NOT EXISTS cashier_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cashier_id UUID NOT NULL REFERENCES users(id),
    date DATE NOT NULL,
    orders_accepted INTEGER DEFAULT 0,
    orders_completed INTEGER DEFAULT 0,
    total_volume_usd DECIMAL(20,8) DEFAULT 0,
    total_volume_bob DECIMAL(20,8) DEFAULT 0,
    avg_completion_time_minutes INTEGER,
    customer_rating DECIMAL(3,2), -- Average rating from 1-5
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(cashier_id, date)
);

-- Add indexes for cashier system
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_cashier ON users(is_cashier) WHERE is_cashier = TRUE;
CREATE INDEX IF NOT EXISTS idx_orders_cashier_id ON orders(cashier_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_p2p_orders_cashier_id ON p2p_orders(cashier_id);
CREATE INDEX IF NOT EXISTS idx_cashier_applications_user ON cashier_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_cashier_applications_status ON cashier_applications(status);
CREATE INDEX IF NOT EXISTS idx_cashier_assignments_cashier ON cashier_order_assignments(cashier_id);
CREATE INDEX IF NOT EXISTS idx_cashier_assignments_order ON cashier_order_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_cashier_metrics_cashier_date ON cashier_metrics(cashier_id, date);

-- Add trigger for updated_at on new tables
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_cashier_applications_updated_at') THEN
        CREATE TRIGGER update_cashier_applications_updated_at BEFORE UPDATE ON cashier_applications
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_cashier_metrics_updated_at') THEN
        CREATE TRIGGER update_cashier_metrics_updated_at BEFORE UPDATE ON cashier_metrics
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

-- Update comments
COMMENT ON COLUMN users.role IS 'User role: user (regular), cashier, admin';
COMMENT ON COLUMN users.is_cashier IS 'Whether user is verified as cashier';
COMMENT ON COLUMN users.cashier_verified_at IS 'When user was verified as cashier';
COMMENT ON COLUMN orders.cashier_id IS 'ID of cashier who accepted this order';
COMMENT ON COLUMN orders.accepted_at IS 'When order was accepted by cashier';
COMMENT ON TABLE cashier_applications IS 'Applications from users wanting to become cashiers';
COMMENT ON TABLE cashier_order_assignments IS 'Tracks which cashier is handling which order';
COMMENT ON TABLE cashier_metrics IS 'Daily performance metrics for cashiers';