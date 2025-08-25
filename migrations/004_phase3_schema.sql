-- Phase 3: KYC + Disputes + Chat + Analytics Schema
-- Migration for P2P Bolivia Platform Phase 3

-- KYC Submissions table
CREATE TABLE IF NOT EXISTS kyc_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    kyc_level INT NOT NULL DEFAULT 1 CHECK (kyc_level IN (1, 2, 3)),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'UNDER_REVIEW')),
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID,
    rejection_reason TEXT,
    documents JSONB DEFAULT '{}',
    verification_data JSONB DEFAULT '{}',
    ocr_results JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- KYC Documents table
CREATE TABLE IF NOT EXISTS kyc_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID REFERENCES kyc_submissions(id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('CI', 'PASSPORT', 'SELFIE', 'PROOF_ADDRESS')),
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT,
    mime_type VARCHAR(100),
    status VARCHAR(20) DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED', 'PROCESSING', 'VERIFIED', 'FAILED')),
    ocr_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disputes table
CREATE TABLE IF NOT EXISTS disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    initiator_id UUID REFERENCES users(id) ON DELETE CASCADE,
    respondent_id UUID REFERENCES users(id) ON DELETE CASCADE,
    mediator_id UUID REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    dispute_type VARCHAR(50) NOT NULL CHECK (dispute_type IN ('PAYMENT_NOT_RECEIVED', 'PAYMENT_NOT_SENT', 'WRONG_AMOUNT', 'FRAUD', 'OTHER')),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    resolution_type VARCHAR(20) CHECK (resolution_type IN ('REFUND_FULL', 'REFUND_PARTIAL', 'NO_REFUND', 'CUSTOM')),
    resolution_amount DECIMAL(15,2),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dispute Evidence table
CREATE TABLE IF NOT EXISTS dispute_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
    submitted_by UUID REFERENCES users(id) ON DELETE CASCADE,
    evidence_type VARCHAR(50) NOT NULL CHECK (evidence_type IN ('SCREENSHOT', 'DOCUMENT', 'TRANSACTION_PROOF', 'OTHER')),
    file_path VARCHAR(500),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat Rooms table
CREATE TABLE IF NOT EXISTS chat_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_type VARCHAR(20) NOT NULL CHECK (room_type IN ('TRANSACTION', 'DISPUTE', 'DIRECT')),
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
    dispute_id UUID REFERENCES disputes(id) ON DELETE CASCADE,
    participants JSONB NOT NULL DEFAULT '[]',
    last_message_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat Messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
    message_type VARCHAR(20) DEFAULT 'TEXT' CHECK (message_type IN ('TEXT', 'IMAGE', 'FILE', 'SYSTEM')),
    content TEXT NOT NULL,
    file_path VARCHAR(500),
    read_by JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Sessions table for WebSocket tracking
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(500) UNIQUE NOT NULL,
    device_info JSONB DEFAULT '{}',
    last_active TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

-- Analytics Views and Tables
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_data JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add KYC level to users table if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='kyc_level') THEN
        ALTER TABLE users ADD COLUMN kyc_level INT DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='kyc_verified_at') THEN
        ALTER TABLE users ADD COLUMN kyc_verified_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_mediator') THEN
        ALTER TABLE users ADD COLUMN is_mediator BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_user_id ON kyc_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_submissions_status ON kyc_submissions(status);
CREATE INDEX IF NOT EXISTS idx_kyc_documents_submission_id ON kyc_documents(submission_id);

CREATE INDEX IF NOT EXISTS idx_disputes_transaction_id ON disputes(transaction_id);
CREATE INDEX IF NOT EXISTS idx_disputes_initiator_id ON disputes(initiator_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute_id ON dispute_evidence(dispute_id);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_transaction_id ON chat_rooms(transaction_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_dispute_id ON chat_rooms(dispute_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics_events(event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);

-- Update functions for timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
DO $$
BEGIN
    -- KYC submissions
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_kyc_submissions_updated_at') THEN
        CREATE TRIGGER update_kyc_submissions_updated_at BEFORE UPDATE ON kyc_submissions 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- KYC documents
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_kyc_documents_updated_at') THEN
        CREATE TRIGGER update_kyc_documents_updated_at BEFORE UPDATE ON kyc_documents 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Disputes
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_disputes_updated_at') THEN
        CREATE TRIGGER update_disputes_updated_at BEFORE UPDATE ON disputes 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Chat rooms
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_chat_rooms_updated_at') THEN
        CREATE TRIGGER update_chat_rooms_updated_at BEFORE UPDATE ON chat_rooms 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    -- Chat messages
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_chat_messages_updated_at') THEN
        CREATE TRIGGER update_chat_messages_updated_at BEFORE UPDATE ON chat_messages 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Insert sample mediator users
INSERT INTO users (id, email, password_hash, is_mediator, kyc_level, created_at)
VALUES 
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'mediator1@p2pbolivia.com', '$2a$10$5dxor6U7gSJ41QCXSnj5IOYgtmIHvzbk54oWz1glGnxeNeqj6.ggS', true, 3, NOW()),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'mediator2@p2pbolivia.com', '$2a$10$5dxor6U7gSJ41QCXSnj5IOYgtmIHvzbk54oWz1glGnxeNeqj6.ggS', true, 3, NOW())
ON CONFLICT (id) DO NOTHING;

-- Create materialized view for analytics (refresh daily)
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_stats AS
SELECT 
    date_trunc('day', created_at) as date,
    COUNT(DISTINCT CASE WHEN table_type = 'users' THEN id END) as new_users,
    COUNT(DISTINCT CASE WHEN table_type = 'transactions' THEN id END) as new_transactions,
    COALESCE(SUM(CASE WHEN table_type = 'transactions' THEN amount END), 0) as total_volume
FROM (
    SELECT id, created_at, 'users' as table_type, 0 as amount FROM users WHERE created_at > NOW() - INTERVAL '90 days'
    UNION ALL
    SELECT id, created_at, 'transactions' as table_type, COALESCE(amount, 0) as amount FROM transactions WHERE created_at > NOW() - INTERVAL '90 days'
) combined
GROUP BY date_trunc('day', created_at)
ORDER BY date DESC;

-- Create unique index for materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats(date);

COMMIT;