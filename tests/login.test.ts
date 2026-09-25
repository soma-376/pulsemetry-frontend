import assert from "node:assert/strict";
import test from "node:test";
import { resolveDemoAdmin, resolveDemoLogin } from "../src/lib/auth";
import { inquirySchema } from "../src/lib/schemas/auth";

test("SSO organization lookup validates complete email domains", () => {
  assert.equal(resolveDemoLogin({ email: " ADMIN@CODEWORKS.IO " }).kind, "sso");
  for (const email of ["admin@newco.example", "a@unknown.example", "a@codeworks.io.evil.com"]) assert.equal(resolveDemoLogin({ email }).kind, "unknown");
  for (const email of ["", "a@", "a@@codeworks.io", "a..b@codeworks.io", "a@__proto__"]) assert.equal(resolveDemoLogin({ email }).kind, "invalid");
});

test("matching an organization domain does not grant a demo manager session", () => {
  assert.equal(resolveDemoLogin({ email: "developer@codeworks.io" }).kind, "sso");
  assert.equal(resolveDemoAdmin("developer@codeworks.io"), null);
  assert.equal(resolveDemoAdmin("admin@codeworks.io.evil.com"), null);
  assert.equal(resolveDemoAdmin("admin@codeworks.io")?.organizationId, "org-codeworks");
  assert.equal(inquirySchema.safeParse({ company: " ", email: "a@example.com" }).success, false);
});
