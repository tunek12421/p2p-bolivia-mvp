-- Migration: Bank Notifications Table
-- This table stores bank notifications received from Android listener

-- Create bank_notifications table
CREATE TABLE IF NOT EXISTS bank_notifications (
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

-- Create indexes for better performance (with column existence checks)
DO $$
BEGIN
    -- Only create indexes if the columns exist
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'bank_notifications' AND column_name = 'processed') THEN
        CREATE INDEX IF NOT EXISTS idx_bank_notifications_processed ON bank_notifications(processed);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'bank_notifications' AND column_name = 'timestamp') THEN
        CREATE INDEX IF NOT EXISTS idx_bank_notifications_timestamp ON bank_notifications(timestamp);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'bank_notifications' AND column_name = 'amount') THEN
        CREATE INDEX IF NOT EXISTS idx_bank_notifications_amount ON bank_notifications(amount);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'bank_notifications' AND column_name = 'currency') THEN
        CREATE INDEX IF NOT EXISTS idx_bank_notifications_currency ON bank_notifications(currency);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'bank_notifications' AND column_name = 'reference') THEN
        CREATE INDEX IF NOT EXISTS idx_bank_notifications_reference ON bank_notifications(reference);
    END IF;
END
$$;

-- Create deposit_accounts table for bank account mapping
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

-- Insert sample deposit accounts for testing
INSERT INTO deposit_accounts (currency, bank, account_number, account_holder) VALUES
('BOB', 'Banco de Crédito de Bolivia', '1234567890', 'P2P Bolivia SRL'),
('USD', 'Banco Nacional de Bolivia', '0987654321', 'P2P Bolivia SRL'),
('BOB', 'Banco Mercantil Santa Cruz', '1122334455', 'P2P Bolivia SRL')
ON CONFLICT DO NOTHING;

-- Create user_bank_accounts table for user account mapping
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

-- Create indexes for user bank accounts
CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_user_id ON user_bank_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_account_number ON user_bank_accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_user_bank_accounts_active ON user_bank_accounts(is_active);

-- Add p2p_matches table if not exists (for escrow functionality)
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
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for p2p_matches
CREATE INDEX IF NOT EXISTS idx_p2p_matches_status ON p2p_matches(status);
CREATE INDEX IF NOT EXISTS idx_p2p_matches_created_at ON p2p_matches(created_at);
CREATE INDEX IF NOT EXISTS idx_p2p_matches_buy_order ON p2p_matches(buy_order_id);
CREATE INDEX IF NOT EXISTS idx_p2p_matches_sell_order ON p2p_matches(sell_order_id);

-- Add wallet_transactions table structure improvement (only if table exists)
DO $$
BEGIN
    -- Only modify wallet_transactions if it exists
    IF EXISTS (SELECT 1 FROM information_schema.tables 
               WHERE table_name = 'wallet_transactions' AND table_schema = 'public') THEN
        
        -- Add external_ref column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'wallet_transactions' AND column_name = 'external_ref') THEN
            ALTER TABLE wallet_transactions ADD COLUMN external_ref VARCHAR(255);
        END IF;
        
        -- Add metadata column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'wallet_transactions' AND column_name = 'metadata') THEN
            ALTER TABLE wallet_transactions ADD COLUMN metadata TEXT;
        END IF;
        
        -- Add method column if it doesn't exist
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                       WHERE table_name = 'wallet_transactions' AND column_name = 'method') THEN
            ALTER TABLE wallet_transactions ADD COLUMN method VARCHAR(50) DEFAULT 'UNKNOWN';
        END IF;
    END IF;
END
$$;

-- Create trigger for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to bank_notifications
DROP TRIGGER IF EXISTS update_bank_notifications_updated_at ON bank_notifications;
CREATE TRIGGER update_bank_notifications_updated_at
    BEFORE UPDATE ON bank_notifications
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to deposit_accounts
DROP TRIGGER IF EXISTS update_deposit_accounts_updated_at ON deposit_accounts;
CREATE TRIGGER update_deposit_accounts_updated_at
    BEFORE UPDATE ON deposit_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to user_bank_accounts
DROP TRIGGER IF EXISTS update_user_bank_accounts_updated_at ON user_bank_accounts;
CREATE TRIGGER update_user_bank_accounts_updated_at
    BEFORE UPDATE ON user_bank_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample test data for development
DO $$
DECLARE
    test_user_id UUID;
BEGIN
    -- Get or create a test user
    SELECT id INTO test_user_id FROM users WHERE email = 'test@p2pbolivia.com' LIMIT 1;
    
    IF test_user_id IS NOT NULL THEN
        -- Insert test bank account mapping
        INSERT INTO user_bank_accounts (user_id, account_number, bank_name, account_holder)
        VALUES (test_user_id, '1111222233', 'Banco de Crédito de Bolivia', 'Test User')
        ON CONFLICT (user_id, account_number) DO NOTHING;
        
        -- Insert test notification
        INSERT INTO bank_notifications (
            id, transaction_id, amount, currency, sender_name, 
            sender_account, bank_name, reference, timestamp, status, processed
        ) VALUES (
            'test_notif_' || extract(epoch from now()),
            'test_tx_' || extract(epoch from now()),
            100.50,
            'BOB',
            'Juan Perez',
            '9876543210',
            'Banco de Crédito de Bolivia',
            'DEPOSIT-' || test_user_id,
            NOW(),
            'COMPLETED',
            FALSE
        ) ON CONFLICT (id) DO NOTHING;
    END IF;
END
$$;