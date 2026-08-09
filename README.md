# 🌐 NagrikSetu Backend API
> **Community Platform for Welfare-Scheme Access & Transparent Grievance Redressal**

Deployed link: https://nagriksetu-d6bz.onrender.com/

Video Demo:https://drive.google.com/file/d/1oN2P36DsT7zSJPtSzYM1FAzdXJsS--lE/view?pli=1

NagrikSetu is a high-performance backend system designed to bridge the gap between citizens and local authorities. It provides:
1. **Welfare-Scheme Matching Engine**: A dual-layer system (deterministic eligibility filters + ML-driven semantic similarity search) mapping citizens' situations to government schemes.
2. **Transparent Grievance Redressal**: An anonymous reporting system with secure status tracking and a background ML classifier that predicts SLA breach risks to auto-escalate urgent issues.
3. **Multilingual AI Chatbot**: A voice-enabled chatbot supporting speech-to-text transcription and intent classification.

---

## 📂 Project Architecture

The codebase follows a modular design pattern grouped by business domains:

```text
NagrikSetu/
├── prisma/
│   ├── schema.prisma       # Database models and mappings
│   └── seed.ts             # Seeding script for schemes, admins, and training history
├── src/
│   ├── modules/
│   │   ├── admin/          # Admin/municipal authentication, reports management, and analytics APIs
│   │   │   └── router.ts
│   │   ├── chatbot/        # Intent classification, speech-to-text, and dialogue routing
│   │   │   └── router.ts
│   │   ├── escalation/     # ML logistic regression model training, prediction, and cron scheduler
│   │   │   ├── model.ts
│   │   │   ├── retrain.ts
│   │   │   └── scheduler.ts
│   │   ├── matching/       # Layer 1 eligibility checker and Layer 2 semantic ranked matcher
│   │   │   └── engine.ts
│   │   └── schemes/        # Public matching routes and protected scheme CRUD
│   │       └── router.ts
│   ├── utils/
│   │   ├── auth.ts         # JWT admin authorization verification hook
│   │   ├── embeddings.ts   # Google Gemini embedContent API client and local TF-IDF matcher
│   │   ├── gemini.ts       # Intent classification, transcription, and chatbot reply generation
│   │   └── storage.ts      # Local filesystem file upload abstraction layer
│   ├── config.ts           # Environment variables configuration loader
│   ├── db.ts               # PrismaClient instance using PostgreSQL pg adapter
│   └── index.ts            # Fastify application entry point, registering plugins and cron boot
├── tests/                  # Vitest unit test suites
│   ├── chatbot.test.ts
│   ├── classifier.test.ts
│   └── matching.test.ts
├── package.json            # Scripts, metadata, and dependencies
├── tsconfig.json           # TypeScript configuration
└── prisma.config.ts        # Prisma 7 database configuration mapping
```

---

## 🛠️ Step-by-Step Installation & Setup

### 1. Install Dependencies
Ensure you have **Node.js (v20+)** and **npm** installed on your system. Run:
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the root directory:
```env
# Database connection string
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/nagriksetu?schema=public"

# App configuration
PORT=5000
HOST=127.0.0.1
JWT_SECRET="your-jwt-signing-key-here"

# Google Gemini API key for embeddings, speech-to-text, and conversational AI
# Get a free key here: https://aistudio.google.com/
GEMINI_API_KEY="AIzaSyYourKeyHere..."

# File upload storage directory (Created automatically if missing)
UPLOAD_DIR="./uploads"
```

> [!NOTE]
> If `GEMINI_API_KEY` is omitted, the system continues to function by degrading gracefully to a **local TF-IDF parser** for scheme matching, a **regex & keyword intent parser** for the chatbot, and **local mock speech-to-text responses** for audio queries.

### 3. Initialize Database (Prisma 7 workflow)
NagrikSetu utilizes Prisma 7. The migration connection URL is configured via `prisma.config.ts`, and the client initializes database pools using the PostgreSQL driver adapter. 

Create database tables and run the bootstrap seed script:
```bash
# Apply schema models to your PostgreSQL database
npx prisma db push

# Seed schemes, initial admin/municipal users, and historical training resolutions
npx prisma db seed
```

