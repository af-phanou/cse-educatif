"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { allowedOrigin, readRegistrationBody, makeRateLimiter } = require("../src/registration-http");

function makeReq(data, contentType = "application/json") {
  const req = Readable.from([Buffer.from(data,"utf8")]);
  req.headers = {"content-type":contentType};
  return req;
}

test("accepte seulement les deux origines HTTPS officielles", () => {
  assert.equal(allowedOrigin("https://cse-educatif-rxtg.fr"),true);
  assert.equal(allowedOrigin("https://www.cse-educatif-rxtg.fr"),true);
  assert.equal(allowedOrigin("http://cse-educatif-rxtg.fr"),false);
  assert.equal(allowedOrigin("https://evil.example"),false);
  assert.equal(allowedOrigin(undefined),false);
});

test("lit un JSON de formulaire limite sans le mettre dans des logs", async () => {
  const parsed = await readRegistrationBody(makeReq(JSON.stringify({firstName:"Alice"})));
  assert.deepEqual(parsed, {firstName:"Alice"});
});

test("rejette les types de contenu inconnus et les tableaux JSON", async () => {
  await assert.rejects(() => readRegistrationBody(makeReq("{}","text/plain")));
  await assert.rejects(() => readRegistrationBody(makeReq("[]")));
});

test("rejette le JSON malforme", async () => {
  await assert.rejects(() => readRegistrationBody(makeReq("{broken")));
});

test("rejette un corps de plus de 8192 octets", async () => {
  await assert.rejects(() => readRegistrationBody(makeReq(JSON.stringify({x:"x".repeat(8200)}))));
});

test("limite les requetes independamment pour chaque adresse et fenetre", () => {
  const limiter = makeRateLimiter();
  const t = 1_000_000;
  assert.equal(limiter.allow("192.0.2.10",t),true);
  assert.equal(limiter.allow("192.0.2.10",t),true);
  assert.equal(limiter.allow("192.0.2.10",t),true);
  assert.equal(limiter.allow("192.0.2.10",t),true);
  assert.equal(limiter.allow("192.0.2.10",t),false);
  assert.equal(limiter.allow("192.0.2.11",t),true);
  assert.equal(limiter.allow("192.0.2.10",t+16*60*1000),true);
});
