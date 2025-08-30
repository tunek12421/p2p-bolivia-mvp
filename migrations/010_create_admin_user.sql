-- migrations/010_create_admin_user.sql
-- Create admin user and ensure admin role exists

-- Update the first user to be admin (assuming it's you)
UPDATE users SET role = 'admin' WHERE role IS NULL OR role = 'user' LIMIT 1;

-- If no users exist, create a default admin user (you can change these credentials)
INSERT INTO users (username, email, password_hash, role, is_verified) 
SELECT 'admin', 'admin@p2p-bolivia.com', '$2a$10$dummy.hash.for.admin.user', 'admin', true
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');

-- Ensure all existing users without role get 'user' role
UPDATE users SET role = 'user' WHERE role IS NULL;