# Build Frontend
FROM node:18-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend ./
RUN npm run build

# Build Backend
FROM python:3.12-slim
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
    rm -f openshift-client-linux.tar.gz && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application
COPY backend .

# Run the application
CMD ["gunicorn", "-w", "2", "-t", "120", "-b", "0.0.0.0:5000", "app:app"]
