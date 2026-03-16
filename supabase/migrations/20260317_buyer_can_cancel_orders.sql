-- Allow buyers to cancel their own orders
-- They can only update the status and shipment_status to 'cancelled'

CREATE POLICY "Users can cancel their own orders"
    ON "public"."orders"
    FOR UPDATE
    USING (
        auth.uid() = user_id
    )
    WITH CHECK (
        auth.uid() = user_id
        AND status = 'cancelled'
        AND shipment_status = 'cancelled'
    );
