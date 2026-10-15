-- Plan wycieczek: odcinki, które użytkownik chce zaliczyć.
CREATE TABLE IF NOT EXISTS user_plan (
  user_id    uuid NOT NULL,
  segment_id text NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  direction  text NOT NULL CHECK (direction IN ('forward','backward')),
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, segment_id, direction)
);
