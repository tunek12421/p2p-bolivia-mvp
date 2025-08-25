-- Migration 004: Chat Tables
-- Creates tables for real-time chat functionality in P2P transactions

-- Chat rooms table
CREATE TABLE IF NOT EXISTS chat_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_type VARCHAR(20) NOT NULL CHECK (room_type IN ('TRANSACTION', 'DISPUTE', 'DIRECT')),
    transaction_id UUID,
    dispute_id UUID,
    participants JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'TEXT',
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chat_rooms_transaction_id ON chat_rooms(transaction_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_dispute_id ON chat_rooms(dispute_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_participants ON chat_rooms USING GIN (participants);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_last_message ON chat_rooms(last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id ON chat_messages(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_type ON chat_messages(message_type);

-- Add foreign key constraint to link transaction_id with orders table
ALTER TABLE chat_rooms ADD CONSTRAINT fk_chat_rooms_transaction 
    FOREIGN KEY (transaction_id) REFERENCES orders(id) ON DELETE CASCADE;

-- Comments for documentation
COMMENT ON TABLE chat_rooms IS 'Chat rooms for P2P transactions, disputes, and direct messaging';
COMMENT ON TABLE chat_messages IS 'Individual messages within chat rooms';
COMMENT ON COLUMN chat_rooms.room_type IS 'Type of chat room: TRANSACTION, DISPUTE, or DIRECT';
COMMENT ON COLUMN chat_rooms.participants IS 'JSON array of user IDs who can participate in this room';
COMMENT ON COLUMN chat_messages.message_type IS 'Type of message: TEXT, IMAGE, FILE, SYSTEM, etc.';