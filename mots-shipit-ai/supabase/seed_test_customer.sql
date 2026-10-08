-- MOTS ShipIt -- TEST DATA: one demo customer with an active sourcing policy, so loads can be
-- sent through POST /api/loads/webhook before real customer data exists.
-- Applied to Supabase as migration seed_test_customer. Remove before go-live:
--   delete from master_data_management.customers where name = 'Test Customer (demo)';

begin;

insert into master_data_management.customers (name, credit_terms)
values ('Test Customer (demo)', 'Net 30')
on conflict (name) do nothing;

insert into operational_excellence_governance.sourcing_policies
  (customer_id, version, status, eligible_lanes, eligible_equipment, carrier_tiers, rate_bounds)
select id, 1, 'active',
       '[{"origin_state": "TN", "destination_state": "*"}]',
       '["dry_van", "reefer"]',
       '["preferred", "approved"]',
       '{"minimum_dollars": 100, "maximum_dollars": 10000}'
from master_data_management.customers
where name = 'Test Customer (demo)'
on conflict (customer_id, version) do nothing;

commit;
