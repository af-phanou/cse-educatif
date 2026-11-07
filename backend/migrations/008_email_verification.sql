-- 008 : verification d'adresse email par jeton a usage unique.
-- Aucun SMTP ni endpoint public n'est active par cette migration.
-- Le jeton brut ne doit JAMAIS etre stocke ou journalise.

CREATE TABLE cse.registration_email_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE
    REFERENCES cse.registration_requests(id) ON DELETE CASCADE,
  token_hash char(64) COLLATE "C" NOT NULL UNIQUE
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CONSTRAINT registration_email_challenge_lifetime
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);

CREATE INDEX registration_email_challenges_expiration
  ON cse.registration_email_challenges(expires_at);

-- Role SQL specifique, sans acces aux donnees RH et sans droit
-- d'activer des comptes.
GRANT CONNECT ON DATABASE cse_educatif TO cse_email_verifier;
GRANT USAGE ON SCHEMA cse TO cse_email_verifier;

-- Le serveur d'inscription pourra plus tard creer un jeton lors d'une
-- inscription reellement recevable, mais ne peut ni le relire ni le valider.
GRANT INSERT (request_id, token_hash, expires_at)
  ON cse.registration_email_challenges TO cse_app;

-- Le service de verification ne peut consommer qu'un jeton et marquer
-- l'adresse comme verifiee, sans modifier email, statut ou profil.
GRANT SELECT (id, request_id, token_hash, expires_at, consumed_at)
  ON cse.registration_email_challenges TO cse_email_verifier;
GRANT UPDATE (consumed_at)
  ON cse.registration_email_challenges TO cse_email_verifier;

GRANT SELECT (id, status, expires_at, email_verified_at)
  ON cse.registration_requests TO cse_email_verifier;
GRANT UPDATE (email_verified_at)
  ON cse.registration_requests TO cse_email_verifier;

GRANT INSERT (action, object_type, object_id, metadata)
  ON cse.audit_events TO cse_email_verifier;
GRANT USAGE ON SEQUENCE cse.audit_events_id_seq TO cse_email_verifier;

REVOKE ALL ON cse.registration_email_challenges FROM PUBLIC;
REVOKE ALL ON cse.accounts, cse.roster_imports,
  cse.roster_entries, cse.administrator_grants,
  cse.registration_reviews, cse.email_outbox
FROM cse_email_verifier;
