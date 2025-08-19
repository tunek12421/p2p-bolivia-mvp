-- Fix database schema issues

-- Drop and recreate bank_notifications with correct structure
DROP TABLE IF EXISTS bank_notifications CASCADE;

CREATE TABLE bank_notifications (
    id VARCHAR(255) PRIMARY KEY,
    transaction_id VARCHAR(255) NOT NULL,
    amount DECIMAL(18, 8) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    sender_name VARCHAR(255) NOT NULL,
    sender_account VARCHAR(100),
    bank_name VARCHAR(255),
    reference TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'COMPLETED',
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create missing wallet_transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id VARCHAR(255) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    transaction_type VARCHAR(50) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    amount DECIMAL(18, 8) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    method VARCHAR(50) DEFAULT 'BANK',
    external_ref VARCHAR(255),
    metadata TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create missing orders table (alias for p2p_orders)
CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(255) PRIMARY KEY,
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
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'EXPIRED')),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create missing deposit_accounts table
CREATE TABLE IF NOT EXISTS deposit_accounts (
    id SERIAL PRIMARY KEY,
    currency VARCHAR(10) NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    account_number VARCHAR(100) NOT NULL,
    account_holder VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create missing user_bank_accounts table
CREATE TABLE IF NOT EXISTS user_bank_accounts (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id),
    account_number VARCHAR(100) NOT NULL,
    bank_name VARCHAR(255) NOT NULL,
    account_holder VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, account_number)
);

-- Create missing p2p_matches table
CREATE TABLE IF NOT EXISTS p2p_matches (
    id VARCHAR(255) PRIMARY KEY,
    buy_order_id VARCHAR(255) NOT NULL,
    sell_order_id VARCHAR(255) NOT NULL,
    amount DECIMAL(18, 8) NOT NULL,
    rate DECIMAL(18, 8) NOT NULL,
    currency_from VARCHAR(10) NOT NULL,
    currency_to VARCHAR(10) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    FOREIGN KEY (buy_order_id) REFERENCES orders(id),
    FOREIGN KEY (sell_order_id) REFERENCES orders(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_bank_notifications_processed ON bank_notifications(processed);
CREATE INDEX IF NOT EXISTS idx_bank_notifications_timestamp ON bank_notifications(timestamp);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_user_id ON user_bank_accounts(user_id);

-- Insert sample deposit accounts
INSERT INTO deposit_accounts (currency, bank_name, account_number, account_holder) VALUES
('BOB', 'Banco de Crédito de Bolivia', '1234567890', 'P2P Bolivia SRL'),
('USD', 'Banco Nacional de Bolivia', '0987654321', 'P2P Bolivia SRL'),
('BOB', 'Banco Mercantil Santa Cruz', '1122334455', 'P2P Bolivia SRL')
ON CONFLICT DO NOTHING;

-- Insert test data if needed
INSERT INTO users (id, email, password_hash, is_verified) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'test@p2pbolivia.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', true)
ON CONFLICT (email) DO NOTHING;

-- Insert test wallets
INSERT INTO wallets (user_id, currency, balance) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'BOB', 1000.00),
('550e8400-e29b-41d4-a716-446655440000', 'USD', 100.00)
ON CONFLICT (user_id, currency) DO NOTHING;