#!/bin/sh
# tls-init: runs once on every "docker compose up", as root, with no network,
# before the app starts.
#
#   - No certificate in TLS_DIR yet: makes a self-signed one, so the app always
#     starts on HTTPS. It covers localhost, 127.0.0.1, the host in APP_URL and
#     every name in TLS_HOSTNAMES. Browsers warn about it until a real
#     certificate is installed with scripts/install-cert.sh.
#   - A certificate is there: it is never touched - except one this script made
#     itself, which is made again when it expires within 30 days or no longer
#     covers APP_URL's host or TLS_HOSTNAMES.
#   - Either way the folder and the pair are given to the app's user (APP_UID),
#     so a file copied in by someone else still works: tls.key 0600, tls.crt 0644.
set -eu

dir="${TLS_DIR:-/tls}"
uid="${APP_UID:-10001}"
mark="Skill Management self-signed"
crt="$dir/tls.crt"
key="$dir/tls.key"
export HOME=/tmp
umask 077
mkdir -p "$dir"

# the host people type: APP_URL without scheme, credentials, port and path
host="$(printf '%s' "${APP_URL:-}" | sed -E 's#^[a-zA-Z]+://##; s#^[^@/]*@##; s#/.*$##; s#^\[([^]]*)\].*$#\1#; s#^([^:]+):[0-9]+$#\1#')"
names="localhost 127.0.0.1 ${host} $(printf '%s' "${TLS_HOSTNAMES:-}" | tr ',' ' ')"

is_ip() { printf '%s' "$1" | grep -Eq '^[0-9.]+$|:'; }
covers() { # covers <cert> <name>
  if is_ip "$2"; then how=-checkip; else how=-checkhost; fi
  openssl x509 -in "$1" -noout "$how" "$2" 2>/dev/null | grep -q "does match"
}

make_self_signed() {
  san="" seen=" "
  for n in $names; do
    case "$seen" in *" $n "*) continue ;; esac
    seen="$seen$n "
    if is_ip "$n"; then san="$san,IP:$n"; else san="$san,DNS:$n"; fi
  done
  cn="${host:-localhost}"
  tmp="$(mktemp -d)"
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes \
    -keyout "$tmp/tls.key" -out "$tmp/tls.crt" -days 397 \
    -subj "/CN=$cn/O=$mark" \
    -addext "subjectAltName=${san#,}" \
    -addext "basicConstraints=critical,CA:FALSE" \
    -addext "keyUsage=critical,digitalSignature" \
    -addext "extendedKeyUsage=serverAuth" 2>"$tmp/err" || { cat "$tmp/err" >&2; rm -rf "$tmp"; exit 1; }
  mv -f "$tmp/tls.key" "$key"
  mv -f "$tmp/tls.crt" "$crt"
  rm -rf "$tmp"
  echo "tls-init: made a self-signed certificate for ${san#,} (valid 397 days)."
  echo "tls-init: browsers will warn until a real one is installed: bash scripts/install-cert.sh <downloaded file>"
}

if [ ! -f "$crt" ] && [ ! -f "$key" ]; then
  make_self_signed
elif [ ! -f "$crt" ] || [ ! -f "$key" ]; then
  # half a pair cannot be served; keep it aside rather than delete anything
  aside="$dir/incomplete-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$aside"
  for f in "$crt" "$key"; do [ -f "$f" ] && mv "$f" "$aside/"; done
  echo "tls-init: only half a certificate pair was in $dir; moved to $aside" >&2
  make_self_signed
elif openssl x509 -in "$crt" -noout -subject 2>/dev/null | grep -q "$mark"; then
  why=""
  openssl x509 -in "$crt" -noout -checkend $((30 * 86400)) >/dev/null 2>&1 || why="it expires within 30 days"
  for n in $names; do covers "$crt" "$n" || why="${why:-it does not cover $n}"; done
  if [ -n "$why" ]; then
    echo "tls-init: making the self-signed certificate again: $why"
    make_self_signed
  else
    echo "tls-init: self-signed certificate in place, until $(openssl x509 -in "$crt" -noout -enddate | sed 's/^notAfter=//')"
  fi
else
  echo "tls-init: installed certificate kept: $(openssl x509 -in "$crt" -noout -subject 2>/dev/null | sed 's/^subject=//'), until $(openssl x509 -in "$crt" -noout -enddate 2>/dev/null | sed 's/^notAfter=//')"
fi

chown "$uid:$uid" "$dir" "$crt" "$key"
chmod 0755 "$dir"
chmod 0644 "$crt"
chmod 0600 "$key"
