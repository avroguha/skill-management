#!/bin/bash
# PostgreSQL entrypoint wrapper.
#
# On the first start it creates two secrets in /secrets (DATA_DIR/secrets on the
# host): the database password and the app's session-signing secret. They are
# owned by the app's uid (APP_UID) and readable by nobody else; PostgreSQL gets
# its own copy. Existing files are never touched, so a restart keeps both.
#
# Then it hands over to the official postgres entrypoint unchanged.
set -euo pipefail

mkdir -p /secrets
make_secret() {
    # 32 random bytes as hex: fixed-length reads, no pipe that can SIGPIPE under pipefail
    if [ ! -s "$1" ]; then
        (umask 077; head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$1")
        echo "db-entrypoint: created $1"
    fi
}
make_secret /secrets/db_password
make_secret /secrets/auth_secret
chown "${APP_UID:-10001}:${APP_UID:-10001}" /secrets/db_password /secrets/auth_secret
chmod 0400 /secrets/db_password /secrets/auth_secret

# The backups folder (BACKUP_DIR on the host): writable by the app user only.
if [ -d /backups ]; then
    chown "${APP_UID:-10001}:${APP_UID:-10001}" /backups
    chmod 0700 /backups
fi

# PostgreSQL reads the password as user postgres, which cannot read the app's copy.
install -m 0400 -o postgres -g postgres /secrets/db_password /tmp/pg_password
export POSTGRES_PASSWORD_FILE=/tmp/pg_password

exec docker-entrypoint.sh "$@"
