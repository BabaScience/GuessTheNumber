import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_DATABASE,
  resolveMongoConfig,
  stripInlineCredentials,
} from "../lib/mongo-config.ts";

const URI = "mongodb+srv://cluster0.abcde.mongodb.net/?retryWrites=true&w=majority";

const full = {
  MONGODB_URI: URI,
  MONGODB_USERNAME: "duel",
  MONGODB_PASSWORD: "p@ss:word/with-specials",
};

describe("resolveMongoConfig", () => {
  it("reports 'not configured' when nothing is set", () => {
    const result = resolveMongoConfig({});
    assert.equal(result.configured, false);
  });

  it("accepts a complete set", () => {
    const result = resolveMongoConfig(full);
    assert.equal(result.configured && result.ok, true);
    if (!(result.configured && result.ok)) return;
    assert.equal(result.config.username, "duel");
    assert.equal(result.config.password, "p@ss:word/with-specials");
    assert.equal(result.config.database, DEFAULT_DATABASE);
  });

  it("takes an explicit database name", () => {
    const result = resolveMongoConfig({ ...full, MONGODB_DB: "duels_prod" });
    assert.ok(result.configured && result.ok);
    if (!(result.configured && result.ok)) return;
    assert.equal(result.config.database, "duels_prod");
  });

  for (const missing of ["MONGODB_URI", "MONGODB_USERNAME", "MONGODB_PASSWORD"] as const) {
    it(`fails loudly when ${missing} is absent`, () => {
      // A partial config must not fall back to memory: that is the failure
      // that looks fine until two people try to play.
      const result = resolveMongoConfig({ ...full, [missing]: "" });
      assert.equal(result.configured, true);
      assert.equal(result.configured && result.ok, false);
      if (!(result.configured && !result.ok)) return;
      assert.match(result.error, new RegExp(missing));
    });
  }

  it("rejects a URI with the scheme missing", () => {
    const result = resolveMongoConfig({ ...full, MONGODB_URI: "cluster0.abcde.mongodb.net" });
    assert.equal(result.configured && result.ok, false);
  });

  it("rejects an Atlas template whose placeholders were never replaced", () => {
    const result = resolveMongoConfig({
      ...full,
      MONGODB_URI: "mongodb+srv://<db_username>:<db_password>@cluster0.abcde.mongodb.net/",
    });
    assert.equal(result.configured && result.ok, false);
    if (!(result.configured && !result.ok)) return;
    assert.match(result.error, /placeholder/i);
  });

  it("ignores surrounding whitespace, which pasted values collect", () => {
    const result = resolveMongoConfig({
      MONGODB_URI: `  ${URI}  `,
      MONGODB_USERNAME: " duel ",
      MONGODB_PASSWORD: "secret",
    });
    assert.ok(result.configured && result.ok);
    if (!(result.configured && result.ok)) return;
    assert.equal(result.config.uri, URI);
    assert.equal(result.config.username, "duel");
  });
});

describe("stripInlineCredentials", () => {
  it("leaves a credential-free URI alone", () => {
    assert.equal(stripInlineCredentials(URI), URI);
  });

  it("removes credentials pasted into the URI", () => {
    assert.equal(
      stripInlineCredentials("mongodb+srv://duel:secret@cluster0.abcde.mongodb.net/db"),
      "mongodb+srv://cluster0.abcde.mongodb.net/db",
    );
  });

  it("handles an unescaped @ in the password", () => {
    // Ambiguous as a URI, which is exactly why credentials are passed to the
    // driver separately — but the strip must still clear the whole authority.
    assert.equal(
      stripInlineCredentials("mongodb+srv://duel:p@ss@cluster0.abcde.mongodb.net/db"),
      "mongodb+srv://cluster0.abcde.mongodb.net/db",
    );
  });

  it("works for the non-SRV scheme too", () => {
    assert.equal(
      stripInlineCredentials("mongodb://duel:secret@localhost:27017/db"),
      "mongodb://localhost:27017/db",
    );
  });

  it("does not mistake a path segment for credentials", () => {
    assert.equal(
      stripInlineCredentials("mongodb://localhost:27017/db?authSource=admin"),
      "mongodb://localhost:27017/db?authSource=admin",
    );
  });
});
