-- 007 : compte technique limite a l'import mensuel d'eligibilite.
-- Le mot de passe est genere localement sur le VPS, jamais publie sur GitHub.
GRANT CONNECT ON DATABASE cse_educatif TO cse_roster_manager;
GRANT USAGE ON SCHEMA cse TO cse_roster_manager;

-- Repertoire officiel : lecture minimale du code et du statut actif.
GRANT SELECT (code, active) ON cse.establishments TO cse_roster_manager;

-- Lots CSV : creation, lecture de metadonnees et transition staged -> active,
-- avec archivage du lot precedemment actif. Aucun DELETE autorise.
GRANT SELECT (id, file_sha256, status, rows_count, created_at, activated_at)
  ON cse.roster_imports TO cse_roster_manager;
GRANT INSERT (file_sha256, rows_count)
  ON cse.roster_imports TO cse_roster_manager;
GRANT UPDATE (status, activated_at)
  ON cse.roster_imports TO cse_roster_manager;

-- Donnees RH minimales : insertion des trois colonnes seulement,
-- et lecture des codes d'etablissement pour valider une activation.
-- Les noms et prenoms ne sont pas lisibles par ce service apres import.
GRANT INSERT (
  import_id, source_line, last_name, first_name,
  establishment_number, match_key
) ON cse.roster_entries TO cse_roster_manager;
GRANT SELECT (import_id, establishment_number)
  ON cse.roster_entries TO cse_roster_manager;

-- Journal d'audit append-only, sans nom/prenom dans les metadonnees.
GRANT INSERT (action, object_type, object_id, metadata)
  ON cse.audit_events TO cse_roster_manager;
GRANT USAGE ON SEQUENCE cse.audit_events_id_seq TO cse_roster_manager;

-- Defense en profondeur : aucune consultation des dossiers utilisateurs.
REVOKE ALL ON
  cse.accounts,
  cse.account_reviews,
  cse.registration_requests,
  cse.registration_reviews,
  cse.email_outbox,
  cse.administrator_grants,
  cse.establishment_changes
FROM cse_roster_manager;
