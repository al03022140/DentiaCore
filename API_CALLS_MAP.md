# Complete Frontend API Calls Map

> Auto-generated from full codebase analysis of `Client/src/`

## Base URL Configuration

**File:** `Client/src/shared/services/axios-instance.js`
- `API_URL` = `VITE_API_URL` || `process.env.API_URL` || `http://localhost:5002`
- `baseURL` = `${API_URL}/api`
- All `API.*` calls use this base (so `/patients` → `http://localhost:5002/api/patients`)
- Two axios instances: `API` (main, with auth interceptors) and `authClient` (for refresh, no retry loops)

---

## 1. AUTHENTICATION (`AuthContext.jsx` + `axios-instance.js`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 1 | **POST** | `/auth/login` | `app/auth/AuthContext.jsx:21` | `{ email, contraseña }` | `response.data.accessToken`, `response.data.user` | Sets access token + user state |
| 2 | **POST** | `/auth/logout` | `app/auth/AuthContext.jsx:28` | *(none)* | *(none)* | Clears token + user on finish |
| 3 | **GET** | `/auth/me` | `app/auth/AuthContext.jsx:39` | *(none)* | `response.data` → full user object | Called on bootstrap if token exists |
| 4 | **POST** | `/auth/refresh` | `shared/services/axios-instance.js:46` | *(none, uses cookies via `withCredentials`)* | `response.data.accessToken` | Auto-called on 401; uses `authClient` instance |

---

## 2. PATIENTS (`shared/services/api.js`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 5 | **GET** | `/patients` | `shared/services/api.js:27` | *(none)* | `response.data` → `{ patients }` or array | `getAllPatients()` |
| 6 | **POST** | `/patients` | `shared/services/api.js:35` | Full patient JSON (`patientData`) | `response.data` | `createPatient()` |
| 7 | **GET** | `/patients/:id` | `shared/services/api.js:43` | *(none)* | `response.data` → `{ patient, citas }` | `getPatientById()` |
| 8 | **PUT** | `/patients/:id` | `shared/services/api.js:51` | Full patient JSON (`patientData`) | `response.data` | `updatePatient()` |
| 9 | **DELETE** | `/patients/:id` | `shared/services/api.js:59` | *(none)* | `response.data` | `deletePatient()` |

---

## 3. PATIENTS (Direct `fetch()` calls in `add-patient.jsx`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 10 | **POST** | `/api/patients` | `features/add-patient/add-patient.jsx:885` | `FormData` with `patientData` (JSON string) + `foto` (File) | `data._id`, `data.patient?._id` | Uses native `fetch()`, NOT axios. Creates new patient with photo upload |
| 11 | **PUT** | `/api/patients/:id` | `features/add-patient/add-patient.jsx:879` | `FormData` with `patientData` (JSON string) + `foto` (File) | `data._id`, `data.patient?._id` | Uses native `fetch()`, NOT axios. Updates existing patient with photo upload |

---

## 4. PATIENTS (Direct `API.*` calls in `patient-detail.jsx`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 12 | **GET** | `/patients/:patientId/odontograma-inicial` | `features/patient-detail/patient-detail.jsx:244` | *(none)* | `data.exists`, `data.imageUrl`, `data.datos`/`data.data`, `data.history` | `checkInitialOdontogram()` |
| 13 | **DELETE** | `/patients/:patientId/odontograma-inicial` | `features/patient-detail/patient-detail.jsx:258` | *(none)* | *(none)* | `deleteInitial()` |
| 14 | **DELETE** | `/patients/:patientId` | `features/patient-detail/patient-detail.jsx:309` | *(none)* | *(none)* | Delete patient (requires typed confirmation) |

---

## 5. PATIENTS (Direct `API.get` in `next-patient.jsx`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 15 | **GET** | `/patients` | `features/main-page/components/next-patient.jsx:12` | *(none)* | `data.patients` or `data` → array with `appointment`, `name`, `image` | Dashboard widget: fetches all patients to find next appointment |

---

## 6. EVOLUTION NOTES (`patient-evolution-note.jsx`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 16 | **POST** | `/patients/:patientId/evolution-note` | `features/patient-detail/components/patient-evolution-note.jsx:52` | `{ evolutionNote: { procedimiento, observaciones, correcciones } }` | `response.data.success`, `response.data.data` (new note), or `response.data.patient.notas_evolucion` | Uses axios `API` instance |

