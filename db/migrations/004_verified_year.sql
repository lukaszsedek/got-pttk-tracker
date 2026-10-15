-- Rok weryfikacji wpisu w książeczce (komisja GOT weryfikuje książeczkę co roku).
ALTER TABLE user_trail_progress ADD COLUMN IF NOT EXISTS verified_year int;
