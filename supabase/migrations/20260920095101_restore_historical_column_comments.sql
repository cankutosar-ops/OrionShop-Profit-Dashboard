-- Restore exact enduring metadata from three historical schema contracts.
-- No claim that those historical files executed; no business data changes.
BEGIN;

COMMENT ON COLUMN public.wb_finance.srid IS
  'Wildberries shipment/order id from reportDetailByPeriod; used for purchase-SRID logistics attribution.';

COMMENT ON COLUMN public.wb_sales.price_with_disc IS
  'Wildberries Sales API priceWithDisc — commercial list price after seller discount.';

COMMENT ON COLUMN public.wb_sales.for_pay IS
  'Wildberries Sales API forPay — goods settlement per sale/return (netForPay building block).';

COMMENT ON COLUMN public.historical_inventory_snapshots.in_way_to_client IS
  'Units in way to client (WB Analytics inWayToClient).';

COMMENT ON COLUMN public.historical_inventory_snapshots.in_way_from_client IS
  'Units in way from client (WB Analytics inWayFromClient).';

COMMIT;
