import assert from "node:assert/strict";
import test from "node:test";
import { inviteFormSchema, inviteSubmissionSchema } from "../src/lib/schemas/invite";

const emptyForm = { draft: "", team: "", role: "member", invitees: [] };
const recipient = { email: "first@example.com", team: null, role: null };

test("editing accepts an empty form but submission requires a committed recipient", () => {
  assert.equal(inviteFormSchema.safeParse(emptyForm).success, true);
  assert.equal(inviteSubmissionSchema.safeParse(emptyForm).success, false);
  const drafting = { ...emptyForm, draft: "second@example.com", invitees: [recipient] };
  assert.equal(inviteFormSchema.safeParse(drafting).success, true);
  assert.equal(inviteSubmissionSchema.safeParse(drafting).success, false);
  const submitted = inviteSubmissionSchema.parse({ ...drafting, draft: "  " });
  assert.equal(submitted.draft, "");
  assert.deepEqual(submitted.invitees, [recipient]);
});

test("email validation trims surrounding whitespace and rejects malformed addresses", () => {
  assert.equal(inviteFormSchema.parse({ ...emptyForm, draft: "  first@example.com  " }).draft, "first@example.com");
  for (const email of ["invalid", "broken@", "a..b@example.com", "a@example..com"]) {
    assert.equal(inviteFormSchema.safeParse({ ...emptyForm, draft: email }).success, false, email);
    assert.equal(inviteSubmissionSchema.safeParse({ ...emptyForm, invitees: [{ ...recipient, email }] }).success, false, email);
  }
});

test("duplicate drafts and recipients produce errors on the matching fields", () => {
  const draft = inviteFormSchema.safeParse({ ...emptyForm, draft: " first@example.com ", invitees: [recipient] });
  assert.equal(draft.success, false);
  if (!draft.success) assert.deepEqual(draft.error.issues[0].path, ["draft"]);
  const list = inviteSubmissionSchema.safeParse({ ...emptyForm, invitees: [recipient, { ...recipient, email: " first@example.com " }] });
  assert.equal(list.success, false);
  if (!list.success) assert.deepEqual(list.error.issues[0].path, ["invitees", 1, "email"]);
});

test("roles are validated while null overrides and explicit unassigned teams are preserved", () => {
  for (const role of ["member", "lead", "viewer", "admin"]) {
    const values = { ...emptyForm, role, invitees: [{ ...recipient, team: "", role }] };
    assert.deepEqual(inviteSubmissionSchema.parse(values), values);
  }
  assert.equal(inviteFormSchema.safeParse({ ...emptyForm, role: "owner" }).success, false);
  assert.equal(inviteSubmissionSchema.safeParse({ ...emptyForm, invitees: [{ ...recipient, role: "owner" }] }).success, false);
});
