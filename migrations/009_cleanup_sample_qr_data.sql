-- migrations/009_cleanup_sample_qr_data.sql
-- Remove sample QR data inserted by migration 007

-- Delete the sample QR codes that were inserted for testing
DELETE FROM deposit_qr_codes 
WHERE qr_image_url IN (
    '/images/qr/bob-deposit-qr.png',
    '/images/qr/usd-deposit-qr.png', 
    '/images/qr/usdt-deposit-qr.png'
);

-- Note: Real QR codes uploaded through the admin panel will have URLs like '/uploads/qr_bob_1234567890.png'
-- and will remain untouched by this cleanup.