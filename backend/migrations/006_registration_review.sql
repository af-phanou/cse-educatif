-- 006 : validation provisoire des demandes par role PostgreSQL distinct.
-- Acces autorise seulement au panneau prive sur tunnel SSH.
-- Ne cree ni compte actif, ni mot de passe, ni email envoye.

GRANT CONNECT ON DATABASE cse_educatif TO cse_registration_reviewer;
GRANT USAGE ON SCHEMA cse TO cse_registration_reviewer;

-- Les colonnes de contact non necessaires (telephone / adresse) sont
-- intentionnellement exclues de la consultation par ce service.
GRANT SELECT (
    id, email, first_name, last_name, establishment_number,
    status, review_reason, created_at, expires_at, email_verified_at
) ON cse.registration_requests TO cse_registration_reviewer;

-- Le role ne peut changer QUE le statut de la demande.
GRANT UPDATE (status) ON cse.registration_requests
  TO cse_registration_reviewer;

GRANT SELECT (id, request_id, reason, status)
  ON cse.registration_reviews TO cse_registration_reviewer;
GRANT UPDATE (status, reviewed_at)
  ON cse.registration_reviews TO cse_registration_reviewer;

-- Historique append-only. Aucun droit de modification des traces.
GRANT INSERT (action, object_type, object_id, metadata)
  ON cse.audit_events TO cse_registration_reviewer;
GRANT USAGE ON SEQUENCE cse.audit_events_id_seq TO cse_registration_reviewer;

-- Defense contre une extension accidentelle des privileges.
REVOKE ALL ON cse.accounts, cse.account_reviews,
  cse.roster_imports, cse.roster_entries,
  cse.administrator_grants, cse.email_outbox
FROM cse_registration_reviewer;
