# Social Platform - Posts Database (PostgreSQL)
FROM postgres:16-alpine

# Environment variables for database initialization
ENV POSTGRES_DB=posts_db
ENV POSTGRES_USER=posts_admin
ENV POSTGRES_PASSWORD=posts_secret

# Copy initialization scripts
COPY init.sql /docker-entrypoint-initdb.d/

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 \
    CMD pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}

EXPOSE 5433

# Data persistence
VOLUME ["/var/lib/postgresql/data"]

