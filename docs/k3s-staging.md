# k3s Staging Deployment

This is the first Kubernetes-like deployment path for the new Solid Stats backend stack.
The current staging slice covers only:

- `server-2`
- `replay-parser-2`
- `replays-fetcher`

`web` is intentionally left for the next deployment slice. The existing relay and Discord bot are not part of this rollout.

## Target

- Runtime: single-node k3s on the existing VPS.
- Namespace: `solid-stats-staging` by default.
- Public host: `stats-staging.solid-stats.ru`.
- Object storage: Timeweb Cloud S3-compatible storage.
- S3 endpoint: `https://s3.twcstorage.ru`.
- S3 region: `ru-1`.
- TLS: cert-manager with a `letsencrypt-production` ClusterIssuer.
- Images: GHCR, tagged by full commit SHA and branch.

The existing VPS already uses host nginx for the current public site on ports 80
and 443. The staging k3s install therefore disables the bundled Traefik and
ServiceLB components:

```bash
INSTALL_K3S_EXEC="server --disable=traefik --disable=servicelb --secrets-encryption --write-kubeconfig-mode=600"
```

This keeps the old production routes intact. The Kubernetes manifests still
target an ingress class named `traefik`; before exposing
`stats-staging.solid-stats.ru`, add an ingress controller/proxy route that
provides that class without taking over the host nginx ports, or adjust
`deploy/k8s/staging/40-ingress.yaml` to the chosen ingress class.

## Server prerequisites

Install and verify these on the VPS before enabling CD:

```bash
kubectl get nodes
kubectl get storageclass
kubectl get clusterissuer
```

Expected cluster components for CD:

- k3s running on the VPS.
- cert-manager installed.
- `ClusterIssuer/letsencrypt-production` installed.
- A default `ReadWriteOnce` storage class for Postgres and RabbitMQ PVCs.
- A non-root deploy user whose SSH key is stored in GitHub environment secrets.

Expected cluster component before public API validation:

- Traefik ingress, or an equivalent ingress controller, available under the
  class name used by `deploy/k8s/staging/40-ingress.yaml`.

## GitHub environment

Create a protected GitHub Environment named `staging` in each of the three repositories.

Common variables:

- `REPLAYS_FETCHER_REPLAY_SOURCE_URL` - optional; defaults to `https://sg.zone/replays`.
- `REPLAYS_FETCHER_REPLAY_SOURCE_TRANSPORT` - optional; defaults to `direct`.

Common secrets:

- `CD_SSH_HOST`
- `CD_SSH_PORT` - optional; defaults to `22`.
- `CD_SSH_USER`
- `CD_SSH_PRIVATE_KEY`
- `GHCR_USERNAME` - optional; defaults to the workflow actor.
- `GHCR_TOKEN` - required PAT with package read access for the k3s image pull secret.

`server-2` secrets:

- `POSTGRES_PASSWORD`
- `RABBITMQ_PASSWORD`
- `SERVER2_DATABASE_URL`
- `SERVER2_RABBITMQ_URL`
- `SERVER2_S3_BUCKET`
- `SERVER2_S3_ACCESS_KEY_ID`
- `SERVER2_S3_SECRET_ACCESS_KEY`
- `SERVER2_BOOTSTRAP_ADMIN_STEAM_ID` - optional.

`replay-parser-2` secrets:

- `REPLAY_PARSER_AMQP_URL`
- `REPLAY_PARSER_S3_BUCKET`
- `REPLAY_PARSER_AWS_ACCESS_KEY_ID`
- `REPLAY_PARSER_AWS_SECRET_ACCESS_KEY`

`replays-fetcher` secrets:

- `REPLAYS_FETCHER_DATABASE_URL`
- `REPLAYS_FETCHER_S3_BUCKET`
- `REPLAYS_FETCHER_S3_ACCESS_KEY_ID`
- `REPLAYS_FETCHER_S3_SECRET_ACCESS_KEY`
- `REPLAYS_FETCHER_REPLAY_SOURCE_SSH_HOST` - only when SSH source transport is used.
- `REPLAYS_FETCHER_REPLAY_SOURCE_SSH_COMMAND` - only when SSH source transport is used.

The workflows render Kubernetes Secret manifests from these values during deployment, copy them to `/tmp` on the VPS, apply them, and remove the temporary files.

## Deployment order

Deploy in this order for the first rollout:

1. `server-2` - creates namespace, Postgres, RabbitMQ, API config, ingress, runtime secrets, and runs migrations.
2. `replay-parser-2` - deploys the parser worker.
3. `replays-fetcher` - deploys a suspended CronJob for manual replay ingestion.

The `server-2` workflow runs the migration job before rolling the API image.

## Manual full ingest run

`replays-fetcher` is deployed as a suspended CronJob so the first production-scale run is explicit.

Start one run:

```bash
kubectl -n solid-stats-staging create job \
  --from=cronjob/replays-fetcher \
  "replays-fetcher-full-$(date +%Y%m%d%H%M%S)"
```

Watch it:

```bash
kubectl -n solid-stats-staging get jobs,pods -l app.kubernetes.io/name=replays-fetcher
kubectl -n solid-stats-staging logs -l app.kubernetes.io/name=replays-fetcher --tail=200 -f
```

Unsuspend scheduled ingest only after the full validation pass is accepted:

```bash
kubectl -n solid-stats-staging patch cronjob replays-fetcher -p '{"spec":{"suspend":false}}'
```

## Rollback

Each workflow pushes a full-SHA image tag to GHCR. Roll back a workload by setting its previous image:

```bash
kubectl -n solid-stats-staging set image deployment/server-2 server-2=ghcr.io/solid-stats/server-2:<previous-sha>
kubectl -n solid-stats-staging rollout status deployment/server-2
```

Use the matching deployment name/container for `replay-parser-2`.

For `replays-fetcher`, update the CronJob image:

```bash
kubectl -n solid-stats-staging set image cronjob/replays-fetcher replays-fetcher=ghcr.io/solid-stats/replays-fetcher:<previous-sha>
```
