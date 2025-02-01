# Build Frontend
FROM node:18 AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm install
COPY frontend ./
RUN npm run build

# Build Backend
FROM python:3.12
WORKDIR /app
COPY --from=frontend /app/frontend/build frontend/build
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend .

CMD ["gunicorn", "-w", "2", "-t", "120", "-b", "0.0.0.0:5000", "app:app"]
