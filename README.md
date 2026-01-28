# Jira-NestJS Integration POC

Lightweight POC demonstrating bidirectional integration between NestJS (MySQL) and Jira Cloud for product lifecycle management.

## Features

- Product CRUD operations with automatic Jira issue synchronization
- Bidirectional sync: Backend ↔ Jira via REST API and webhooks
- Automatic Jira issue creation/updates/transitions

## Prerequisites

- Node.js (v18+), MySQL (v8+), Jira Cloud account

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment (create .env file)
# See Environment Configuration below

# Run application
npm run start:dev

# Run Tests
npm test
```

## Environment Configuration

Create `.env` file:

```env
# Database
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=your_username
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=jira_nestjs

# Jira
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your_api_token
JIRA_PROJECT_KEY=PROJ
JIRA_ISSUE_TYPE=Task
JIRA_DROPPED_TRANSITION_ID=5
# OR: JIRA_DROPPED_STATUS_NAME=Dropped

# App
PORT=3000
```

**Get Jira API token**: [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/products` | Create product (creates Jira issue) |
| `GET` | `/products/:id` | Get product with Jira ticket state |
| `PATCH` | `/products/:id` | Update product (syncs to Jira) |
| `DELETE` | `/products/:id` | Soft delete (transitions Jira to "Dropped") |
| `POST` | `/jira/webhook` | Receive Jira updates (configure in Jira Automation) |

## Jira Automation Setup

1. **Project Settings** → **Automation** → Create rule
2. **Trigger**: Issue Updated / Issue Transitioned
3. **Action**: Send Web Request
   - Method: `POST`
   - URL: `http://your-backend-url/jira/webhook`
   - Headers: `Content-Type: application/json`

## Database

TypeORM auto-creates `products` table on first run (`synchronize: true`). Use migrations for production.

## Testing

```bash
npm run test          # Unit tests
npm run test:e2e     # E2E tests
npm run test:cov     # Coverage
```

## Project Structure

```
src/
├── products/        # Product module (CRUD + Jira sync)
├── jira/           # Jira integration (REST API client + webhook)
└── main.ts         # Entry point
```



