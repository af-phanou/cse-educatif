"use strict";

/**
 * Moteur email prive — en preparation, aucun SMTP/HTTP.
 *
 * - jeton : 32 octets aleatoires, hex (256 bits d'entropie) ;
 * - base PostgreSQL : hash SHA-256 seulement (jamais jeton brut) ;
 * - expiration : 30 minutes ;
 * - 1 seul jeton par demande, consommable une seule fois ;
 * - une confirmation d'email ne cree jamais de compte actif.
 *
 * Les fonctions "InTransaction" necessitent une transaction ouverte
 * sous le role SQL limite cse_email_verifier.
 */
const { randomBytes, createHash } = require("node:crypto");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN = /^[0-9a-f]{64}$/i;

function hashEmailToken(rawToken) {
  if (typeof rawToken !== "string" || !TOKEN.test(rawToken)) return null;
  return createHash("sha256").update(rawToken.toLowerCase(),"ascii").digest("hex");
}

function mintEmailToken() {
  const rawToken=randomBytes(32).toString("hex");
  return {rawToken,tokenHash:hashEmailToken(rawToken)};
}

const ISSUE_ALLOWED_SQL = [
  "SELECT id FROM cse.registration_requests",
  "WHERE id=$1 AND status IN ('pending','approved')",
  "  AND email_verified_at IS NULL AND expires_at > now()",
  "FOR UPDATE"
].join("\n");

const INSERT_CHALLENGE_SQL = [
  "INSERT INTO cse.registration_email_challenges",
  "(request_id,token_hash,expires_at)",
  "VALUES($1,$2,now() + interval '30 minutes')",
  "ON CONFLICT (request_id) DO NOTHING",
  "RETURNING id"
].join("\n");

async function issueChallengeInTransaction(client,requestId) {
  if (typeof requestId!=="string" || !UUID.test(requestId)) {
    return {issued:false,rawToken:null};
  }
  const valid=await client.query(ISSUE_ALLOWED_SQL,[requestId]);
  if(valid.rowCount!==1)return {issued:false,rawToken:null};
  const {rawToken,tokenHash}=mintEmailToken();
  const inserted=await client.query(INSERT_CHALLENGE_SQL,[requestId,tokenHash]);
  if(inserted.rowCount!==1)return {issued:false,rawToken:null};

  // Secret brut STRICTEMENT en memoire, retour au futur service SMTP.
  // Ne jamais afficher, journaliser, envoyer au navigateur du demandeur,
  // ou mettre dans la file d'emails en clair.
  return {issued:true,rawToken};
}

const VERIFY_CHALLENGE_SQL = [
  "SELECT c.id AS challenge_id,c.request_id",
  "FROM cse.registration_email_challenges c",
  "JOIN cse.registration_requests r ON r.id=c.request_id",
  "WHERE c.token_hash=$1",
  "  AND c.consumed_at IS NULL AND c.expires_at > now()",
  "  AND r.email_verified_at IS NULL AND r.expires_at > now()",
  "  AND r.status IN ('pending','approved')",
  "FOR UPDATE OF c,r"
].join("\n");

const CONSUME_SQL = [
  "UPDATE cse.registration_email_challenges",
  "SET consumed_at=now()",
  "WHERE id=$1 AND consumed_at IS NULL AND expires_at > now()",
  "RETURNING id"
].join("\n");

const MARK_EMAIL_SQL = [
  "UPDATE cse.registration_requests",
  "SET email_verified_at=now()",
  "WHERE id=$1 AND email_verified_at IS NULL",
  "  AND status IN ('pending','approved') AND expires_at > now()",
  "RETURNING id"
].join("\n");

const PUBLIC_INVALID = Object.freeze({
  status:"invalid_or_expired",accountActivated:false,emailSent:false
});

async function consumeChallengeInTransaction(client,rawToken) {
  const tokenHash=hashEmailToken(rawToken);
  if(tokenHash===null)return PUBLIC_INVALID;

  const found=await client.query(VERIFY_CHALLENGE_SQL,[tokenHash]);
  if(found.rowCount!==1)return PUBLIC_INVALID;

  const record=found.rows[0];
  const consumed=await client.query(CONSUME_SQL,[record.challenge_id]);
  if(consumed.rowCount!==1)throw new Error("Jeton modifie durant la verification.");

  const marked=await client.query(MARK_EMAIL_SQL,[record.request_id]);
  if(marked.rowCount!==1)throw new Error("Demande modifiee durant la verification.");

  await client.query([
    "INSERT INTO cse.audit_events (action,object_type,object_id,metadata)",
    "VALUES ($1,$2,$3,$4::jsonb)"
  ].join("\n"),[
    "registration.email_verified","registration_request",record.request_id,
    JSON.stringify({source:"single_use_challenge"})
  ]);

  // Verifier l'email n'est pas approuver l'inscription :
  // aucun mot de passe, compte ni privilege salarie n'est cree.
  return {status:"verified",accountActivated:false,emailSent:false};
}

async function verifyEmailChallenge(pool,rawToken) {
  if(hashEmailToken(rawToken)===null)return PUBLIC_INVALID;
  if(!pool || typeof pool.connect!=="function")throw new TypeError("Pool SQL requis.");
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const result=await consumeChallengeInTransaction(client,rawToken);
    await client.query("COMMIT");
    return result;
  } catch(error) {
    try {await client.query("ROLLBACK");} catch {/* best effort */}
    throw error;
  } finally {
    client.release();
  }
}

module.exports={
  hashEmailToken,mintEmailToken,
  issueChallengeInTransaction,consumeChallengeInTransaction,
  verifyEmailChallenge,PUBLIC_INVALID,
  ISSUE_ALLOWED_SQL,INSERT_CHALLENGE_SQL,VERIFY_CHALLENGE_SQL,
  CONSUME_SQL,MARK_EMAIL_SQL
};
