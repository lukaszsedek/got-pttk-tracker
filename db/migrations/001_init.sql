CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS nodes (
  id        text PRIMARY KEY,
  name      text NOT NULL,
  group_id  text NOT NULL,
  geom      geometry(Point, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS nodes_geom_idx ON nodes USING gist (geom);

CREATE TABLE IF NOT EXISTS segments (
  id                   text PRIMARY KEY,
  group_id             text NOT NULL,
  from_node_id         text NOT NULL REFERENCES nodes(id),
  to_node_id           text NOT NULL REFERENCES nodes(id),
  name                 text NOT NULL,
  got_points_forward   integer NOT NULL CHECK (got_points_forward >= 0),
  got_points_backward  integer NOT NULL CHECK (got_points_backward >= 0),
  distance_km          real NOT NULL,
  elevation_gain_m     integer NOT NULL DEFAULT 0,
  trail_color          text NOT NULL CHECK (trail_color IN ('Red','Blue','Green','Yellow','Black')),
  geom                 geometry(LineString, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS segments_geom_idx ON segments USING gist (geom);
CREATE INDEX IF NOT EXISTS segments_group_idx ON segments (group_id);

CREATE TABLE IF NOT EXISTS user_trail_progress (
  user_id            uuid NOT NULL,
  segment_id         text NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  direction          text NOT NULL CHECK (direction IN ('forward','backward')),
  completed_at       timestamptz NOT NULL DEFAULT now(),
  source_activity_id text,
  PRIMARY KEY (user_id, segment_id, direction)
);
CREATE INDEX IF NOT EXISTS progress_user_idx ON user_trail_progress (user_id);
