# MYI-V3 / Self-Hosted Spotify Data Warehouse

> **Spotify App Status**: Development Mode
>
> **Spotify Developer Policy**: As of May 15, 2025, Spotify only accepts applications from organizations. This application cannot be verified for public use. To self-host, you must create your own Spotify Developer App using the steps in the setup section.

> **Discotinued Features**: Due to this restriction, I decided not to continue with adding features such as being able to add friends, share music, get recommendations or create playlists. Given the limitation, I decided to just treat this project as a learning experience for data warehousing as opposed to a full-featured app.

## 1. Project Evolution

### MYI-V1 (Fall 2024)
My first full-stack project was essentially an API wrapper. It relied on a 2,000 line monolithic file that handled authentication, API logic, and data processing in a single thread. It lacked modularity and testing, which made it incapable of handling significant loads. UI rendering was slow because API calls were triggered on-demand, leading to frequent rate-limiting. The cyclomatic complexity made it impossible to maintain.

### MYI-V2 (Fall 2025)
This version introduced background polling and exponential backoff to manage rate limits. I added 3-tier caching and session persistence to avoid redundant authentication. While the code was more modular and included initial test cases, it still relied on in-memory caching. This meant data was lost on server restarts and heavy processing risked blocking the Node.js event loop.

### MYI-V3 (Fall - Winter 2025)
After a few months at my internship, I realized that the planning and testing phases were more important than the actual coding. I shifted my focus to architecture and resilience. V3 was designed to solve three persistent issues:

*   **Memory Management**: Moving data processing out of the main event loop to prevent crashes.
*   **Path Decoupling**: Separating the processing and serving paths so ingestion never blocks the API.
*   **Persistence**: Moving from in-memory caching to a robust, partitioned PostgreSQL warehouse.

## 2. Engineering Challenges

> For implementation details, refer to the [Architecture](docs/architecture.md), [Data Models](docs/data_models.md), and [Data Flow](docs/data_flow.md) documents.

### 2.1 Declarative Partitioning for 900M+ Scale
A single table for listening events would eventually exceed manageable index sizes, slowing down queries. Monthly range partitioning keeps index depth shallow and allows for efficient data management without expensive delete operations.

→ Implementation: [Partitioning Strategy](docs/data_models.md#3-key-constraints-and-indices)

### 2.2 Compute Off-Path Architecture
Complex aggregations are too expensive to calculate during a user's HTTP request. Decoupling the write/compute path from the read path via async workers ensures the API is never blocked by heavy data processing.

→ Implementation: [Async Processing Rationale](docs/data_flow.md#42-synchronous-vs-asynchronous-processing) | [Architectural Pattern](docs/architecture.md#3-architectural-rationale)

### 2.3 State-Locked Metadata Ingestion
Repeated tracks in history would normally trigger Spotify's rate limits if metadata was fetched for every play. A 24-hour distributed lock using Redis ensures only one worker fetches metadata while others skip the call.

→ Implementation: [Metadata Lock Trade-offs](docs/data_flow.md#32-metadata-worker-stale-lock)

### 2.4 Stream-Based Memory Management
Importing large history files into Node.js memory causes heap overflows. Processing files chunk-by-chunk keeps memory usage constant regardless of the file size.

→ Implementation: [Import Pipeline](docs/data_flow.md#23-legacy-history-import)

## 3. Learnings

### System Design > Syntax
My biggest takeaway from V3 was that coding is the easy part. Spending weeks on system design and schema planning saved months of debugging. I learned to value a "plan-first" approach, where I break the system into small, decoupled services before writing any logic.

### Don't build for the happy path
In previous versions, a single API failure could crash the sync engine. In this version, I learned to implement circuit breakers and idempotent workers. If a job fails, the system recovers gracefully without duplicating data or losing state.

### Separation of Concerns
I used to rely heavily on application logic to handle data. This project taught me to lean on the database. Using native PostgreSQL features like declarative partitioning and composite unique indexes is a lot more efficient than trying to manage data integrity in Node.js.

## 4. Technology Stack

| Layer | Technologies |
|-------|--------------|
| **Backend** | Node.js, TypeScript, Fastify, BullMQ |
| **Data** | PostgreSQL 17, Prisma 7, Redis |
| **Frontend** | Next.js 16, TailwindCSS, Framer Motion |
| **Infrastructure** | Railway, Vercel, Neon |

→ Rationale: [Technology Selection](docs/architecture.md#3-architectural-rationale)

## 5. Technical Documentation

| Document | Focus Area |
|----------|------------|
| [Architecture](docs/architecture.md) | System design, SOD, Alternative Options |
| [Data Models](docs/data_models.md) | Entity relationships, constraints, critique |
| [Data Flow](docs/data_flow.md) | Data pipelines, transformation logic |

## 6. Setup and Installation

### Spotify Developer Setup
Because this app runs in Development Mode, you must use your own credentials:

1.  Log in to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2.  Create a new App and set the Redirect URI to `http://127.0.0.1:3001/auth/callback`.
3.  In User Management, manually add the email of your Spotify account.
4.  Copy the Client ID and Client Secret into your environment file.

### Installation

1.  **Install dependencies**:
    ```bash
    pnpm install
    ```

2.  **Run database migrations**:
    ```bash
    npx prisma migrate dev
    ```

3.  **Start development servers**:
    ```bash
    pnpm run dev
    ```
### Credits

Written by Mohamed Ibrahim, formatted by Gemini.
