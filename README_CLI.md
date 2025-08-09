# SGN CLI (alpha)

Commands:

- Publish: `npm run sgn -- publish --file examples/ku-react18.json [--sign --priv keys/ed25519_private.pem --pub keys/ed25519_public.pem]`
- Fetch: `npm run sgn -- fetch <cid>`
- Verify: `npm run sgn -- verify <cid> --pub keys/ed25519_public.pem`

Notes:

- Sign/verify uses Node crypto Ed25519 (PEM keys). Use `ssh-keygen -t ed25519 -m PEM -f keys/ed25519` and convert to PKCS#8/SPKI as needed.
- CID uses BLAKE3 of canonicalized KU fields (schema_id, type, content_type, payload, parents, sources, tests, provenance, tags).
