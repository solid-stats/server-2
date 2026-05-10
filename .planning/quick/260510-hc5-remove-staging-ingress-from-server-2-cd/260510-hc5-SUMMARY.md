---
status: complete
quick_id: 260510-hc5
implementation_commit: dbe5025
---

# Quick Task 260510-hc5 Summary

Removed the obsolete staging ingress path from `server-2` deployment:

- `.github/workflows/cd.yml` no longer applies `deploy/k8s/staging/40-ingress.yaml`.
- `deploy/k8s/staging/40-ingress.yaml` was deleted.
- `docs/k3s-staging.md` now documents host nginx TLS/proxying instead of
  cert-manager/Traefik ingress.

Verification performed:

- `pnpm exec prettier --check .github/workflows/cd.yml docs/k3s-staging.md`
- `ruby -e 'require "yaml"; YAML.load_file(".github/workflows/cd.yml"); puts "workflow yaml ok"'`
- Static deploy stream check confirmed no `Ingress`, cert-manager annotation, or
  staging TLS secret remains.

