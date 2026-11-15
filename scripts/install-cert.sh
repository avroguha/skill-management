#!/usr/bin/env bash
# install-cert.sh - put a company certificate in place for Skill Management.
#
#   bash scripts/install-cert.sh ~/skills.pem
#   bash scripts/install-cert.sh skills.pfx --host skills.avro.com
#   bash scripts/install-cert.sh skills.pem --env-file home.env
#
# Takes what the certificate service hands out:
#   * a PEM bundle (PKCS#8): the private key - with a password or without -
#     plus the certificate and its chain (intermediates, root) in any order;
#   * or a PFX / PKCS#12 file (.pfx, .p12) holding the same.
# and writes what the app reads, in the certificate folder (TLS_DIR):
#   tls.crt  the server certificate first, then its intermediates (PEM)
#   tls.key  the private key without a password (PEM), readable by the app's
#            user only (0600)
# both owned by uid 10001, the user the container runs as.
#
# It asks for the password (nothing is echoed or passed on a command line),
# checks the key belongs to the certificate and that the certificate has not
# expired, keeps the old pair in <folder>/backup-<time>/, and replaces the files
# in one step; on any failure nothing changes. The app switches to the new
# certificate within a minute, without a restart (a restart works too:
# docker compose --env-file work.env restart app).
#
# Options:
#   --dir DIR        the certificate folder (default: TLS_DIR from the env file)
#   --env-file FILE  the env file to read TLS_DIR from (default: work.env, or
#                    home.env when there is no work.env)
#   --host NAME      also check the certificate covers this name or IP address
# For automation the password can come from SKM_CERT_PASSWORD instead of the prompt.
set -euo pipefail

die() { echo "install-cert: $*" >&2; exit 1; }
say() { echo "  $*"; }

src="" dir="" host="" envfile=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) dir="${2:?--dir needs a folder}"; shift 2 ;;
    --env-file) envfile="${2:?--env-file needs a file}"; shift 2 ;;
    --host) host="${2:?--host needs a name}"; shift 2 ;;
    -h|--help) sed -n '2,31p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) die "unknown option $1 (see --help)" ;;
    *) [ -z "$src" ] || die "give one certificate file"; src="$1"; shift ;;
  esac
done
[ -n "$src" ] || die "usage: $0 <certificate file> [--host name] [--env-file work.env | --dir folder]"
[ -f "$src" ] || die "$src: no such file"
command -v openssl >/dev/null || die "openssl is needed (sudo apt-get install openssl)"

