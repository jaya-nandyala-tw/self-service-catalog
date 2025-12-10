# Social Platform - Users Database (PostgreSQL)
FROM postgres:16-alpine

# Environment variables for database initialization
ENV POSTGRES_DB=users_db
ENV POSTGRES_USER=users_admin
ENV POSTGRES_PASSWORD=users_secret

# Copy initialization scripts
COPY init.sql /docker-entrypoint-initdb.d/

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}

EXPOSE 5432

# Data persistence
VOLUME ["/var/lib/postgresql/data"]

