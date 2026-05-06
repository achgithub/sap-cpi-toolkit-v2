-- Change ref from CHAR(10) to TEXT — CHAR pads with spaces which causes
-- subtle frontend issues when the padded value is read back into edit forms.
ALTER TABLE interfaces ALTER COLUMN ref TYPE TEXT;
