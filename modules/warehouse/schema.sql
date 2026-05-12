CREATE TABLE IF NOT EXISTS stock (
  product_id UUID PRIMARY KEY,
  qty INT NOT NULL DEFAULT 0 CHECK (qty >= 0),
  reserved_qty INT NOT NULL DEFAULT 0,
  low_threshold INT NOT NULL DEFAULT 5
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  delta INT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('order','manual','restock','adjustment')),
  order_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
