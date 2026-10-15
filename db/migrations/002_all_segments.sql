-- Wszystkie odcinki z tabeli PTTK, także te bez wyznaczonego przebiegu na mapie.
ALTER TABLE nodes    ALTER COLUMN geom DROP NOT NULL;
ALTER TABLE segments ALTER COLUMN geom DROP NOT NULL;
ALTER TABLE segments ALTER COLUMN trail_color DROP NOT NULL;
ALTER TABLE segments ADD COLUMN IF NOT EXISTS region_name text NOT NULL DEFAULT '';
ALTER TABLE segments ADD COLUMN IF NOT EXISTS geom_status text NOT NULL DEFAULT 'ok';
ALTER TABLE segments ADD COLUMN IF NOT EXISTS unmarked boolean NOT NULL DEFAULT false;
