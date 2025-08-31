-- migrations/011_deposit_validation_system.sql
-- Add automatic validation system support to deposit_attempts table

-- Add validation columns to deposit_attempts table if they don't exist
DO $$
BEGIN
    -- Add status column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposit_attempts' AND column_name = 'status') THEN
        ALTER TABLE deposit_attempts ADD COLUMN status VARCHAR(20) DEFAULT 'pending';
    END IF;
    
    -- Add processed_at column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposit_attempts' AND column_name = 'processed_at') THEN
        ALTER TABLE deposit_attempts ADD COLUMN processed_at TIMESTAMP WITH TIME ZONE;
    END IF;
    
    -- Add notification_data column
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deposit_attempts' AND column_name = 'notification_data') THEN
        ALTER TABLE deposit_attempts ADD COLUMN notification_data JSONB;
    END IF;
END $$;

-- Add status index for performance if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_deposit_attempts_status ON deposit_attempts(status);

-- Add composite index for pending deposits lookup
CREATE INDEX IF NOT EXISTS idx_deposit_attempts_pending_lookup ON deposit_attempts(status, created_at) WHERE status = 'pending';

-- Add check constraint for status values
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'deposit_attempts_status_check') THEN
        ALTER TABLE deposit_attempts ADD CONSTRAINT deposit_attempts_status_check 
        CHECK (status IN ('pending', 'completed', 'failed', 'expired'));
    END IF;
END $$;