### 4. Running the Project
```bash
# Run the development server (watches and hot-reloads)
npm run dev

# Run unit tests to verify matching, ML models, and chatbot heuristics
npm run test

# Build production bundle
npm run build

# Start production server
npm start
```

---

## 🗄️ Database Schema design
```mermaid
erDiagram
    Scheme {
        string id PK
        string name
        string description
        json eligibilityCriteria
        float-array embedding
        datetime createdAt
    }
    GrievanceReport {
        string id PK
        string trackingId UK
        string description
        string category
        string region
        float latitude
        float longitude
        string mediaUrl
        string status
        datetime createdAt
        datetime resolvedAt
        int slaHours
        float escalationRiskScore
        datetime escalatedAt
    }
    AdminUser {
        string id PK
        string username UK
        string passwordHash
        string role
        string region
        datetime createdAt
    }
    HistoricalResolution {
        string id PK
        string category
        string region
        int slaHours
        float elapsedTime
        boolean isOverdue
        datetime createdAt
    }
    MLModel {
        string id PK
        string name UK
        json weights
        float accuracy
        datetime updatedAt
    }
```

---

## 🤖 Machine Learning Modules

### 1. Scheme Matching Engine (Dual-Layer)
- **Layer 1 (Eligibility Checks)**: Evaluates input profiles against structured JSON parameters:
  - Age: checks boundaries `[minAge, maxAge]`
  - Income: checks `maxIncome` ceiling limit
  - Categorical filters: checks if profile gender, region, occupation, and caste category match specified criteria lists (case-insensitive).
- **Layer 2 (Semantic Embeddings Search)**: Evaluates free-text situation statements.
  - Queries `text-embedding-004` (Gemini API) to get a 768-dimension vector representation of the citizen's request.
  - Measures the **cosine similarity** between the query embedding and the pre-computed scheme embedding vectors cached in the database.
  - cosine formula: $Similarity = \frac{\vec{A} \cdot \vec{B}}{\|\vec{A}\|\|\vec{B}\|}$
  - Ranks results descending, matching citizens who write their situation in plain natural language (e.g. *"I am a widow looking for farm help"*).

### 2. SLA Escalation Risk Classifier (Logistic Regression)
- Active grievances that breach SLA are auto-escalated by a scheduler. To prioritize which ones escalate first during high backlog periods, a custom **Logistic Regression** classifier is trained.
- **Features Extracted**:
  1. `x0` = Bias intercept (constant `1.0`)
  2. `x1` = Target encoding rate for Category (historical overdue probability)
  3. `x2` = Target encoding rate for Region (historical overdue probability)
  4. `x3` = Submission hour (`createdAt.getHours() / 24.0`)
  5. `x4` = Region backlog queue size (`backlogCount / 50.0`)
- **Sigmoid Activation**: $P(Overdue) = \frac{1}{1 + e^{-(\vec{w} \cdot \vec{x})}}$
- **Training Model**: The model runs gradient descent to minimize cross-entropy loss, saving the optimal weights $w$ and target rates into the `MLModel` table in the database.
- **Retraining**: Triggered dynamically via `/api/admin/retrain-escalation-model`.

---

## 📡 REST API Reference

### Public Citizen APIs

#### 1. Match Welfare Schemes
Evaluates a citizen's profile and plain-text situation statement to rank schemes.
* **Endpoint**: `POST /api/schemes/match`
* **Request Body**:
```json
{
  "profile": {
    "age": 28,
    "income": 120000,
    "gender": "Female",
    "region": "Maharashtra",
    "category": "OBC",
    "occupation": "Farmer"
  },
  "situation": "I need financial support to purchase seed inputs and irrigation system updates."
}
```
* **Response (200 OK)**:
```json
{
  "success": true,
  "matchedSchemes": [
    {
      "id": "8b51d8b2-3c22-4a0b-bf88-1d20cf4c6df2",
      "name": "Mahila Kisan Sashaktikaran Pariyojana",
      "description": "Empowers women in agriculture by making systematic investments...",
      "eligibilityCriteria": {
        "minAge": 18,
        "maxIncome": 250000,
        "genders": ["Female"],
        "occupations": ["Farmer"]
      },
      "score": 0.895
    }
  ]
}
```
* **Test with cURL**:
```bash
curl -X POST http://127.0.0.1:5000/api/schemes/match \
  -H "Content-Type: application/json" \
  -d '{"profile":{"age":28,"income":120000,"gender":"Female","occupation":"Farmer"},"situation":"farm help"}'
```

