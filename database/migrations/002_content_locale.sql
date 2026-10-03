-- Existing lives and pending jobs were generated in Hungarian. Preserve them.
ALTER TABLE ff_futures ADD COLUMN content_locale text NOT NULL DEFAULT 'hu'
  CHECK (content_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$');
ALTER TABLE ff_futures ALTER COLUMN content_locale SET DEFAULT 'en';

-- A new UI preference cannot silently change the language of an existing life.
CREATE FUNCTION ff_preserve_content_locale() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.content_locale IS DISTINCT FROM OLD.content_locale THEN
    RAISE EXCEPTION 'immutable content locale';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ff_future_content_locale BEFORE UPDATE OF content_locale ON ff_futures
  FOR EACH ROW EXECUTE FUNCTION ff_preserve_content_locale();
