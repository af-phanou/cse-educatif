-- 003 : repertoire de reference des etablissements.
-- Codes stockes en TEXTE pour conserver les zeros initiaux (01, 05, ...).
-- Seuls les etablissements actifs seront proposes a l'inscription.
CREATE TABLE cse.establishments (
  code text COLLATE "C" PRIMARY KEY
    CHECK (code ~ '^[0-9A-Z][0-9A-Z._/-]{0,19}$'),
  name text NOT NULL
    CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 1000
    CHECK (display_order BETWEEN 0 AND 100000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Exactement les cinq etablissements fournis pour le lancement.
INSERT INTO cse.establishments(code, name, display_order) VALUES
  ('01', 'SIEGE', 1),
  ('05', 'DAME DU ROITELET', 5),
  ('07', 'DAME LE MESNIL', 7),
  ('08', 'DAME LE RECUEIL', 8),
  ('09', 'LES TOURNESOLS', 9);

-- Interdit toute suppression physique d'un etablissement reference par un compte.
-- NOT VALID n'efface ni ne requalifie d'eventuels comptes historiques.
ALTER TABLE cse.accounts
  ADD CONSTRAINT accounts_establishment_fk
  FOREIGN KEY (establishment_number)
  REFERENCES cse.establishments(code)
  NOT VALID;

-- Historique des modifications : pas de suppression des traces.
CREATE TABLE cse.establishment_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code text NOT NULL REFERENCES cse.establishments(code),
  kind text NOT NULL CHECK (kind IN ('create', 'update')),
  new_name text NOT NULL,
  new_active boolean NOT NULL,
  source text NOT NULL,
  actor_account_id uuid REFERENCES cse.accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- L'API publique n'a qu'un droit de LECTURE sur la liste.
REVOKE ALL ON cse.establishments FROM PUBLIC;
REVOKE ALL ON cse.establishment_changes FROM PUBLIC;
GRANT SELECT ON cse.establishments TO cse_app;

-- Une future interface d'administration pourra limiter les actions
-- aux personnes dont le role est explicitement 'superadmin'.
ALTER TABLE cse.administrator_grants
  ADD COLUMN role text NOT NULL DEFAULT 'admin'
    CHECK (role IN ('admin', 'superadmin'));
