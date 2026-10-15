# Wdrożenie POC na GCP (Cloud Run + Cloud SQL PostGIS)

> Plan na później. Aktualnie aplikację uruchamiamy przez `docker compose` (patrz README).

Architektura: **Cloud Run** (kontener Next.js, `output: standalone`) → **Cloud SQL for PostgreSQL 16** (rozszerzenie PostGIS) przez gniazdo unixowe `/cloudsql/...`.

## 0. Zmienne

```bash
export PROJECT_ID=twoj-projekt
export REGION=europe-central2          # Warszawa
export SQL_INSTANCE=got-pttk-db
export DB_NAME=got_pttk
export DB_USER=got
export DB_PASS="$(openssl rand -base64 18 | tr -d '/+=')"
echo "$DB_PASS"                        # zapisz!
```

## 1. Projekt i API

```bash
gcloud auth login
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

## 2. Cloud SQL (Postgres 16 + PostGIS)

```bash
gcloud sql instances create $SQL_INSTANCE \
  --database-version=POSTGRES_16 --edition=ENTERPRISE \
  --tier=db-f1-micro --region=$REGION
gcloud sql databases create $DB_NAME --instance=$SQL_INSTANCE
gcloud sql users create $DB_USER --instance=$SQL_INSTANCE --password="$DB_PASS"
```

## 3. Migracja i seed (z lokalnej maszyny przez Cloud SQL Auth Proxy)

Pobierz proxy: https://cloud.google.com/sql/docs/postgres/connect-auth-proxy

```bash
gcloud auth application-default login
./cloud-sql-proxy $PROJECT_ID:$REGION:$SQL_INSTANCE --port 5433 &

export DATABASE_URL="postgres://$DB_USER:$DB_PASS@127.0.0.1:5433/$DB_NAME"
npm ci
npm run db:migrate    # CREATE EXTENSION postgis + tabele
npm run db:seed       # przykładowe odcinki T.01
```

> Jeśli `CREATE EXTENSION postgis` zgłosi brak uprawnień, uruchom migrację jako użytkownik `postgres` (`gcloud sql users set-password postgres ...`).

## 4. Sekret z DATABASE_URL

W produkcji Cloud Run łączy się gniazdem unixowym (host w parametrze `?host=`):

```bash
printf "postgres://$DB_USER:$DB_PASS@/$DB_NAME?host=/cloudsql/$PROJECT_ID:$REGION:$SQL_INSTANCE" \
  | gcloud secrets create database-url --data-file=-

PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
SA=$PROJECT_NUMBER-compute@developer.gserviceaccount.com
gcloud secrets add-iam-policy-binding database-url \
  --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$SA" --role=roles/cloudsql.client
```

Hasło ze znakami specjalnymi musi być zakodowane w URL (`openssl` z komendy wyżej generuje bezpieczne znaki).

## 5. Deploy

```bash
gcloud run deploy got-pttk-tracker \
  --source . \
  --region $REGION \
  --add-cloudsql-instances $PROJECT_ID:$REGION:$SQL_INSTANCE \
  --set-secrets DATABASE_URL=database-url:latest \
  --no-allow-unauthenticated
```

`--source .` zbuduje obraz z [Dockerfile](../Dockerfile) w Cloud Build i opublikuje go w Artifact Registry.

### Dostęp (aplikacja nie ma logowania!)

API `/api/progress` jest bez autoryzacji, więc POC zostawiamy **prywatny** i otwieramy tunel z uwierzytelnieniem Twoim kontem Google:

```bash
gcloud run services proxy got-pttk-tracker --region $REGION --port 8080
# -> http://localhost:8080
```

Publiczny dostęp (tylko jeśli akceptujesz, że każdy może zapisywać postęp):
`gcloud run services add-iam-policy-binding got-pttk-tracker --region $REGION --member=allUsers --role=roles/run.invoker`

## 6. Aktualizacja i sprzątanie

```bash
gcloud run deploy got-pttk-tracker --source . --region $REGION   # nowa wersja

# usunięcie wszystkiego (instancja Cloud SQL generuje koszty także bez ruchu):
gcloud run services delete got-pttk-tracker --region $REGION
gcloud sql instances delete $SQL_INSTANCE
gcloud secrets delete database-url
```

## Uwagi
- Overpass API (Moduł 2) jest wołane z serwera Cloud Run — publiczne instancje mają limity; do większego importu użyj własnego mirrora lub uruchom import lokalnie.
- Kafelki OSM w mapie służą do POC; w produkcji użyj własnego dostawcy kafelków (polityka użycia OSM).
- Cold start Cloud Run jest dopuszczalny w POC; `--min-instances 1` go usuwa za dodatkowy koszt.
