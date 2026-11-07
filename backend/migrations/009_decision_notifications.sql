-- 009 : notifications suite aux décisions d'inscription, SANS envoi automatique.
-- Etat toujours 'not_configured' par defaut; aucun worker SMTP n'est active.
-- Les decisions ne doivent pas memoriser d'adresse email non verifiee.

ALTER TABLE cse.email_outbox
  DROP CONSTRAINT IF EXISTS email_outbox_template_check;

ALTER TABLE cse.email_outbox
  ADD CONSTRAINT email_outbox_template_check
  CHECK (template IN (
    'registration_received',
    'registration_review_required',
    'registration_approved',
    'registration_rejected'
  ));

-- Les notifications de decision seront liees par request_id, sans
-- recopier une adresse email qui n'a peut-etre pas encore ete verifiee.
ALTER TABLE cse.email_outbox
  ADD CONSTRAINT email_outbox_decision_address_check
  CHECK (
    template NOT IN ('registration_approved','registration_rejected')
    OR (audience = 'employee' AND recipient_email IS NULL)
  );

-- Le compte d'administration prive peut preparer un evenement, sans
-- lire les autres notifications ni changer leur statut d'envoi.
GRANT INSERT (request_id, recipient_email, audience, template)
  ON cse.email_outbox TO cse_registration_reviewer;

REVOKE SELECT, UPDATE, DELETE, TRUNCATE
  ON cse.email_outbox FROM cse_registration_reviewer;
