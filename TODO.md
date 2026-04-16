# TODO

## Current state: all commands verified

HashiCorp Vault's KV engine read/write commands pass against a
locally-running Vault dev server in the E2E.

## Potential additions

- [ ] Transit secrets engine — `encrypt`, `decrypt`, `sign`,
      `verify` on a named key. Workflows doing field-level
      encryption of PII between systems would use this.
- [ ] PKI engine — `issue` a leaf cert under a role. Useful for
      workflows that provision short-lived mTLS certs for service
      calls.
- [ ] Database secrets engine — dynamic DB credentials with
      automatic rotation. `lease-renew` / `lease-revoke` are the
      lifecycle commands.
- [ ] Namespaces — Vault Enterprise feature for multi-tenancy. Our
      current commands assume the default namespace; add a
      `namespace` input that threads through when set.
- [ ] Approle auth — wrap login via approle so workflows can bootstrap
      their own Vault token rather than needing one pre-provisioned.

## Docs

- [ ] `docs/guide.md` covers the KV read/write happy path but
      doesn't explain the KV v1 vs v2 distinction (v2 has
      versioning, different paths, soft-delete). Today the action
      assumes v2; document that.

## Testing hygiene

- [ ] E2E currently runs against a dev Vault (in-memory, no
      persistence, root token). Add a variant that runs against a
      file-backed Vault so the test also covers the realistic
      persistence/unseal flow.
