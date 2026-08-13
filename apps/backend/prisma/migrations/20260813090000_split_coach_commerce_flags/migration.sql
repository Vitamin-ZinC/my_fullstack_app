INSERT INTO "FeatureFlag" ("key", "enabled", "payload", "updatedAt") VALUES
  ('coach_packages_commerce', true, '{"version":1,"requires":"stripe"}'::jsonb, CURRENT_TIMESTAMP),
  ('coach_sites_commerce', true, '{"version":1,"requires":"stripe"}'::jsonb, CURRENT_TIMESTAMP),
  ('coach_services_commerce', false, '{"version":1,"requires":["stripe","partner_core_payouts","calendly"]}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
