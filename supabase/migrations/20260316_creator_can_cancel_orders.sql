-- Allow creators to update orders for products they own
-- (e.g., to mark an order as cancelled after cancelling in Shiprocket)
DO $$ BEGIN
    CREATE POLICY "Creators can update orders for their products"
      ON public.orders FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.products p
          WHERE p.id = orders.product_id
            AND p.creator_id = auth.uid()
        )
      );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Also allow creators to SELECT orders for their products (needed for CreatorOrdersManager)
DO $$ BEGIN
    CREATE POLICY "Creators can view orders for their products"
      ON public.orders FOR SELECT
      USING (
        auth.uid() = user_id
        OR EXISTS (
          SELECT 1 FROM public.products p
          WHERE p.id = orders.product_id
            AND p.creator_id = auth.uid()
        )
      );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