here="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "$dir" ]; then
  # TLS_DIR as docker compose reads it: from the env file, relative to the project folder
  if [ -z "$envfile" ]; then
    if [ -f "$here/work.env" ]; then envfile="$here/work.env"; else envfile="$here/home.env"; fi
  fi
  case "$envfile" in /*) ;; *) [ -f "$envfile" ] || envfile="$here/$envfile" ;; esac
  [ -f "$envfile" ] || die "$envfile: no such env file (or give the folder with --dir)"
  dir="$(sed -n 's/^TLS_DIR=//p' "$envfile" | tr -d '\r' | tail -1)"
  [ -n "$dir" ] || die "no TLS_DIR in $envfile (or give the folder with --dir)"
  case "$dir" in /*) ;; *) dir="$here/$dir" ;; esac
fi
mkdir -p "$dir" 2>/dev/null || sudo -n mkdir -p "$dir" || die "cannot create $dir"
# the user the app runs as (Dockerfile: useradd -u 10001); the test overrides it
APP_UID="${SKM_APP_UID:-10001}"

umask 077
work="$(mktemp -d)"
cleanup() { find "$work" -type f -exec sh -c 'for f; do : > "$f"; done' _ {} + 2>/dev/null; rm -rf "$work"; }
trap cleanup EXIT

# The password, asked once and only if needed; it travels to openssl in the
# environment (-passin env:), never on a command line where ps would show it.
export SKM_CERT_PASSWORD="${SKM_CERT_PASSWORD-}"
asked=0
ask_password() {
  [ "$asked" = 1 ] && return
  if [ -z "$SKM_CERT_PASSWORD" ]; then
    [ -t 0 ] || die "the key has a password: run this in a terminal, or set SKM_CERT_PASSWORD"
    read -r -s -p "Password of the certificate's private key: " SKM_CERT_PASSWORD; echo
    export SKM_CERT_PASSWORD
  fi
  asked=1
}

echo "Reading $src"
if grep -q -- "-----BEGIN" "$src"; then
  # ---- PEM bundle: split it into the key and the certificates ----
  tr -d '\r' < "$src" > "$work/bundle.pem"
  awk -v d="$work" '
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/ { out = d "/key.in"; keys++ }
    /-----BEGIN CERTIFICATE-----/        { out = d "/cert" (++n) ".pem" }
    out { print > out }
    /-----END / { out = "" }
    END { if (keys > 1) print "more than one private key in the file" > "/dev/stderr" }' "$work/bundle.pem"
  [ -s "$work/key.in" ] || die "no private key in $src - download the bundle that includes the key"
  ls "$work"/cert*.pem >/dev/null 2>&1 || die "no certificate in $src"
  if grep -q -- "ENCRYPTED" "$work/key.in"; then
    ask_password
    openssl pkey -in "$work/key.in" -passin env:SKM_CERT_PASSWORD -out "$work/key.pem" 2>"$work/err" \
      || die "could not open the private key - wrong password? ($(head -1 "$work/err"))"
  else
    say "the private key has no password"
    openssl pkey -in "$work/key.in" -out "$work/key.pem" 2>"$work/err" || die "the private key is not readable: $(head -1 "$work/err")"
  fi
else
  # ---- PFX / PKCS#12 ----
  ask_password
  p12() { openssl pkcs12 -in "$src" -passin env:SKM_CERT_PASSWORD "$@" 2>"$work/err" || openssl pkcs12 -legacy -in "$src" -passin env:SKM_CERT_PASSWORD "$@" 2>"$work/err"; }
  p12 -nocerts -nodes -out "$work/key.raw" || die "could not open $src - wrong password, or not a PFX/PKCS#12 file? ($(head -1 "$work/err"))"
  p12 -nokeys -out "$work/certs.raw" || die "no certificates in $src"
  openssl pkey -in "$work/key.raw" -out "$work/key.pem" 2>"$work/err" || die "no private key in $src"
  awk -v d="$work" '/-----BEGIN CERTIFICATE-----/ { out = d "/cert" (++n) ".pem" } out { print > out } /-----END CERTIFICATE-----/ { out = "" }' "$work/certs.raw"
fi

# ---- which certificate is the server's: the one whose public key is the key's ----
openssl pkey -in "$work/key.pem" -pubout -out "$work/key.pub"
leaf=""
for c in "$work"/cert*.pem; do
  openssl x509 -in "$c" -noout -pubkey > "$work/c.pub" 2>/dev/null || continue
  if cmp -s "$work/key.pub" "$work/c.pub"; then leaf="$c"; break; fi
done
[ -n "$leaf" ] || die "none of the certificates in $src belongs to its private key"

# ---- the chain: leaf, its issuer, that one's issuer... (the root is left out:
# browsers have it already, and sending it only slows every handshake) ----
cp "$leaf" "$work/chain.pem"
cur="$leaf"; used="$leaf"; inter=0; root=0
for _ in 1 2 3 4 5 6 7 8; do
  issuer="$(openssl x509 -in "$cur" -noout -issuer -nameopt RFC2253 | sed 's/^issuer=//')"
  next=""
  for c in "$work"/cert*.pem; do
    case " $used " in *" $c "*) continue ;; esac
    subj="$(openssl x509 -in "$c" -noout -subject -nameopt RFC2253 | sed 's/^subject=//')"
    [ "$subj" = "$issuer" ] && { next="$c"; break; }
  done
  [ -n "$next" ] || break
  used="$used $next"
  s="$(openssl x509 -in "$next" -noout -subject -nameopt RFC2253 | sed 's/^subject=//')"
  i="$(openssl x509 -in "$next" -noout -issuer -nameopt RFC2253 | sed 's/^issuer=//')"
  if [ "$s" = "$i" ]; then root=1; break; fi
  cat "$next" >> "$work/chain.pem"; inter=$((inter + 1)); cur="$next"
done

# ---- checks ----
subject="$(openssl x509 -in "$leaf" -noout -subject -nameopt RFC2253 | sed 's/^subject=//')"
until="$(openssl x509 -in "$leaf" -noout -enddate | sed 's/^notAfter=//')"
names="$(openssl x509 -in "$leaf" -noout -ext subjectAltName 2>/dev/null | tail -n +2 | tr -d ' ' || true)"
openssl x509 -in "$leaf" -noout -checkend 0 >/dev/null || die "the certificate expired on $until"
say "certificate: $subject"
say "names:       ${names:-(none listed)}"
say "valid until: $until"
say "chain:       server certificate + $inter intermediate(s)$([ "$root" = 1 ] && echo ', root left out')"
openssl x509 -in "$leaf" -noout -checkend $((30 * 86400)) >/dev/null || echo "  WARNING: it expires within 30 days"
if [ -n "$host" ]; then
  # An IP address is checked against the certificate's IP entries, a name against its DNS names.
  if [[ "$host" =~ ^[0-9.]+$ || "$host" == *:* ]]; then how=-checkip; else how=-checkhost; fi
  openssl x509 -in "$leaf" -noout "$how" "$host" | grep -q "does match" \
    || die "the certificate does not cover $host (it covers: ${names:-$subject})"
  say "covers $host"
fi
# The key and certificate must open together, as the app will open them.
openssl x509 -in "$work/chain.pem" -noout >/dev/null
openssl pkey -in "$work/key.pem" -noout

# ---- put them in place: back up the old pair, then replace in one step ----
run() { if [ "$(id -u)" = 0 ] || [ -w "$dir" ]; then "$@"; else sudo -n "$@" || die "cannot write to $dir (run with sudo)"; fi; }
stamp="$(date +%Y%m%d-%H%M%S)"
if [ -f "$dir/tls.crt" ] || [ -f "$dir/tls.key" ]; then
  run mkdir -p "$dir/backup-$stamp"
  for f in tls.crt tls.key; do [ -f "$dir/$f" ] && run cp -p "$dir/$f" "$dir/backup-$stamp/$f"; done
  run chmod 700 "$dir/backup-$stamp"
  say "old certificate kept in $dir/backup-$stamp/"
fi
run cp "$work/key.pem" "$dir/.tls.key.new"
run cp "$work/chain.pem" "$dir/.tls.crt.new"
run chmod 600 "$dir/.tls.key.new"
run chmod 644 "$dir/.tls.crt.new"
if [ "$(id -u)" = 0 ] || [ "$(id -u)" = "$APP_UID" ]; then
  run chown "$APP_UID:$APP_UID" "$dir/.tls.key.new" "$dir/.tls.crt.new" 2>/dev/null || true
else
  sudo -n chown "$APP_UID:$APP_UID" "$dir/.tls.key.new" "$dir/.tls.crt.new" 2>/dev/null \
    || echo "  note: could not give the files to uid $APP_UID; the app's start-up (tls-init) does it on the next restart"
fi
run mv -f "$dir/.tls.key.new" "$dir/tls.key"
run mv -f "$dir/.tls.crt.new" "$dir/tls.crt"
echo "Done: $dir/tls.crt and $dir/tls.key are in place."
echo "The app switches to it within a minute, no restart needed (the app's log says \"tls: new certificate in use\")."
echo "$src is not needed by the app and still holds the key (with its password): keep it somewhere safe, or delete it from the server."