#### 2. Submit Anonymous Grievance Report
Creates a trackable civic issue anonymously. Does not store citizen identity.
* **Endpoint**: `POST /api/reports`
* **Content-Type**: `multipart/form-data`
* **Request Payload**:
  - `description` (field string) - Details of the issue
  - `category` (field string) - "Roads", "Water Supply", "Sanitation", or "Streetlights"
  - `region` (field string) - Ward or municipal zone name
  - `latitude` (field number)
  - `longitude` (field number)
  - `media` (file upload, optional) - Image or video file
* **Response (210 Created)**:
```json
{
  "success": true,
  "trackingId": "NS-9481-LZ",
  "report": {
    "id": "cd0b112e-9d22-48cf-9a2d-128a38ec2981",
    "status": "SUBMITTED",
    "createdAt": "2026-08-08T10:40:00.000Z",
    "slaHours": 48
  }
}
```
* **Test with cURL**:
```bash
curl -X POST http://127.0.0.1:5000/api/reports \
  -F "description=Pothole on main street blocking traffic" \
  -F "category=Roads" \
  -F "region=Zone-A" \
  -F "latitude=19.076" \
  -F "longitude=72.877"
```

#### 3. Anonymous Status Tracking
Check the status of a report using the tracking ID.
* **Endpoint**: `GET /api/reports/track/:trackingId`
* **Response (200 OK)**:
```json
{
  "success": true,
  "report": {
    "trackingId": "NS-9481-LZ",
    "status": "SUBMITTED",
    "description": "Pothole on main street blocking traffic",
    "category": "Roads",
    "region": "Zone-A",
    "mediaUrl": null,
    "createdAt": "2026-08-08T10:40:00.000Z",
    "resolvedAt": null,
    "slaHours": 72,
    "escalated": false
  }
}
```
* **Test with cURL**:
```bash
curl http://127.0.0.1:5000/api/reports/track/NS-9481-LZ
```

#### 4. Multilingual Chatbot (Voice & Text)
Exposes an intent-routing chat endpoint. Audio uploads are transcribed first.
* **Endpoint**: `POST /api/chat`
* **JSON Request Body**:
```json
{
  "message": "Find schemes for female farmer",
  "languageCode": "en"
}
```
* **Response (200 OK)**:
```json
{
  "success": true,
  "intent": "APPLY_SCHEME",
  "reply": "You can check eligibility for matching schemes by filling out the profile assistance form. Here are matching assistance guidelines...",
  "suggestedFields": {
    "category": null,
    "region": null,
    "trackingId": null
  }
}
```
* **Test with cURL (Text)**:
```bash
curl -X POST http://127.0.0.1:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"what is the status of NS-9481-LZ?","languageCode":"en"}'
```
* **Test with cURL (Audio Upload)**:
```bash
curl -X POST http://127.0.0.1:5000/api/chat \
  -F "audio=@recording.wav;type=audio/wav" \
  -F "languageCode=hi"
```

---

### Protected Admin / Municipal APIs

Protected endpoints require the HTTP Header: `Authorization: Bearer <JWT_TOKEN>`.

#### 1. Register Administrative User
* **Endpoint**: `POST /api/admin/auth/register`
* **Request Body**:
```json
{
  "username": "officer_1",
  "password": "strongpassword123",
  "role": "MUNICIPAL",
  "region": "Zone-A"
}
```
* **Response (201 Created)**:
```json
{
  "success": true,
  "user": {
    "id": "e8d3209d-c782-411a-821f-829d8cd2f12a",
    "username": "officer_1",
    "role": "MUNICIPAL",
    "region": "Zone-A"
  }
}
```

