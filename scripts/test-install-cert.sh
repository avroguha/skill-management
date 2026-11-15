#!/usr/bin/env bash
# test-install-cert.sh - checks install-cert.sh against made-up certificates:
# a root -> intermediate -> server chain, packed as a PEM bundle (PKCS#8 key
# with a password, certificates in a jumbled order, Windows line endings),
# as a PFX, and with a key that has no password. Nothing outside a temporary
# folder is touched.   bash scripts/test-install-cert.sh   (Linux, or Git Bash)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
# the files are given to the user running the test, not the app's uid 10001, so it can read them back
export SKM_APP_UID="$(id -u)"
# Git Bash would rewrite a "/CN=..." subject into a Windows path; no effect on Linux
export MSYS2_ARG_CONV_EXCL="/CN="
t="$(mktemp -d)"; trap 'rm -rf "$t"' EXIT
cd "$t"
pass=0 fail=0
check() { if eval "$2"; then echo "PASS $1"; pass=$((pass + 1)); else echo "FAIL $1"; fail=$((fail + 1)); fi; }
q() { openssl "$@" >/dev/null 2>&1; }

# A chain like a company CA's.
q req -x509 -newkey rsa:2048 -nodes -keyout root.key -out root.crt -days 30 -subj "/CN=Test Root CA"
q req -newkey rsa:2048 -nodes -keyout int.key -out int.csr -subj "/CN=Test Issuing CA"
printf 'basicConstraints=critical,CA:TRUE\nkeyUsage=critical,keyCertSign,cRLSign\n' > ca.ext
q x509 -req -in int.csr -CA root.crt -CAkey root.key -CAcreateserial -out int.crt -days 30 -extfile ca.ext
q req -newkey rsa:2048 -nodes -keyout srv.key -out srv.csr -subj "/CN=skills.avro.com"
printf 'subjectAltName=DNS:skills.avro.com,DNS:skills,IP:10.1.2.3\nextendedKeyUsage=serverAuth\n' > srv.ext
q x509 -req -in srv.csr -CA int.crt -CAkey int.key -CAcreateserial -out srv.crt -days 30 -extfile srv.ext

# 1. PEM bundle: encrypted PKCS#8 key, root first, CRLF line endings.
SKM_CERT_PASSWORD='S3cret pass!' openssl pkcs8 -topk8 -in srv.key -v2 aes-256-cbc -passout env:SKM_CERT_PASSWORD -out srv.enc.key
cat root.crt srv.enc.key int.crt srv.crt | sed 's/$/\r/' > bundle.pem
mkdir out1
SKM_CERT_PASSWORD='S3cret pass!' bash "$here/install-cert.sh" bundle.pem --dir "$t/out1" --host skills.avro.com > log1 2>&1 || true
check "PEM bundle with a password installs" '[ -f out1/tls.crt ] && [ -f out1/tls.key ]'
check "the key is written without a password" 'grep -q "BEGIN PRIVATE KEY" out1/tls.key && ! grep -q ENCRYPTED out1/tls.key'
check "the key is readable by its owner only (600)" '[ "$(stat -c %a out1/tls.key)" = 600 ]'
check "the certificate file is 644" '[ "$(stat -c %a out1/tls.crt)" = 644 ]'
check "the server certificate comes first" 'openssl x509 -in out1/tls.crt -noout -subject | grep -q skills.avro.com'
check "then the intermediate, and the root is left out" '[ "$(grep -c "BEGIN CERTIFICATE" out1/tls.crt)" = 2 ] && openssl crl2pkcs7 -nocrl -certfile out1/tls.crt | openssl pkcs7 -print_certs -noout | grep -q "Test Issuing CA" && ! openssl crl2pkcs7 -nocrl -certfile out1/tls.crt | openssl pkcs7 -print_certs -noout | grep -q "subject=CN *= *Test Root CA"'
check "the chain verifies against the root" 'openssl verify -CAfile root.crt -untrusted out1/tls.crt out1/tls.crt >/dev/null 2>&1'
check "the key matches the certificate" 'cmp -s <(openssl pkey -in out1/tls.key -pubout) <(openssl x509 -in out1/tls.crt -pubkey -noout)'
check "no Windows line endings left" '! grep -q $'"'"'\r'"'"' out1/tls.crt out1/tls.key'
check "the password never reached a command line" '! grep -q "S3cret" log1'

