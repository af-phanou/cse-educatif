-- 005 : demandes d'inscription avant creation de comptes.
-- Le compte salarie NE doit pas etre active a la soumission.
-- Aucune donnee RH reelle ni messagerie ne sont encore branchees.

CREATE TABLE cse.registration_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (length(btrim(email)) BETWEEN 3 AND 254),
  first_name text NOT NULL CHECK (length(btrim(first_name)) BETWEEN 1 AND 120),
  last_name text NOT NULL CHECK (length(btrim(last_name)) BETWEEN 1 AND 120),
  establishment_number text NOT NULL REFERENCES cse.establishments(code),
  phone text,
  address_line1 text,
  address_line2 text,
  postal_code text,
  city text,
  matched_roster_entry_id uuid REFERENCES cse.roster_entries(id) ON DELETE SET NULL,
  review_reason text CHECK (
    review_reason IS NULL OR
    review_reason IN ('no_active_roster','not_found','ambiguous')
  ),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  email_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);
-- Evite des demandes multiples en attente pour la meme adresse.
-- Ne jamais reveler au demandeur si cette adresse a deja ete utilisee.
CREATE UNIQUE INDEX registration_one_pending_email
  ON cse.registration_requests (lower(btrim(email)))
  WHERE status = 'pending';

CREATE TABLE cse.registration_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE
    REFERENCES cse.registration_requests(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('no_active_roster','not_found','ambiguous')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES cse.accounts(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registration_reviews_pending
  ON cse.registration_reviews (created_at) WHERE status = 'pending';

-- Messages seulement PREPARES. Aucun service SMTP ne les envoie actuellement.
CREATE TABLE cse.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES cse.registration_requests(id) ON DELETE CASCADE,
  recipient_email text,
  audience text NOT NULL CHECK (audience IN ('employee','administration')),
  template text NOT NULL CHECK (template IN ('registration_received','registration_review_required')),
  delivery_status text NOT NULL DEFAULT 'not_configured'
    CHECK (delivery_status IN ('not_configured','queued','sent','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (request_id, audience, template)
);

-- Defense en profondeur : le role de l'API ne peut pas consulter les comptes
-- existants, les demandes de revue ou la liste des administrateurs.
REVOKE SELECT ON
  cse.accounts,
  cse.account_reviews,
  cse.administrator_grants,
  cse.audit_events,
  cse.roster_imports,
  cse.roster_entries
FROM cse_app;

-- Les seules colonnes RH utiles a la recherche sont accessibles a l'API.
GRANT SELECT (id, status) ON cse.roster_imports TO cse_app;
GRANT SELECT (id, import_id, match_key) ON cse.roster_entries TO cse_app;

-- Les nouvelles demandes sont INSERT ONLY : impossible pour l'API
-- d'auto-approuver, de supprimer ou de modifier un dossier.
GRANT INSERT (
  email, first_name, last_name, establishment_number,
  phone, address_line1, address_line2, postal_code, city,
  matched_roster_entry_id, review_reason
) ON cse.registration_requests TO cse_app;
GRANT SELECT (id) ON cse.registration_requests TO cse_app;
GRANT INSERT (request_id, reason) ON cse.registration_reviews TO cse_app;
GRANT INSERT (request_id, recipient_email, audience, template)
  ON cse.email_outbox TO cse_app;

REVOKE ALL ON cse.registration_requests,
  cse.registration_reviews, cse.email_outbox FROM PUBLIC;

-- Les lignes d'audit restent append-only pour le role API.
GRANT INSERT ON cse.audit_events TO cse_app;
