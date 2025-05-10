# Build Frontend
FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend ./
RUN npm run build

# Build Backend
FROM python:3.13-slim
WORKDIR /app

# Copy built frontend to backend
COPY --from=frontend /app/frontend/build frontend/build
COPY backend/requirements.txt .

# Install required system dependencies
RUN apt-get update && \
    apt-get install -y curl && \
    curl -L -o openshift-client-linux.tar.gz https://mirror.openshift.com/pub/openshift-v4/clients/ocp/latest/openshift-client-linux.tar.gz && \
    tar xzvf openshift-client-linux.tar.gz && \
    mv oc /usr/bin/ && \
    rm -f README.md kubectl openshift-client-linux.tar.gz 2>/dev/null || true && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application
COPY backend .

# Copy entrypoint script and make it executable
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create needed directories and set OpenShift-compatible permissions
RUN mkdir -p /tmp/gunicorn && \
    # Change permissions to allow running as arbitrary user
    chmod -R g+rwX /app && \
    chmod -R 777 /tmp/gunicorn && \
    chmod g+rwX /entrypoint.sh && \
    # Create .python-eggs directory for Python package cache with appropriate permissions
    mkdir -p /.python-eggs && \
    chmod -R 777 /.python-eggs

# Set environment variable for Python eggs
ENV PYTHON_EGG_CACHE=/.python-eggs

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Run the application
CMD ["gunicorn", "--worker-tmp-dir", "/tmp/gunicorn", "-w", "2", "-t", "120", "-b", "0.0.0.0:5000", "app:app"]
