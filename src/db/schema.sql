CREATE TABLE knowledge_units (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  type TEXT CHECK(type IN ('vulnerability', 'solution', 'alert')),
  severity TEXT CHECK(severity IN ('critical', 'high', 'medium', 'low')),
  confidence REAL CHECK(confidence BETWEEN 0.0 AND 1.0),
  title TEXT NOT NULL,
  description TEXT,
  solution TEXT,
  references JSONB,
  tags TEXT[] DEFAULT '{}',
  discovered_by TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  signature TEXT NOT NULL,
  reputation_score REAL DEFAULT 0.5
);

CREATE INDEX idx_type_severity ON knowledge_units(type, severity);
CREATE INDEX idx_confidence ON knowledge_units(confidence DESC);

CREATE MATERIALIZED VIEW ku_stats AS
SELECT
  type,
  COUNT(*) AS total,
  AVG(confidence) AS avg_confidence,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY confidence) AS median_confidence
FROM knowledge_units
GROUP BY type;

CREATE UNIQUE INDEX idx_ku_search ON knowledge_units USING GIN(to_tsvector('english', title || ' ' || description || ' ' || solution));