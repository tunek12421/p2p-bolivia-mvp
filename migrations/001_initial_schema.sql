-- migrations/001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_verified BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    kyc_level INTEGER DEFAULT 0 CHECK (kyc_level >= 0 AND kyc_level <= 4),
    two_fa_enabled BOOLEAN DEFAULT false,
    two_fa_secret VARCHAR(255),
    is_cashier BOOLEAN DEFAULT false,
    cashier_balance_usd DECIMAL(20,8) DEFAULT 0,
    cashier_locked_usd DECIMAL(20,8) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User profiles
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    ci_number VARCHAR(20),
    date_of_birth DATE,
    address TEXT,
    city VARCHAR(100),
    country VARCHAR(2) DEFAULT 'BO',
    profile_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Wallets
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency VARCHAR(10) NOT NULL,
    balance DECIMAL(20,8) DEFAULT 0 CHECK (balance >= 0),
    locked_balance DECIMAL(20,8) DEFAULT 0 CHECK (locked_balance >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, currency)
);

-- P2P Orders
CREATE TABLE p2p_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    order_type VARCHAR(10) NOT NULL CHECK (order_type IN ('BUY', 'SELL')),
    currency_from VARCHAR(10) NOT NULL,
    currency_to VARCHAR(10) NOT NULL,
    amount DECIMAL(20,8) NOT NULL CHECK (amount > 0),
    remaining_amount DECIMAL(20,8) NOT NULL CHECK (remaining_amount >= 0),
    rate DECIMAL(20,8) NOT NULL CHECK (rate > 0),
    min_amount DECIMAL(20,8),
    max_amount DECIMAL(20,8),
    payment_methods TEXT[],
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'EXPIRED', 'PENDING', 'MATCHED', 'PROCESSING', 'COMPLETED')),
    cashier_id UUID REFERENCES users(id),
    accepted_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Transactions
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id UUID REFERENCES users(id),
    to_user_id UUID REFERENCES users(id),
    user_id UUID REFERENCES users(id),
    order_id UUID REFERENCES p2p_orders(id),
    transaction_type VARCHAR(20) NOT NULL,
    type VARCHAR(20),
    amount DECIMAL(20,8) NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL,
    fee DECIMAL(20,8) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    payment_method VARCHAR(50),
    method VARCHAR(50),
    payment_reference VARCHAR(255),
    external_ref VARCHAR(255),
    escrow_released BOOLEAN DEFAULT false,
    notes TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Wallet Transactions (for wallet service)
CREATE TABLE wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    transaction_type VARCHAR(20) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    amount DECIMAL(20,8) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    method VARCHAR(50),
    external_ref VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Orders table (for P2P service compatibility)
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id),
    order_type VARCHAR(10) NOT NULL CHECK (order_type IN ('BUY', 'SELL')),
    currency_from VARCHAR(10) NOT NULL,
    currency_to VARCHAR(10) NOT NULL,
    amount DECIMAL(20,8) NOT NULL CHECK (amount > 0),
    remaining_amount DECIMAL(20,8) NOT NULL CHECK (remaining_amount >= 0),
    rate DECIMAL(20,8) NOT NULL CHECK (rate > 0),
    min_amount DECIMAL(20,8) DEFAULT 0,
    max_amount DECIMAL(20,8) DEFAULT 0,
    payment_methods JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FILLED', 'CANCELLED', 'PARTIAL', 'PENDING', 'MATCHED', 'PROCESSING', 'COMPLETED', 'EXPIRED')),
    cashier_id UUID REFERENCES users(id),
    accepted_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- P2P matches table  
CREATE TABLE p2p_matches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buy_order_id UUID NOT NULL REFERENCES orders(id),
    sell_order_id UUID NOT NULL REFERENCES orders(id),
    amount DECIMAL(20,8) NOT NULL,
    rate DECIMAL(20,8) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Deposit accounts for banking
CREATE TABLE deposit_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency VARCHAR(10) NOT NULL,
    account_holder VARCHAR(255) NOT NULL,
    bank VARCHAR(255) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Bank Notifications (for bank listener)
CREATE TABLE bank_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    transaction_id UUID REFERENCES transactions(id),
    bank_name VARCHAR(100),
    account_number VARCHAR(50),
    reference VARCHAR(255),
    amount DECIMAL(20,8),
    currency VARCHAR(10),
    notification_type VARCHAR(20),
    raw_data JSONB,
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Refresh Tokens
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Cashier order assignments table for tracking cashier assignments
CREATE TABLE cashier_order_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    cashier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'ASSIGNED',
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(order_id, cashier_id)
);

