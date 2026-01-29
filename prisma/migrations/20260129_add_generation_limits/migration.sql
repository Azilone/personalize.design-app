-- Create table for tracking generation attempts per session and product
CREATE TABLE generation_attempts (
    id TEXT PRIMARY KEY,
    shop_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    first_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reset_window_minutes INTEGER NOT NULL DEFAULT 30,
    
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(shop_id, session_id, product_id)
);

-- Indexes for efficient lookups
CREATE INDEX idx_generation_attempts_shop_session ON generation_attempts(shop_id, session_id);
CREATE INDEX idx_generation_attempts_shop_product ON generation_attempts(shop_id, product_id);
CREATE INDEX idx_generation_attempts_last_attempt ON generation_attempts(last_attempt_at);
