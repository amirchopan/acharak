DELETE FROM users;
DELETE FROM otp_request_limits;

ALTER TABLE users ADD COLUMN password_hash TEXT;
