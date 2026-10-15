-- Zdobyte odznaki (norma kolejnego stopnia liczy się od roku ich zdobycia) i notatki do wpisów.
CREATE TABLE IF NOT EXISTS user_badges (
  user_id     uuid NOT NULL,
  badge_id    text NOT NULL,
  earned_year int  NOT NULL,
  PRIMARY KEY (user_id, badge_id)
);
ALTER TABLE user_trail_progress ADD COLUMN IF NOT EXISTS note text;
