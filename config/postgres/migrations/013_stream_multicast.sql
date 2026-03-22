-- =============================================================================
-- Migration 013: Add multicast subscriber tracking for streams
-- =============================================================================

-- Stream Subscribers: tracks consumers that have joined a multicast stream
CREATE TABLE IF NOT EXISTS stream_subscribers (
    time TIMESTAMPTZ NOT NULL,
    subscriber_id UUID NOT NULL DEFAULT gen_random_uuid(),
    stream_id UUID NOT NULL,
    stream_name VARCHAR(255) NOT NULL,
    stream_type VARCHAR(100) NOT NULL,
    publisher_id VARCHAR(255) NOT NULL,
    consumer_id VARCHAR(255) NOT NULL,
    consumer_address VARCHAR(255),
    multicast_group VARCHAR(45) NOT NULL,
    multicast_port INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    left_at TIMESTAMPTZ,
    duration_seconds FLOAT,
    metadata JSONB DEFAULT '{}'::jsonb,
    PRIMARY KEY (time, subscriber_id)
);

SELECT create_hypertable('stream_subscribers', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_stream_subs_stream ON stream_subscribers(stream_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_stream_subs_consumer ON stream_subscribers(consumer_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_stream_subs_status ON stream_subscribers(status, time DESC);

-- Retention: keep subscriber history for 90 days
SELECT add_retention_policy('stream_subscribers', INTERVAL '90 days', if_not_exists => TRUE);

SELECT 'Migration 013: stream_subscribers table created' AS status;
