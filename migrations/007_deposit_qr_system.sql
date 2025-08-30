-- migrations/007_deposit_qr_system.sql
-- Add QR deposit system

-- Table to store QR codes for deposits
CREATE TABLE IF NOT EXISTS deposit_qr_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency VARCHAR(10) NOT NULL,
    qr_image_url TEXT NOT NULL,
    qr_description TEXT,
    amount_fixed DECIMAL(20,8), -- NULL = any amount, fixed value = only that amount
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(currency, amount_fixed) -- One QR per currency/amount combination
);

-- Add QR method support to existing deposit functionality
-- Modify deposit_accounts to include method type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposit_accounts' AND column_name = 'method') THEN
        ALTER TABLE deposit_accounts ADD COLUMN method VARCHAR(10) DEFAULT 'BANK' CHECK (method IN ('BANK', 'QR'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposit_accounts' AND column_name = 'qr_image_url') THEN
        ALTER TABLE deposit_accounts ADD COLUMN qr_image_url TEXT;
    END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_deposit_qr_currency ON deposit_qr_codes(currency);
CREATE INDEX IF NOT EXISTS idx_deposit_qr_active ON deposit_qr_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_deposit_accounts_method ON deposit_accounts(method);

-- Updated_at trigger for QR table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_deposit_qr_codes_updated_at') THEN
        CREATE TRIGGER update_deposit_qr_codes_updated_at BEFORE UPDATE ON deposit_qr_codes
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

-- Insert sample QR data for testing (you'll replace with real admin panel)
INSERT INTO deposit_qr_codes (currency, qr_image_url, qr_description, amount_fixed, created_by) 
VALUES 
    ('BOB', '/images/qr/bob-deposit-qr.png', 'Escanea este QR para depositar BOB', NULL, (SELECT id FROM users WHERE role = 'admin' LIMIT 1)),
    ('USD', '/images/qr/usd-deposit-qr.png', 'Escanea este QR para depositar USD', NULL, (SELECT id FROM users WHERE role = 'admin' LIMIT 1)),
    ('USDT', '/images/qr/usdt-deposit-qr.png', 'Escanea este QR para depositar USDT', NULL, (SELECT id FROM users WHERE role = 'admin' LIMIT 1))
ON CONFLICT (currency, amount_fixed) DO NOTHING;