#### 2. Administrative User Login
* **Endpoint**: `POST /api/admin/auth/login`
* **Request Body**:
```json
{
  "username": "officer_1",
  "password": "strongpassword123"
}
```
* **Response (200 OK)**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ey...",
  "user": {
    "id": "e8d3209d-c782-411a-821f-829d8cd2f12a",
    "username": "officer_1",
    "role": "MUNICIPAL",
    "region": "Zone-A"
  }
}
```

#### 3. Create Welfare Scheme
* **Endpoint**: `POST /api/admin/schemes`
* **Request Body**:
```json
{
  "name": "Scheme Title",
  "description": "Scheme details description",
  "eligibilityCriteria": {
    "minAge": 18,
    "maxIncome": 150000
  }
}
```
* **Response (201 Created)**:
```json
{
  "success": true,
  "scheme": {
    "id": "184b2cde-b391-4cf1-bd9a-debc28e219ba",
    "name": "Scheme Title",
    "description": "Scheme details description",
    "eligibilityCriteria": {
      "minAge": 18,
      "maxIncome": 150000
    }
  }
}
```

#### 4. List Active Grievance Reports (Filters Available)
Fetches reports. Municipal roles are automatically region-locked to their assigned region.
* **Endpoint**: `GET /api/admin/reports?status=SUBMITTED`
* **Response (200 OK)**:
```json
{
  "success": true,
  "reports": [
    {
      "id": "cd0b112e-9d22-48cf-9a2d-128a38ec2981",
      "trackingId": "NS-9481-LZ",
      "description": "Pothole on main street blocking traffic",
      "category": "Roads",
      "region": "Zone-A",
      "status": "SUBMITTED"
    }
  ]
}
```

#### 5. Update Grievance Status (Resolving grievances)
* **Endpoint**: `PUT /api/admin/reports/:id/status`
* **Request Body**:
```json
{
  "status": "RESOLVED"
}
```
* **Response (200 OK)**:
* **Note**: When marked `RESOLVED`, it calculates the elapsed time hours, checks if it is overdue past its `slaHours`, and logs metrics to `HistoricalResolution`.

#### 6. Retrain Escalation Predictor ML Model
Retrains the logistic regression parameters on resolved historical resolutions.
* **Endpoint**: `POST /api/admin/retrain-escalation-model`
* **Response (200 OK)**:
```json
{
  "success": true,
  "accuracy": 0.9,
  "weights": [-0.62, 1.45, 0.92, 0.12, 0.65],
  "categoryRates": {
    "Roads": 0.66,
    "Sanitation": 0.33
  },
  "regionRates": {
    "Zone-A": 0.25,
    "Zone-B": 0.75
  },
  "message": "Escalation risk classifier model retrained successfully."
}
```

#### 7. Analytics Metrics Dashboard
Fetches aggregate reports and scheme analytics trends.
* **Endpoint**: `GET /api/admin/analytics`
* **Response (200 OK)**:
```json
{
  "success": true,
  "analytics": {
    "totalReports": 45,
    "resolvedCount": 32,
    "activeCount": 13,
    "averageResolutionTimeHours": 24.5,
    "resolutionTimeByCategory": {
      "Water Supply": 14.2,
      "Roads": 46.8
    },
    "reportsByRegion": {
      "Zone-A": 15,
      "Zone-B": 30
    },
    "schemeUptakeByRegion": {
      "Zone-A": 45,
      "Zone-B": 90
    }
  }
}
```

---

## ⏰ SLA Escalation Job Checks
The background check (configured in `src/modules/escalation/scheduler.ts`) runs every minute. It checks for:
1. Active grievances (status `SUBMITTED` or `UNDER_REVIEW`) that have been created longer than `slaHours` ago.
2. For each breached report, it calculates its current escalation risk score using the latest trained parameters from the database.
3. Sorts them descending (highest risk first) to focus priority queue ordering.
4. Auto-transitions their status to `ESCALATED`, setting `escalatedAt = now` and recording their priority risk score.
