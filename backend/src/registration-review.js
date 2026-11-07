"use strict";

/*
 * File des demandes accessible UNIQUEMENT a l'operateur du panneau prive
 * via tunnel SSH. Aucune ouverture du compte salarie ni email envoye ici.
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

async function decideRequest(pool, id, decision) {
  if (typeof id !== "string" || !ID_RE.test(id)) throw new Error("Identifiant de demande invalide.");
  if (decision !== "approved" && decision !== "rejected") {
    throw new Error("Decision non autorisee.");
  }
  if (!pool || typeof pool.connect !== "function") throw new TypeError("Connexion SQL requise.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query([
      "SELECT id FROM cse.registration_requests",
      "WHERE id = $1 AND status = 'pending' AND expires_at > now()",
      "FOR UPDATE"
    ].join("\n"), [id]);

    if (existing.rowCount !== 1) {
      await client.query("ROLLBACK");
      return {status:"not_pending"};
    }

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

    await client.query([
      "INSERT INTO cse.audit_events (action, object_type, object_id, metadata)",
      "VALUES ($1, $2, $3, $4::jsonb)"
    ].join("\n"), [
      "registration.reviewed", "registration_request", id,
      JSON.stringify({decision, source:"ssh_review_panel"})
    ]);

    await client.query("COMMIT");
    // 'approved' n'est PAS l'activation d'un compte (email non verifie).
    return {status:"recorded", decision, accountActivated:false, emailSent:false};
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* best effort */ }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { listPendingRequests, decideRequest, QUEUE_SQL };
