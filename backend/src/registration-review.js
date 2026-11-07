"use strict";

/*
 * File privee de revue des inscriptions : aucun compte ni email reel.
 * Une decision prepare une notification en PostgreSQL, avec le statut
 * 'not_configured' et SANS adresse de destinataire dans cet evenement.
 * Le moteur SMTP n'est jamais invoque.
 */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const QUEUE_SQL = [
  "SELECT r.id, r.created_at, r.first_name, r.last_name, r.email,",
  "  r.establishment_number, r.review_reason, r.email_verified_at,",
  "  rv.status AS review_status",
  "FROM cse.registration_requests r",
  "LEFT JOIN cse.registration_reviews rv ON rv.request_id = r.id",
  "WHERE r.status = 'pending' AND r.expires_at > now()",
  "ORDER BY r.created_at ASC, r.id ASC",
  "LIMIT 100"
].join("\n");

const DECISION_NOTICE_SQL = [
  "INSERT INTO cse.email_outbox",
  "  (request_id, recipient_email, audience, template)",
  "VALUES ($1, NULL, 'employee', $2)"
].join("\n");

function validateDecision(id, decision) {
  if (typeof id !== "string" || !ID_RE.test(id)) {
    throw new Error("Identifiant de demande invalide.");
  }
  if (decision !== "approved" && decision !== "rejected") {
    throw new Error("Decision non autorisee.");
  }
}

async function listPendingRequests(db) {
  if (!db || typeof db.query !== "function") throw new TypeError("Acces SQL requis.");
  const result = await db.query(QUEUE_SQL);
  return result.rows.map(row => ({
    id: row.id,
    createdAt: row.created_at,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    establishmentNumber: row.establishment_number,
    reason: row.review_reason || "matched",
    emailVerified: row.email_verified_at != null,
    reviewStatus: row.review_status || null
  }));
}

// Appelee uniquement DANS une transaction ouverte. Ne fait pas COMMIT.
async function decideRequestInTransaction(client, id, decision) {
  validateDecision(id, decision);
  if (!client || typeof client.query !== "function") {
    throw new TypeError("Connexion SQL requise.");
  }

  const existing = await client.query([
    "SELECT id FROM cse.registration_requests",
    "WHERE id = $1 AND status = 'pending' AND expires_at > now()",
    "FOR UPDATE"
  ].join("\n"), [id]);

  if (existing.rowCount !== 1) return {status:"not_pending"};

  const changed = await client.query([
    "UPDATE cse.registration_requests",
    "SET status = $1",
    "WHERE id = $2 AND status = 'pending'",
    "RETURNING id"
  ].join("\n"), [decision, id]);
  if (changed.rowCount !== 1) throw new Error("Demande modifiee pendant la validation.");

  await client.query([
    "UPDATE cse.registration_reviews",
    "SET status = $1, reviewed_at = now()",
    "WHERE request_id = $2 AND status = 'pending'"
  ].join("\n"), [decision, id]);

  // Le destinataire sera determine PLUS TARD par un service habilite,
  // uniquement apres verification de l'adresse email.
  await client.query(DECISION_NOTICE_SQL, [
    id, decision === "approved" ? "registration_approved" : "registration_rejected"
  ]);

  await client.query([
    "INSERT INTO cse.audit_events (action, object_type, object_id, metadata)",
    "VALUES ($1, $2, $3, $4::jsonb)"
  ].join("\n"), [
    "registration.reviewed", "registration_request", id,
    JSON.stringify({decision, source:"ssh_review_panel"})
  ]);

  return {
    status:"recorded", decision,
    notificationPrepared:true, accountActivated:false, emailSent:false
  };
}

async function decideRequest(pool, id, decision) {
  validateDecision(id, decision);
  if (!pool || typeof pool.connect !== "function") throw new TypeError("Connexion SQL requise.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await decideRequestInTransaction(client, id, decision);
    if (result.status === "not_pending") {
      await client.query("ROLLBACK");
      return result;
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* best effort */ }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  listPendingRequests, decideRequest, decideRequestInTransaction,
  QUEUE_SQL, DECISION_NOTICE_SQL
};
