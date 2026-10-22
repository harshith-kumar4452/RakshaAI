-- Add accused_name field for storing accused person's name if victim provides it
ALTER TABLE complaints
  ADD COLUMN accused_name TEXT;

-- Add comment for clarity
COMMENT ON COLUMN complaints.accused_name IS 'Name of accused person if victim chooses to provide it (optional, for identification)';