---

## 7. TREATMENT PLANS (`patient-treatment-plan.jsx`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 17 | **POST** | `/api/patients/:patientId/treatment-plan` | `features/patient-detail/components/patient-treatment-plan.jsx:63` | `{ treatmentPlan: { texto, fecha, fechaFormateada, confirmar } }` | `body.data` (saved plan) | Uses native `fetch()`, NOT axios. No auth header! |

---

## 8. ODONTOGRAM - INITIAL (`odontograma-service.js`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 18 | **GET** | `/patients/:patientId/odontograma-inicial` | `features/odontogram/api/odontograma-service.js:102` | *(none)* | `data.exists`, `data.imageUrl`, `data.datos`, `data.history` | `checkInitialOdontogram()` |
| 19 | **POST** | `/patients/:patientId/odontograma-inicial` | `features/odontogram/api/odontograma-service.js:118` | `FormData` (image + data) | `data` (full initial odontogram response) | `saveInitialOdontogram()` — file upload |
| 20 | **DELETE** | `/patients/:patientId/odontograma-inicial` | `features/odontogram/api/odontograma-service.js:139` | *(none)* | `data.message` | `deleteInitialOdontogram()` |
| 21 | **GET** | `/patients/:patientId/odontograma-inicial/history` | `features/odontogram/api/odontograma-service.js:149` | *(none)* | `data` → array of history entries | `getInitialOdontogramHistory()` |
| 22 | **POST** | `/patients/:patientId/odontograma-inicial/history` | `features/odontogram/api/odontograma-service.js:167` | `{ entries: [{ tooth, damage, surface, note }] }` | `data.message`, `data.total_historial` | `addInitialOdontogramHistory()` |

**Image URL (not a fetch, but a URL reference):**
- `getInitialOdontogramImageUrl()` returns `/patients/:patientId/odontograma-inicial/image` — used as `<img src>` attribute

---

## 9. ODONTOGRAM - CLINICAL (`odontograma-service.js`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 23 | **POST** | `/patients/:patientId/odontograma-clinico` | `features/odontogram/api/odontograma-service.js:196` | `{ entries: [{ tooth, damage, surface, note }] }` | `data.exists`, `data.datos`, `data.history` | `saveClinicalOdontogramState()` |
| 24 | **GET** | `/patients/:patientId/odontograma-clinico` | `features/odontogram/api/odontograma-service.js:217` | *(none)* | `data.exists`, `data.datos`, `data.history` | `getClinicalOdontogramState()` |
| 25 | **GET** | `/patients/:patientId/odontograma-clinico/history` | `features/odontogram/api/odontograma-service.js:234` | *(none)* | `data.history` → array | `getClinicalOdontogramHistory()` |
| 26 | **DELETE** | `/patients/:patientId/odontograma-clinico/history/:entryId` | `features/odontogram/api/odontograma-service.js:249` | *(none)* | `data.message` | `deleteClinicalOdontogramEntry()` |
| 27 | **DELETE** | `/patients/:patientId/odontograma-clinico` | `features/odontogram/api/odontograma-service.js:261` | *(none)* | `data.message` | `deleteClinicalOdontogramState()` |

---

## 10. PERIODONTOGRAM (`shared/services/periodontogram-service.js`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 28 | **GET** | `/patients/:patientId/periodontogram` | `shared/services/periodontogram-service.js:119` | *(none)* | `response.data` → full periodontogram | `getPeriodontogram()` |
| 29 | **POST** | `/patients/:patientId/periodontogram` | `shared/services/periodontogram-service.js:133` | `{ initialData }` | `response.data` → created periodontogram | `createPeriodontogram()` — handles 409 (already exists) |
| 30 | **GET** | `/patients/:patientId/periodontogram/statistics` | `shared/services/periodontogram-service.js:172` | *(none)* | `response.data` | `getStatistics()` |
| 31 | **GET** | `/patients/:patientId/periodontogram/statistics/:version` | `shared/services/periodontogram-service.js:172` | *(none)* | `response.data` | `getStatistics(patientId, version)` — version-specific |
| 32 | **PUT** | `/patients/:patientId/periodontogram/data` | `shared/services/periodontogram-service.js:188` | `{ teeth, statistics, versionName }` | `response.data` incl. `versionName` | `saveData()` — the primary save endpoint |
| 33 | **GET** | `/patients/:patientId/periodontogram/data` | `shared/services/periodontogram-service.js:209` | Query params: `?version=<name>` (optional) | `response.data.data` or `response.data` → `{ teeth, statistics, versionName }` | `getData()` |
| 34 | **GET** | `/patients/:patientId/periodontogram/data?listVersions=true` | `shared/services/periodontogram-service.js:230` | *(none)* | `response.data.versions` → array of version objects/strings | `getDataVersions()` |
| 35 | **DELETE** | `/patients/:patientId/periodontogram` | `shared/services/periodontogram-service.js:360` | *(none)* | *(none)* | `deletePeriodontogram()` |

