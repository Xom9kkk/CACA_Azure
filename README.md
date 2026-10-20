# Event Booking App

Lab 1 — local 3-tier application in Docker Desktop: Flask app + PostgreSQL,
each in its own container.

- `GET /` — start page with a "Check database connection" button
- `GET /health` — `{"status": "ok", "db": "connected"}`

## Configuration

Database settings come from environment variables — nothing is hardcoded.
Copy `.env.example` to `.env` (the `.env` file is in `.gitignore` and `.dockerignore`).

## Run in Docker

Both containers are attached to one Docker network, so the app reaches the
database by its container name (`postgres-events`) instead of `localhost`
(inside a container `localhost` means the container itself).

```powershell
# 1. Network shared by both containers
docker network create events-net

# 2. Database container
docker run -d --name postgres-events --network events-net -p 5433:5432 `
  -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=mysecretpassword -e POSTGRES_DB=eventsdb `
  postgres:16

# 3. Build the app image
docker build -t events-app:v1 .

# 4. App container, connected to the database through the network
docker run -d --name events-app --network events-net -p 5000:5000 `
  -e DATABASE_URL=postgresql+psycopg2://postgres:mysecretpassword@postgres-events:5432/eventsdb `
  events-app:v1
```

Open http://localhost:5000 and click "Check database connection".

> The database is published on host port **5433** (not 5432) to avoid conflicts
> with another PostgreSQL already running on the machine. The app container
> doesn't use this port — it talks to the database inside the network on 5432.

## Run the app locally (without Docker for the app)

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
python app.py
```

The database container from step 2 must be running.

## Useful commands

```powershell
docker logs events-app                                        # app logs
docker exec -it postgres-events psql -U postgres -d eventsdb  # SQL console
docker rm -f events-app postgres-events                       # remove containers
docker network rm events-net                                  # remove network
```
