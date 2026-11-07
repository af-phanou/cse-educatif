-- 002: Defense en profondeur.
-- Avant la mise en production, le role de lecture de l'API ne doit pas pouvoir
-- modifier la liste d'eligibilite, activer un compte, ni approuver une demande.
-- Un service d'administration distinct (a definir) effectuera les imports
-- et les validations avec authentification et journal d'audit.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  cse.roster_imports,
  cse.roster_entries,
  cse.accounts,
  cse.account_reviews
FROM cse_app;

GRANT SELECT ON
  cse.roster_imports,
  cse.roster_entries,
  cse.accounts,
  cse.account_reviews
TO cse_app;