---

## 11. CASH / BOX (`shared/services/cashService.js`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 36 | **GET** | `/cash/balance/monthly` | `shared/services/cashService.js:4` | *(none)* | `response.data` → `{ cash, digital, total }` | `getMonthlyBalance()` |
| 37 | **GET** | `/cash/session/status` | `shared/services/cashService.js:13` | *(none)* | `response.data` → `{ isOpen }` | `getSessionStatus()` |
| 38 | **POST** | `/cash/session/open` | `shared/services/cashService.js:18` | `{ initialAmount }` | `response.data` | `openBox()` |
| 39 | **POST** | `/cash/session/close` | `shared/services/cashService.js:23` | *(none)* | `response.data` | `closeBox()` |
| 40 | **POST** | `/cash/movements` | `shared/services/cashService.js:28` | `{ amount, paymentMethod, concept, type }` | `response.data` | `addMovement()` |
| 41 | **GET** | `/cash/movements` | `shared/services/cashService.js:33` | *(none)* | `response.data` → array of movements | `getLastMovements()` |

---

## 12. USERS (`features/users/UsersPage.jsx`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 42 | **GET** | `/users` | `features/users/UsersPage.jsx:28` | *(none)* | `response.data` → array of users (`_id`, `nombre`, `email`, `rol`, `active`) | Direct `API.get` |
| 43 | **POST** | `/users` | `features/users/UsersPage.jsx:42` | `{ nombre, email, contraseña, rol }` | *(none, reloads list)* | Direct `API.post` |
| 44 | **PATCH** | `/users/:id/disable` | `features/users/UsersPage.jsx:49` | *(none)* | *(none, reloads list)* | Direct `API.patch` |

---

## 13. STATISTICS (`features/statistics/data/statsService.js`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 45 | **GET** | `/stats/summary` | `features/statistics/data/statsService.js:68` | Query: `?group=day|week|month|year` | `data.revenue.labels`, `data.revenue.data` | `fetchTotalRevenue()` |
| 46 | **GET** | `/stats/cashbox-performance` | `features/statistics/data/statsService.js:78` | Query: `?group=day|week|month|year` | `data.labels`, `data.datasets` | `fetchCashboxPerformance()` |
| 47 | **GET** | `/stats/patients-trend` | `features/statistics/data/statsService.js:88` | Query: `?group=day|week|month|year` | `data.labels`, `data.datasets` | `fetchPatientTypeTrend()` |
| 48 | **GET** | `/stats/no-shows` | `features/statistics/data/statsService.js:98` | Query: `?group=day|week|month|year` | `data.labels`, `data.datasets` | `fetchNoShows()` |
| 49 | **GET** | `/stats/productivity` | `features/statistics/data/statsService.js:108` | Query: `?group=day|week|month|year` | `data.labels`, `data.datasets` | `fetchProductivity()` |

---

## 14. GOOGLE CALENDAR INTEGRATION (`features/main-page/components/calendar.jsx`)

| # | Method | Endpoint | File | Request Body | Response Fields Used | Notes |
|---|--------|----------|------|-------------|---------------------|-------|
| 50 | **POST** | `/api/google/refresh-token` | `features/main-page/components/calendar.jsx:93` | `{ refreshToken }` | `data.accessToken`, `data.expiresIn`, `data.refreshToken` | Uses native `fetch()` with `VITE_API_URL` prefix |
| 51 | **GET** | `/api/google/auth/url` | `features/main-page/components/calendar.jsx:118` | *(none)* | `data.url` → Google OAuth redirect URL | Uses native `fetch()` with `VITE_API_URL` prefix |
| 52 | **GET** | `https://www.googleapis.com/calendar/v3/calendars/primary/events` | `features/main-page/components/calendar.jsx:176` | Query: `?singleEvents=true&orderBy=startTime&timeMin=...&timeMax=...` | `data.items` → array of Google Calendar events | Direct Google API call (external, not backend) |

