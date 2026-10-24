FROM golang:1.24.13-alpine3.23 AS build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local

# MinIO RELEASE.2025-09-07T16-13-09Z and mc RELEASE.2025-08-13T08-35-41Z.
RUN go install -trimpath github.com/minio/minio@07c3a429bfed433e49018cb0f78a52145d4bedeb \
    && go install -trimpath github.com/minio/mc@7394ce0dd2a80935aded936b09fa12cbb3cb8096

FROM alpine:3.23.2 AS runtime
RUN apk add --no-cache ca-certificates curl

FROM runtime AS minio
COPY --from=build /go/bin/minio /usr/local/bin/minio
ENTRYPOINT ["minio"]

FROM runtime AS mc
COPY --from=build /go/bin/mc /usr/local/bin/mc
ENTRYPOINT ["mc"]
