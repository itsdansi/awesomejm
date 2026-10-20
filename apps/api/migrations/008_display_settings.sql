ALTER TABLE shops
  ADD COLUMN display_calendar text NOT NULL DEFAULT 'AD' CHECK (display_calendar IN ('AD','BS')),
  ADD COLUMN display_time_zone text NOT NULL DEFAULT 'Asia/Kathmandu',
  ADD COLUMN display_hour_cycle text NOT NULL DEFAULT 'h23' CHECK (display_hour_cycle IN ('h12','h23'));