---

## SUMMARY BY UNIQUE ENDPOINT

### Auth (4 endpoints)
- `POST /auth/login`
- `POST /auth/logout`
- `GET  /auth/me`
- `POST /auth/refresh`

### Patients (5 endpoints)
- `GET    /patients`
- `POST   /patients` (both axios and native fetch with FormData)
- `GET    /patients/:id`
- `PUT    /patients/:id` (both axios and native fetch with FormData)
- `DELETE /patients/:id`

### Evolution Notes (1 endpoint)
- `POST /patients/:id/evolution-note`

### Treatment Plans (1 endpoint)
- `POST /patients/:id/treatment-plan` ⚠️ *uses native fetch, no auth header*

### Odontogram Initial (5 endpoints + 1 image URL)
- `GET    /patients/:id/odontograma-inicial`
- `POST   /patients/:id/odontograma-inicial`
- `DELETE /patients/:id/odontograma-inicial`
- `GET    /patients/:id/odontograma-inicial/history`
- `POST   /patients/:id/odontograma-inicial/history`
- *(image)* `/patients/:id/odontograma-inicial/image`

### Odontogram Clinical (5 endpoints)
- `POST   /patients/:id/odontograma-clinico`
- `GET    /patients/:id/odontograma-clinico`
- `GET    /patients/:id/odontograma-clinico/history`
- `DELETE /patients/:id/odontograma-clinico/history/:entryId`
- `DELETE /patients/:id/odontograma-clinico`

### Periodontogram (6 endpoints)
- `GET    /patients/:id/periodontogram`
- `POST   /patients/:id/periodontogram`
- `GET    /patients/:id/periodontogram/statistics`
- `GET    /patients/:id/periodontogram/statistics/:version`
- `PUT    /patients/:id/periodontogram/data`
- `GET    /patients/:id/periodontogram/data` (with `?version=` and `?listVersions=true`)
- `DELETE /patients/:id/periodontogram`

### Cash (6 endpoints)
- `GET  /cash/balance/monthly`
- `GET  /cash/session/status`
- `POST /cash/session/open`
- `POST /cash/session/close`
- `POST /cash/movements`
- `GET  /cash/movements`

### Users (3 endpoints)
- `GET   /users`
- `POST  /users`
- `PATCH /users/:id/disable`

### Statistics (5 endpoints)
- `GET /stats/summary`
- `GET /stats/cashbox-performance`
- `GET /stats/patients-trend`
- `GET /stats/no-shows`
- `GET /stats/productivity`

### Google Calendar Integration (2 backend + 1 external)
- `POST /google/refresh-token`
- `GET  /google/auth/url`
- `GET  https://www.googleapis.com/calendar/v3/...` *(external)*

---

## TOTAL: **52 API calls** across **~38 unique backend endpoints** + 1 external API

---

## NOTES & WARNINGS

1. **No Redux/Zustand stores** — all state is React local state + Context API (`AuthContext`).
2. **Mixed HTTP clients**: Most calls use the shared axios `API` instance (with auth interceptors), but `add-patient.jsx`, `patient-treatment-plan.jsx`, and `calendar.jsx` use native `fetch()`.
3. ⚠️ **`patient-treatment-plan.jsx`** uses `fetch('/api/patients/:id/treatment-plan')` without authorization headers — this may be a bug since all other patient endpoints require auth.
4. ⚠️ **`add-patient.jsx`** uses `fetch()` with `${API_URL}/api/patients/...` but does NOT set `Authorization` headers — relies on cookies (`withCredentials` is not set on native fetch).
5. **Duplicated calls**: `getAllPatients()` (from `api.js`) and `API.get('/patients')` (from `next-patient.jsx`) hit the same endpoint.
6. **Duplicated calls**: `checkInitialOdontogram()` in `patient-detail.jsx` duplicates the logic in `odontogramaService.checkInitialOdontogram()`.
7. All `API.*` calls automatically include `Authorization: Bearer <token>` via the request interceptor and handle 401 with automatic token refresh.
8. The `calendar.jsx` Google integration uses a completely separate token system stored in `localStorage` under key `accessToken` (different from the app's `dentia_access_token`).
