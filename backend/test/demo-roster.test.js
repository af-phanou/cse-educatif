"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertSameDemoEntries, fixture } = require("../src/demo-roster-cli");

function makeRows() {
  return fixture.entries.map(row => ({
    source_line: row.sourceLine,
    last_name: row.lastName,
    first_name: row.firstName,
    establishment_number: row.establishmentNumber,
    match_key: row.matchKey
  }));
}

test("le CSV de demonstration ne comporte que des identites manifestement fictives", () => {
  assert.equal(fixture.summary.rows, 3);
  assert.equal(fixture.summary.duplicateRows, 1);
  assert.equal(fixture.summary.ambiguousGroups, 1);
  assert.deepEqual(fixture.summary.establishments, [
    {code:"01",count:2},{code:"05",count:1}
  ]);
  assert.ok(fixture.entries.every(row => row.lastName === "FICTIFTEST"));
});

test("la verification autorise exclusivement les trois lignes du fichier fictif", () => {
  assert.doesNotThrow(() => assertSameDemoEntries(makeRows()));
});

test("le nettoyage ne peut pas supprimer un lot avec un autre nom", () => {
  const altered = makeRows();
  altered[0].last_name = "DUPONT";
  assert.throws(() => assertSameDemoEntries(altered), /differe/);
});

test("le nettoyage refuse un autre etablissement ou une autre ligne", () => {
  const altered = makeRows();
  altered[1].establishment_number = "09";
  assert.throws(() => assertSameDemoEntries(altered), /differe/);
  const changed = makeRows();
  changed[0].source_line = 89;
  assert.throws(() => assertSameDemoEntries(changed), /differe/);
});

test("le nettoyage refuse une ligne supplementaire ou manquante", () => {
  assert.throws(() => assertSameDemoEntries(makeRows().slice(0,2)), /exactement/);
  assert.throws(() => assertSameDemoEntries([...makeRows(),makeRows()[0]]), /exactement/);
});
