DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM book WHERE category_id IS NULL) THEN
        RAISE EXCEPTION 'Cannot require book.category_id while rows with NULL category_id exist';
    END IF;
END
$$;

ALTER TABLE book
    ALTER COLUMN category_id SET NOT NULL;
