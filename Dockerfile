FROM ubuntu:22.04

# Prevent interactive prompts during package install
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies (no maven from apt — version is too old)
RUN apt-get update && apt-get install -y \
    openjdk-21-jdk \
    curl \
    git \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Java 21 (required — AEM archetype Groovy scripts are incompatible with Java 25+)
# Use a symlink so JAVA_HOME works on both amd64 and arm64 architectures.
RUN ln -sf "$(dirname "$(dirname "$(readlink -f "$(which java)")")")" /usr/local/java-home
ENV JAVA_HOME=/usr/local/java-home
ENV PATH="$JAVA_HOME/bin:$PATH"

# Maven 3.9.x — Ubuntu 22.04 apt ships 3.6.3 which is too old for AEM plugins (require 3.8.1+)
ENV MAVEN_VERSION=3.9.9
ENV MAVEN_HOME=/opt/maven
RUN curl -fsSL "https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz" \
    | tar -xz -C /opt \
    && ln -sf "/opt/apache-maven-${MAVEN_VERSION}" "${MAVEN_HOME}"
ENV PATH="$MAVEN_HOME/bin:$PATH"

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── AEM files ──────────────────────────────────────────────────────────────
# Place your AEM quickstart JAR and license.properties in the aem/ directory
# before running docker build.
COPY aem/aem-quickstart.jar /aem/aem-quickstart.jar
COPY aem/license.properties /aem/license.properties

# ── App source ─────────────────────────────────────────────────────────────
WORKDIR /app
COPY . .

# Remove developer .env — runtime config lives in /workspace/.env (volume)
RUN rm -f /app/.env

# Install all Node.js dependencies (root + backend + frontend)
RUN npm run install:all

# Build TypeScript backend
RUN cd backend && npx tsc

# Build Next.js frontend
RUN cd frontend && npm run build

# Pre-warm Maven local repository so first build inside the container is faster
RUN mvn -B \
    org.apache.maven.plugins:maven-archetype-plugin:3.3.1:help \
    -q 2>/dev/null || true

# Download AEM Core Components package at build time so startup doesn't need internet.
# core.wcm.components.all is the "batteries-included" zip that installs via Package Manager.
ENV CORE_COMPONENTS_VERSION=2.25.4
RUN mvn -B dependency:copy \
    -Dartifact="com.adobe.cq:core.wcm.components.all:${CORE_COMPONENTS_VERSION}:zip" \
    -DoutputDirectory=/aem/packages \
    -q

# ── Runtime directories ────────────────────────────────────────────────────
RUN mkdir -p /workspace/aem-projects /aem

COPY docker/startup.sh /startup.sh
RUN chmod +x /startup.sh

# Frontend UI  |  Backend API  |  AEM Author
EXPOSE 3000 3001 4502

# Persistent volumes:
#   /aem/crx-quickstart  — AEM repository (survives restarts)
#   /workspace           — generated AEM projects + .env state + SQLite DB
VOLUME ["/aem/crx-quickstart", "/workspace"]

CMD ["/startup.sh"]
