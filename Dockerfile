# Skill Management image.
#
# No site's locations are baked in: the image registry prefix, the Ubuntu apt
# mirror, the npm registry and the proxy all come from the site's env file
# (work.env or home.env) through docker-compose.yml. NPM_REGISTRY is required;
# the others may be empty (empty = Docker Hub / Ubuntu's own mirrors / no proxy).
#
# Classic builder only - no BuildKit-only syntax - because the work build host
# has no buildx.
#
# Images are pinned by digest; a digest is the same behind a registry mirror,
# only the prefix in front of it changes. image-pins.json records when each
# pinned manifest was pushed; test/deployment.test.ts refuses a pin younger
# than 72 hours.
ARG IMAGE_REGISTRY=
ARG IMAGE_NODE=node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
ARG IMAGE_UBUNTU=ubuntu:noble-20260905@sha256:a053cbffda9d424679c103c5b4f452297efc3774a1e491c110289f726fbb5d34

# ---- stage 1: dependencies from the lockfile through the 72-hour gate, then the build
FROM ${IMAGE_REGISTRY}${IMAGE_NODE} AS build
ARG NPM_REGISTRY=
ARG NPM_TOKEN=
ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ARG NO_PROXY=localhost,127.0.0.1
WORKDIR /build
# Site CA certificates (certs/*.crt, gitignored) for a registry or proxy that
# presents an internal certificate.
COPY certs/ /tmp/site-certs/
COPY package.json package-lock.json deps-publish-times.json ./
COPY scripts/check-release-age.cjs scripts/
# Proxy and token are exported inside this one step only and never persisted.
# The token is scoped to the registry and removed again in the same step.
# Then the 72-hour supply-chain gate: --offline judges from the committed
# cache only and never asks a public registry from inside the build.
RUN set -eux; \
    : "${NPM_REGISTRY:?NPM_REGISTRY is not set - build with: docker compose --env-file work.env up --build (or home.env)}"; \
    if [ -n "${HTTP_PROXY}" ]; then export http_proxy="${HTTP_PROXY}" https_proxy="${HTTPS_PROXY}" no_proxy="${NO_PROXY}" HTTP_PROXY HTTPS_PROXY NO_PROXY; fi; \
    if ls /tmp/site-certs/*.crt >/dev/null 2>&1; then cat /tmp/site-certs/*.crt > /tmp/site-ca.pem; export NODE_EXTRA_CA_CERTS=/tmp/site-ca.pem; npm config set cafile /tmp/site-ca.pem; fi; \
    npm config set registry "${NPM_REGISTRY}"; \
    AUTH_KEY="$(printf '%s' "${NPM_REGISTRY}" | sed -E 's#^https?:##; s#/*$#/#'):_authToken"; \
    if [ -n "${NPM_TOKEN}" ]; then npm config set "${AUTH_KEY}" "${NPM_TOKEN}"; fi; \
    npm ci --no-audit --no-fund; \
    rm -f /root/.npmrc; \
    node scripts/check-release-age.cjs --hours 72 --offline

COPY . .
# Telemetry off and no font downloads (the font is the self-hosted geist package):
# the build reaches nothing on the internet.
RUN set -eux; \
    NEXT_TELEMETRY_DISABLED=1 npm run build; \
    cp -r .next/static .next/standalone/.next/static; \
    if [ -d public ]; then cp -r public .next/standalone/public; fi; \
    cp -r drizzle .next/standalone/drizzle; \
    test -f .next/standalone/server.js

# ---- stage 2: Ubuntu with the Node runtime and the standalone server copied in
FROM ${IMAGE_REGISTRY}${IMAGE_UBUNTU}
ARG APT_MIRROR=
ARG HTTP_PROXY=
ARG HTTPS_PROXY=
ARG NO_PROXY=localhost,127.0.0.1
ENV DEBIAN_FRONTEND=noninteractive
RUN set -eux; \
    if [ -n "${HTTP_PROXY}" ]; then export http_proxy="${HTTP_PROXY}" https_proxy="${HTTPS_PROXY}" no_proxy="${NO_PROXY}"; fi; \
    if [ -n "${APT_MIRROR}" ]; then \
      sed -i "s#http://archive.ubuntu.com/ubuntu/#${APT_MIRROR}/#; s#http://security.ubuntu.com/ubuntu/#${APT_MIRROR}/#" \
        /etc/apt/sources.list.d/ubuntu.sources; \
    fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl; \
    rm -rf /var/lib/apt/lists/*

COPY certs/ /usr/local/share/ca-certificates/site/
RUN set -eux; update-ca-certificates

# The official Node binary needs only glibc and libstdc++, both in Ubuntu 24.04.
COPY --from=build /usr/local/bin/node /usr/local/bin/node

WORKDIR /app
COPY --from=build /build/.next/standalone ./

# Ubuntu 24.04 already has a user "ubuntu" (uid 1000); the app gets its own
# system user. The app keeps no state on disk: everything is in PostgreSQL.
RUN set -eux; \
    userdel -r ubuntu 2>/dev/null || true; \
    useradd -r -u 10001 -d /app -s /usr/sbin/nologin skills; \
    mkdir -p /app/.next/cache; \
    chown -R skills:skills /app/.next/cache; \
    node --version

# Nothing from the build environment reaches the runtime layer: no registry,
# no token, no proxy. The running app makes no outbound calls.
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    MIGRATIONS_DIR=/app/drizzle \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

USER skills
EXPOSE 8080

# curl, not a Node one-liner: a language runtime every 30 s costs about a
# second of CPU. --noproxy: a proxy must never see a loopback probe.
HEALTHCHECK --interval=30s --timeout=6s --start-period=40s --retries=3 \
    CMD curl -fsS --noproxy '*' -o /dev/null --max-time 4 "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "server.js"]
