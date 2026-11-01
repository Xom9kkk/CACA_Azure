# Event Booking App — "Station 7"

A 3-tier event booking application: a Flask web app with an HTML/JS frontend
and a PostgreSQL database. It runs in a container on **Azure Container Apps**,
uses **Azure Database for PostgreSQL Flexible Server**, and images are built
and pushed to **Azure Container Registry** by **GitHub Actions**.

Live demo: https://eventbooking-app.politeforest-0f266ae4.switzerlandnorth.azurecontainerapps.io

## Features

- Event board with search, category filter (Music, Tech, Sport, Art, Food, Party)
  and date filter (any date / this week / this month)
- Countdown to the next event
- Event details in a modal window (link `/#event-<id>` opens it directly)
- Create, edit and delete events (full CRUD)
- Seat booking (1–5 tickets) with a booking code; overbooking is not possible
- Azure status block: database connection, region and image version
- Demo events are added automatically when the database is empty

## Architecture

```
GitHub repo ──► GitHub Actions ──► Azure Container Registry ──► Azure Container Apps ──► Azure PostgreSQL
 (push main)    (build & push)      eventbookingacr89973          eventbooking-app        eventbooking-pgdb
```

- The image is built for `linux/amd64` (GitHub runners are amd64) and tagged with the commit SHA.
- Publishing a new image to Container Apps is done manually in the portal.
- Database credentials are never stored in the image or in git; they are
  passed as environment variables (Container Apps secrets in Azure, `.env` locally).

## Project structure

```
app.py               Flask app factory, / and /health routes
api.py               JSON API: events CRUD, bookings, /api/info
models.py            SQLAlchemy models: Event, Booking
seed.py              demo data for an empty database
templates/index.html page layout
static/css/style.css styles
static/js/app.js     frontend logic (filters, modals, booking, countdown)
Dockerfile           container image
.github/workflows/deploy.yml   build & push pipeline
```

## API

| Method | Path | Description |
|---|---|---|
| GET | `/health` | `{"status": "ok", "db": "connected"}` or 503 |
| GET | `/api/events` | upcoming events with free seats |
| GET | `/api/events/<id>` | one event |
| POST | `/api/events` | create an event |
| PUT | `/api/events/<id>` | update an event |
| DELETE | `/api/events/<id>` | delete an event and its bookings |
| POST | `/api/events/<id>/bookings` | book seats: `{"name", "email", "tickets"}` |
| GET | `/api/info` | region and image version |

Tables `events` and `bookings` are created automatically on startup.

## Configuration

Copy `.env.example` to `.env` and fill in your values (`.env` is ignored by git and Docker).

```
DATABASE_URL=postgresql+psycopg2://<admin_login>:<admin_password>@<server-name>.postgres.database.azure.com:5432/eventsdb?sslmode=require
```

## Run locally

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      # then edit DATABASE_URL
python app.py
```

Open http://localhost:5000. When using Azure PostgreSQL, your IP must be
allowed in the server's Networking (firewall) settings.

## Run in Docker

```powershell
docker build --platform linux/amd64 --build-arg APP_VERSION=v1 -t eventbooking-app:v1 .
docker run --rm -p 5001:5000 --env-file .env eventbooking-app:v1
```

Open http://localhost:5001.

## Azure deployment

### Resources

| Resource | Name |
|---|---|
| Resource group | `EventBookingApp-caca-lab` (Switzerland North) |
| PostgreSQL Flexible Server | `eventbooking-pgdb`, database `eventsdb`, Burstable B1ms |
| Container Registry | `eventbookingacr89973.azurecr.io` (Basic, admin user enabled) |
| Container Apps | `eventbooking-app` in environment `eventbooking-env`, ingress on port 5000 |

PostgreSQL networking: public access with "Allow public access from any Azure
service" plus the client IP for local work. SSL is required (`sslmode=require`).

### Container App settings

Secrets (Security → Secrets):

| Secret | Value |
|---|---|
| `database-url` | full `DATABASE_URL` connection string |
| `db-password` | database password |

Environment variables (Containers → Edit and deploy → Environment variables):

| Variable | Source | Value |
|---|---|---|
| `DATABASE_URL` | Reference a secret | `database-url` |
| `POSTGRES_PASSWORD` | Reference a secret | `db-password` |
| `POSTGRES_USER` | Manual entry | admin login |
| `POSTGRES_DB` | Manual entry | `eventsdb` |
| `POSTGRES_PORT` | Manual entry | `5432` |

### Manual push to ACR

```powershell
docker login eventbookingacr89973.azurecr.io
docker build --platform linux/amd64 --build-arg APP_VERSION=v4 -t eventbooking-app:v4 .
docker tag eventbooking-app:v4 eventbookingacr89973.azurecr.io/eventbooking-app:v4
docker push eventbookingacr89973.azurecr.io/eventbooking-app:v4
```

## CI: GitHub Actions

Workflow `.github/workflows/deploy.yml` runs on every push to `main`:

1. checks out the code,
2. logs in to ACR,
3. builds the image on an `ubuntu-latest` (amd64) runner,
4. pushes `eventbookingacr89973.azurecr.io/eventbooking-app:<commit-sha>`.

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `REGISTRY_USERNAME` | ACR admin username |
| `REGISTRY_PASSWORD` | ACR admin password |

### Publishing a new version

After the workflow finishes, open the Container App → **Revisions and replicas →
Create new revision** → select the container → **Edit** → set **Image tag** to the
new commit SHA → **Save** → **Create**.

Images built by the workflow show version `dev` in the app's Azure block;
images built manually with `--build-arg APP_VERSION=...` show that value.

> The Container Apps environment runs in Express mode, so the revision name
> suffix must be left empty.
