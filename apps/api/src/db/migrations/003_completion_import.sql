-- Keep an explicit completion time on insert.
--
-- The trigger from 001 stamped completed_at = now() on every insert of a DONE
-- task, overwriting any value supplied. That is right for a task completed
-- through the app, but it erases history when work is imported from another
-- tool: every imported task would appear completed at import time, and cycle
-- time and throughput would be wrong from day one. An explicit value on INSERT
-- is now kept; updates behave exactly as before.

CREATE OR REPLACE FUNCTION stamp_task_completion() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'DONE' THEN
      NEW.completed_at = COALESCE(NEW.completed_at, now());
    ELSE
      NEW.completed_at = NULL;
    END IF;
  ELSIF NEW.status = 'DONE' AND OLD.status IS DISTINCT FROM 'DONE' THEN
    NEW.completed_at = now();
  ELSIF NEW.status <> 'DONE' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
