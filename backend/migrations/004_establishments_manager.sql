-- 004 : role d'edition prive des etablissements, limite aux deux tables.
-- Le role SQL est cree par le migrateur avec un secret dedie, hors GitHub.
GRANT CONNECT ON DATABASE cse_educatif TO cse_site_manager;
GRANT USAGE ON SCHEMA cse TO cse_site_manager;

GRANT SELECT, INSERT ON cse.establishments TO cse_site_manager;
-- Un code deja cree est immuable meme en cas de modification SQL directe.
REVOKE UPDATE ON cse.establishments FROM cse_site_manager;
GRANT UPDATE (name, active, display_order, updated_at)
  ON cse.establishments TO cse_site_manager;
GRANT SELECT, INSERT ON cse.establishment_changes TO cse_site_manager;
GRANT USAGE, SELECT ON SEQUENCE cse.establishment_changes_id_seq TO cse_site_manager;

-- Interdire les modifications/suppressions des traces.
REVOKE UPDATE, DELETE, TRUNCATE ON cse.establishment_changes FROM cse_site_manager;
-- Aucune capacite d'acceder aux fichiers RH, comptes, billets ou attributions de roles.
