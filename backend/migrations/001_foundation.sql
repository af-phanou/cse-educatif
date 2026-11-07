-- 001 : structure initiale. Aucune donnee RH n'est chargee par cette migration.
-- Les fichiers CSV ne sont utilises que pour verifier l'eligibilite a l'inscription.
-- Un import est un instantane ; seul le lot au statut 'active' peut servir de reference.
CREATE TABLE cse.roster_imports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    file_sha256 char(64) NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'staged'
        CHECK (status IN ('staged', 'active', 'archived')),
    rows_count integer NOT NULL DEFAULT 0 CHECK (rows_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    activated_at timestamptz
);

CREATE UNIQUE INDEX roster_imports_one_active
    ON cse.roster_imports (status) WHERE status = 'active';

-- Ne PAS imposer d'unicite nom+prenom+etablissement : les homonymes existent.
-- Chaque correspondance multiple devra etre transmise pour revue manuelle.
CREATE TABLE cse.roster_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    import_id uuid NOT NULL REFERENCES cse.roster_imports(id) ON DELETE RESTRICT,
    source_line integer NOT NULL CHECK (source_line >= 1),
    last_name text NOT NULL CHECK (length(btrim(last_name)) > 0),
    first_name text NOT NULL CHECK (length(btrim(first_name)) > 0),
    establishment_number text NOT NULL CHECK (length(btrim(establishment_number)) > 0),
    match_key text NOT NULL CHECK (length(btrim(match_key)) > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (import_id, source_line)
);
CREATE INDEX roster_entries_lookup ON cse.roster_entries (import_id, match_key);

-- Comptes crees via inscription volontaire du salarie.
-- Le mot de passe ne doit jamais etre stocke en clair : hash Argon2id a venir.
-- Les informations de profil sont fournies par le salarie, pas par le CSV RH.
CREATE TABLE cse.accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL CHECK (length(btrim(email)) BETWEEN 3 AND 320),
    password_hash text NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    establishment_number text NOT NULL,
    phone text,
    address_line1 text,
    address_line2 text,
    postal_code text,
    city text,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'suspended', 'rejected')),
    matched_roster_entry_id uuid REFERENCES cse.roster_entries(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX accounts_email_unique_ci ON cse.accounts (lower(btrim(email)));

-- La capacite d'administration est geree independamment des donnees de profil.
-- Le role applicatif cse_app ne peut ni creer ni modifier ces attributions.
CREATE TABLE cse.administrator_grants (
    account_id uuid PRIMARY KEY REFERENCES cse.accounts(id) ON DELETE RESTRICT,
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by uuid REFERENCES cse.accounts(id) ON DELETE SET NULL
);

-- Demandes a valider par un administrateur (absents, ambigus, homonymes,
-- collaborateurs declares non actifs, etc.). Aucune auto-validation ici.
CREATE TABLE cse.account_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES cse.accounts(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    reason text NOT NULL,
    reviewed_by uuid REFERENCES cse.accounts(id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_reviews_queue ON cse.account_reviews (status, created_at);

-- Journal d'audit append-only pour le role API.
CREATE TABLE cse.audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_account_id uuid REFERENCES cse.accounts(id) ON DELETE SET NULL,
    action text NOT NULL,
    object_type text NOT NULL,
    object_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Droits : aucun droit DDL, aucun acces a la table de migrations.
GRANT SELECT, INSERT, UPDATE ON
    cse.roster_imports,
    cse.roster_entries,
    cse.accounts,
    cse.account_reviews
TO cse_app;
GRANT SELECT ON cse.administrator_grants TO cse_app;
GRANT SELECT, INSERT ON cse.audit_events TO cse_app;
GRANT USAGE, SELECT ON SEQUENCE cse.audit_events_id_seq TO cse_app;