-- Deposit attempts table for tracking deposit button clicks
CREATE TABLE deposit_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    amount DECIMAL(20,8) NOT NULL CHECK (amount > 0),
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    processed_at TIMESTAMP WITH TIME ZONE,
    notification_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_p2p_orders_user_id ON p2p_orders(user_id);
CREATE INDEX idx_p2p_orders_status ON p2p_orders(status);
CREATE INDEX idx_p2p_orders_currencies ON p2p_orders(currency_from, currency_to);
CREATE INDEX idx_p2p_orders_cashier_id ON p2p_orders(cashier_id);
CREATE INDEX idx_transactions_users ON transactions(from_user_id, to_user_id);
CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_order ON transactions(order_id);
CREATE INDEX idx_wallet_transactions_user ON wallet_transactions(user_id);
CREATE INDEX idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_deposit_accounts_currency ON deposit_accounts(currency);
CREATE INDEX idx_bank_notifications_transaction ON bank_notifications(transaction_id);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_cashier_assignments_order ON cashier_order_assignments(order_id);
CREATE INDEX idx_cashier_assignments_cashier ON cashier_order_assignments(cashier_id);
CREATE INDEX idx_deposit_attempts_user ON deposit_attempts(user_id);
CREATE INDEX idx_deposit_attempts_currency ON deposit_attempts(currency);
CREATE INDEX idx_deposit_attempts_status ON deposit_attempts(status);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON p2p_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_wallet_transactions_updated_at BEFORE UPDATE ON wallet_transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();



-- Create sample users for testing (password is 'password123')
INSERT INTO users (id, email, phone, password_hash, is_verified, is_active, is_cashier, cashier_balance_usd) VALUES 
    -- Usuario regular: password123
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'usuario.regular@test.com', '+59178999111', '$2a$10$5dxor6U7gSJ41QCXSnj5IOYgtmIHvzbk54oWz1glGnxeNeqj6.ggS', true, true, false, 0),
    -- Cajero: password123 
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cajero.nuevo@test.com', '+59178999222', '$2a$10$XxLkCM.4fZ118dGHFU0ARu5Hb.7JYytZe9vxydubjCjkzt2BqOGq.', true, true, true, 10000.00000000),
    -- Usuarios originales para compatibilidad
    ('ed7f1525-5c84-4113-a0ee-8de52277bb75', 'user@test.com', '+59178123456', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj3VfiHrqrfC', true, true, false, 0),
    ('f8e8d4a2-6d75-4b8f-9c31-2a5e4f7b8c9d', 'cashier@test.com', '+59178654321', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj3VfiHrqrfC', true, true, true, 0)
ON CONFLICT (email) DO NOTHING;

-- Create sample wallets for testing
INSERT INTO wallets (user_id, currency, balance, locked_balance) VALUES 
    -- Wallets para usuario regular
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'USD', 1500.00000000, 0.00000000),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BOB', 10000.00000000, 0.00000000),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'USDT', 0.00000000, 0.00000000),
    -- Wallets para cajero
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'USD', 5000.00000000, 0.00000000),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BOB', 30000.00000000, 0.00000000),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'USDT', 0.00000000, 0.00000000),
    -- Wallets originales para compatibilidad
    ('ed7f1525-5c84-4113-a0ee-8de52277bb75', 'USD', 1000.00000000, 0.00000000),
    ('ed7f1525-5c84-4113-a0ee-8de52277bb75', 'BOB', 6900.00000000, 0.00000000),
    ('ed7f1525-5c84-4113-a0ee-8de52277bb75', 'USDT', 500.00000000, 0.00000000),
    ('f8e8d4a2-6d75-4b8f-9c31-2a5e4f7b8c9d', 'USD', 5000.00000000, 0.00000000),
    ('f8e8d4a2-6d75-4b8f-9c31-2a5e4f7b8c9d', 'BOB', 50000.00000000, 0.00000000)
ON CONFLICT (user_id, currency) DO NOTHING;

-- Create user profiles for test users
INSERT INTO user_profiles (user_id, first_name, last_name, ci_number, country) 
VALUES 
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Juan', 'Perez', '12345678', 'BO'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Maria', 'Rodriguez', '87654321', 'BO')
ON CONFLICT (user_id) DO NOTHING;