# 2. A wrong password stops it, and nothing changes.
cp out1/tls.crt before.crt
SKM_CERT_PASSWORD='wrong' bash "$here/install-cert.sh" bundle.pem --dir "$t/out1" > log2 2>&1 && st=0 || st=$?
check "a wrong password is refused" '[ "$st" != 0 ] && grep -q "wrong password" log2'
check "...and the installed certificate is untouched" 'cmp -s before.crt out1/tls.crt'

# 3. A name the certificate does not cover is refused.
SKM_CERT_PASSWORD='S3cret pass!' bash "$here/install-cert.sh" bundle.pem --dir "$t/out3" --host other.avro.com > log3 2>&1 && st=0 || st=$?
check "a host the certificate does not cover is refused" '[ "$st" != 0 ] && grep -q "does not cover other.avro.com" log3'

SKM_CERT_PASSWORD='S3cret pass!' bash "$here/install-cert.sh" bundle.pem --dir "$t/out3b" --host 10.1.2.3 > log3b 2>&1 && st=0 || st=$?
check "an IP address the certificate covers is accepted" '[ "$st" = 0 ] && grep -q "covers 10.1.2.3" log3b'
SKM_CERT_PASSWORD='S3cret pass!' bash "$here/install-cert.sh" bundle.pem --dir "$t/out3c" --host 10.9.9.9 > log3c 2>&1 && st=0 || st=$?
check "an IP address it does not cover is refused" '[ "$st" != 0 ] && grep -q "does not cover 10.9.9.9" log3c && [ ! -f out3c/tls.crt ]'

# 4. PFX / PKCS#12.
openssl pkcs12 -export -inkey srv.key -in srv.crt -certfile <(cat int.crt root.crt) -passout pass:'Pfx pass' -out bundle.pfx 2>/dev/null
SKM_CERT_PASSWORD='Pfx pass' bash "$here/install-cert.sh" bundle.pfx --dir "$t/out4" > log4 2>&1 || true
check "a PFX installs too" '[ -f out4/tls.key ] && cmp -s <(openssl pkey -in out4/tls.key -pubout) <(openssl x509 -in out4/tls.crt -pubkey -noout)'

# 5. A key with no password needs no password, and replacing keeps a backup.
cat srv.crt srv.key int.crt > plain.pem
bash "$here/install-cert.sh" plain.pem --dir "$t/out1" < /dev/null > log5 2>&1 || true
check "a key without a password installs without asking" 'grep -q "no password" log5 && grep -q "Done" log5'
check "the previous pair is kept in a backup folder" 'ls -d out1/backup-* >/dev/null 2>&1 && [ -f "$(ls -d out1/backup-* | head -1)/tls.key" ]'

# 6. A bundle whose key belongs to no certificate in it is refused.
q req -newkey rsa:2048 -nodes -keyout other.key -out /dev/null -subj "/CN=x"
cat srv.crt other.key > mismatch.pem
bash "$here/install-cert.sh" mismatch.pem --dir "$t/out6" < /dev/null > log6 2>&1 && st=0 || st=$?
check "a key that matches no certificate is refused" '[ "$st" != 0 ] && grep -q "belongs to its private key" log6'

# 7. Without --dir, the folder is TLS_DIR from the env file (as docker compose reads it).
printf '# a site env file saved on Windows\r\nTLS_DIR=%s\r\n' "$t/out7" > site.env
bash "$here/install-cert.sh" plain.pem --env-file "$t/site.env" < /dev/null > log7 2>&1 || true
check "the folder comes from TLS_DIR in the env file" '[ -f out7/tls.crt ] && [ -f out7/tls.key ]'
printf 'APP_URL=x\n' > nodir.env
bash "$here/install-cert.sh" plain.pem --env-file "$t/nodir.env" < /dev/null > log7b 2>&1 && st=0 || st=$?
check "an env file without TLS_DIR is refused" '[ "$st" != 0 ] && grep -q "no TLS_DIR" log7b'

# 8. An encrypted key with no terminal and no SKM_CERT_PASSWORD stops instead of hanging.
bash "$here/install-cert.sh" bundle.pem --dir "$t/out8" < /dev/null > log8 2>&1 && st=0 || st=$?
check "no password and no terminal is refused" '[ "$st" != 0 ] && grep -q "run this in a terminal" log8'

echo; echo "$pass passed, $fail failed"; [ "$fail" = 0 ]
