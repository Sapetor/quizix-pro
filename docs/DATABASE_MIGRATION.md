# Database Migration Guide

This document outlines the migration path from file-based storage to a database system for Quizix Pro.

## Current Architecture

Quizix Pro currently uses file-based storage:

```
quizzes/           # Quiz JSON files
  ├── quiz-1.json
  ├── quiz-2.json
  └── ...

results/           # Game results JSON files
  ├── result-2024-01-01-12-00-00.json
  └── ...

public/uploads/    # User-uploaded images
  ├── abc123.png
  └── ...
```

### Current Services

| Service | File | Storage |
|---------|------|---------|
| QuizService | `services/quiz-service.js` | `quizzes/*.json` |
| ResultsService | `services/results-service.js` | `results/*.json` |
| GameSessionService | `services/game-session-service.js` | In-memory + `results/*.json` |

## Why Migrate?

### File-Based Limitations
- **No ACID transactions**: Concurrent writes can corrupt data
- **No query capabilities**: Must load all files to search/filter
- **No relationships**: Quiz-result relationships are implicit
- **Scaling issues**: Performance degrades with many files
- **No backup strategy**: Manual file backup required

### Database Benefits
- **ACID compliance**: Guaranteed data integrity
- **Efficient queries**: Index-based search and filtering
- **Relationships**: Foreign keys for quiz-result links
- **Horizontal scaling**: Read replicas, sharding options
- **Backup/recovery**: Built-in backup mechanisms

## Database Options

### Option 1: PostgreSQL (Recommended for Production)

**Pros:**
- ACID compliant with strong consistency
- JSONB support for flexible quiz schemas
- Excellent Kubernetes support (CloudNativePG, Crunchy Data)
- Full-text search for quiz content
- Mature ecosystem and tooling

**Cons:**
- Requires separate database server
- More complex setup than SQLite

**Best for:** Production Kubernetes deployments, multi-instance setups

### Option 2: SQLite (Recommended for Simple Deployments)

**Pros:**
- Zero configuration, embedded database
- Single file storage (easy backup)
- No separate server process
- Excellent read performance

**Cons:**
- Single-writer limitation
- Not suitable for multi-instance deployments
- Limited concurrent write performance

**Best for:** Single-instance deployments, development, small teams

### Option 3: MongoDB

**Pros:**
- Native JSON document storage
- Flexible schema (matches current JSON structure)
- Horizontal scaling with sharding

**Cons:**
- Eventually consistent by default
- Requires separate server
- Higher memory requirements

**Best for:** Large-scale deployments needing document flexibility

## Recommended Schema

### PostgreSQL Schema

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Quizzes table
CREATE TABLE quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    questions JSONB NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255),
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Index for fast title search
CREATE INDEX idx_quizzes_title ON quizzes(title);
CREATE INDEX idx_quizzes_created_at ON quizzes(created_at DESC);

-- Game results table
CREATE TABLE game_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID REFERENCES quizzes(id),
    quiz_title VARCHAR(255) NOT NULL,
    pin VARCHAR(10) NOT NULL,
    host_name VARCHAR(255),
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    player_count INTEGER DEFAULT 0,
    question_count INTEGER DEFAULT 0,
    players JSONB NOT NULL,
    questions JSONB NOT NULL,
    statistics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_results_quiz_id ON game_results(quiz_id);
CREATE INDEX idx_results_created_at ON game_results(created_at DESC);
CREATE INDEX idx_results_pin ON game_results(pin);

-- Uploaded images table
CREATE TABLE uploads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL UNIQUE,
    original_name VARCHAR(255),
    mime_type VARCHAR(100),
    size_bytes INTEGER,
    quiz_id UUID REFERENCES quizzes(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_uploads_quiz_id ON uploads(quiz_id);
```

### SQLite Schema

```sql
-- Quizzes table
CREATE TABLE quizzes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    questions TEXT NOT NULL,  -- JSON string
    settings TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    created_by TEXT,
    is_deleted INTEGER DEFAULT 0
);

CREATE INDEX idx_quizzes_title ON quizzes(title);
CREATE INDEX idx_quizzes_created_at ON quizzes(created_at);

-- Game results table
CREATE TABLE game_results (
    id TEXT PRIMARY KEY,
    quiz_id TEXT REFERENCES quizzes(id),
    quiz_title TEXT NOT NULL,
    pin TEXT NOT NULL,
    host_name TEXT,
    started_at TEXT,
    ended_at TEXT,
    player_count INTEGER DEFAULT 0,
    question_count INTEGER DEFAULT 0,
    players TEXT NOT NULL,  -- JSON string
    questions TEXT NOT NULL,  -- JSON string
    statistics TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_results_quiz_id ON game_results(quiz_id);
CREATE INDEX idx_results_created_at ON game_results(created_at);

-- Uploads table
CREATE TABLE uploads (
    id TEXT PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    original_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    quiz_id TEXT REFERENCES quizzes(id),
    created_at TEXT DEFAULT (datetime('now'))
);
```

## Migration Strategy

### Phase 1: Add Database Layer (Non-Breaking)

1. **Install database client**
   ```bash
   # PostgreSQL
   npm install pg

   # SQLite
   npm install better-sqlite3
   ```

2. **Create database abstraction layer**

   Create `services/database/db-client.js`:
   ```javascript
   const { Pool } = require('pg');

   class DatabaseClient {
       constructor() {
           this.pool = new Pool({
               connectionString: process.env.DATABASE_URL,
               max: 20,
               idleTimeoutMillis: 30000,
               connectionTimeoutMillis: 2000,
           });
       }

       async query(text, params) {
           const start = Date.now();
           const res = await this.pool.query(text, params);
           const duration = Date.now() - start;
           console.log('Executed query', { text, duration, rows: res.rowCount });
           return res;
       }

       async getClient() {
           return await this.pool.connect();
       }

       async close() {
           await this.pool.end();
       }
   }

   module.exports = new DatabaseClient();
   ```

3. **Create database-backed services**

   Create `services/database/quiz-db-service.js`:
   ```javascript
   const db = require('./db-client');

   class QuizDbService {
       async saveQuiz(quiz) {
           const { id, title, description, questions, settings } = quiz;
           const result = await db.query(
               `INSERT INTO quizzes (id, title, description, questions, settings, updated_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    title = $2, description = $3, questions = $4,
                    settings = $5, updated_at = NOW()
                RETURNING *`,
               [id || require('crypto').randomUUID(), title, description,
                JSON.stringify(questions), JSON.stringify(settings)]
           );
           return result.rows[0];
       }

       async listQuizzes() {
           const result = await db.query(
               `SELECT id, title, description,
                       json_array_length(questions::json) as question_count,
                       created_at, updated_at
                FROM quizzes
                WHERE is_deleted = false
                ORDER BY updated_at DESC`
           );
           return result.rows;
       }

       async getQuiz(id) {
           const result = await db.query(
               `SELECT * FROM quizzes WHERE id = $1 AND is_deleted = false`,
               [id]
           );
           if (result.rows.length === 0) {
               throw new Error('Quiz not found');
           }
           return result.rows[0];
       }

       async deleteQuiz(id) {
           await db.query(
               `UPDATE quizzes SET is_deleted = true, updated_at = NOW() WHERE id = $1`,
               [id]
           );
       }

       async searchQuizzes(query) {
           const result = await db.query(
               `SELECT * FROM quizzes
                WHERE is_deleted = false
                  AND (title ILIKE $1 OR description ILIKE $1)
                ORDER BY updated_at DESC`,
               [`%${query}%`]
           );
           return result.rows;
       }
   }

   module.exports = new QuizDbService();
   ```

### Phase 2: Dual-Write Mode

Run both file and database storage simultaneously:

```javascript
// services/quiz-service.js (updated)
const quizDbService = require('./database/quiz-db-service');
const USE_DATABASE = process.env.USE_DATABASE === 'true';

class QuizService {
    async saveQuiz(title, questions) {
        // Always save to file (current behavior)
        const filename = await this.saveToFile(title, questions);

        // Also save to database if enabled
        if (USE_DATABASE) {
            try {
                await quizDbService.saveQuiz({
                    id: filename.replace('.json', ''),
                    title,
                    questions
                });
            } catch (err) {
                console.error('Database write failed:', err);
                // Don't fail the request - file is the source of truth
            }
        }

        return filename;
    }
}
```

### Phase 3: Migration Script

Create `scripts/migrate-to-database.js`:

```javascript
#!/usr/bin/env node
/**
 * Migration script: File-based storage to Database
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/migrate-to-database.js
 *
 * Options:
 *   --dry-run    Show what would be migrated without making changes
 *   --validate   Validate migrated data matches source files
 */

const fs = require('fs').promises;
const path = require('path');
const db = require('../services/database/db-client');

const QUIZZES_DIR = path.join(__dirname, '../quizzes');
const RESULTS_DIR = path.join(__dirname, '../results');

async function migrateQuizzes(dryRun = false) {
    console.log('\n📚 Migrating quizzes...');

    const files = await fs.readdir(QUIZZES_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let migrated = 0;
    let failed = 0;

    for (const file of jsonFiles) {
        try {
            const content = await fs.readFile(
                path.join(QUIZZES_DIR, file),
                'utf8'
            );
            const quiz = JSON.parse(content);

            if (dryRun) {
                console.log(`  Would migrate: ${quiz.title} (${file})`);
            } else {
                await db.query(
                    `INSERT INTO quizzes (id, title, questions, settings, created_at)
                     VALUES ($1, $2, $3, $4, $5)
                     ON CONFLICT (id) DO NOTHING`,
                    [
                        file.replace('.json', ''),
                        quiz.title,
                        JSON.stringify(quiz.questions),
                        JSON.stringify(quiz.settings || {}),
                        quiz.created || new Date().toISOString()
                    ]
                );
                console.log(`  ✓ Migrated: ${quiz.title}`);
            }
            migrated++;
        } catch (err) {
            console.error(`  ✗ Failed: ${file} - ${err.message}`);
            failed++;
        }
    }

    console.log(`\n  Summary: ${migrated} migrated, ${failed} failed`);
    return { migrated, failed };
}

async function migrateResults(dryRun = false) {
    console.log('\n📊 Migrating results...');

    const files = await fs.readdir(RESULTS_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    let migrated = 0;
    let failed = 0;

    for (const file of jsonFiles) {
        try {
            const content = await fs.readFile(
                path.join(RESULTS_DIR, file),
                'utf8'
            );
            const result = JSON.parse(content);

            if (dryRun) {
                console.log(`  Would migrate: ${result.quizTitle} (${file})`);
            } else {
                await db.query(
                    `INSERT INTO game_results
                     (id, quiz_title, pin, host_name, started_at, ended_at,
                      player_count, question_count, players, questions, statistics)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                     ON CONFLICT (id) DO NOTHING`,
                    [
                        file.replace('.json', ''),
                        result.quizTitle,
                        result.pin,
                        result.hostName,
                        result.startedAt,
                        result.endedAt,
                        result.players?.length || 0,
                        result.questions?.length || 0,
                        JSON.stringify(result.players || []),
                        JSON.stringify(result.questions || []),
                        JSON.stringify(result.statistics || {})
                    ]
                );
                console.log(`  ✓ Migrated: ${result.quizTitle}`);
            }
            migrated++;
        } catch (err) {
            console.error(`  ✗ Failed: ${file} - ${err.message}`);
            failed++;
        }
    }

    console.log(`\n  Summary: ${migrated} migrated, ${failed} failed`);
    return { migrated, failed };
}

async function validateMigration() {
    console.log('\n🔍 Validating migration...');

    // Count records
    const quizCount = await db.query('SELECT COUNT(*) FROM quizzes');
    const resultCount = await db.query('SELECT COUNT(*) FROM game_results');

    const quizFiles = (await fs.readdir(QUIZZES_DIR))
        .filter(f => f.endsWith('.json')).length;
    const resultFiles = (await fs.readdir(RESULTS_DIR))
        .filter(f => f.endsWith('.json')).length;

    console.log(`  Quizzes: ${quizCount.rows[0].count} in DB, ${quizFiles} files`);
    console.log(`  Results: ${resultCount.rows[0].count} in DB, ${resultFiles} files`);

    const quizzesMatch = parseInt(quizCount.rows[0].count) >= quizFiles;
    const resultsMatch = parseInt(resultCount.rows[0].count) >= resultFiles;

    if (quizzesMatch && resultsMatch) {
        console.log('\n  ✓ Migration validated successfully');
    } else {
        console.log('\n  ⚠ Some records may not have migrated');
    }
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const validate = args.includes('--validate');

    console.log('🚀 Quizix Pro Database Migration');
    console.log('================================');

    if (dryRun) {
        console.log('Running in DRY RUN mode - no changes will be made\n');
    }

    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL environment variable not set');
        process.exit(1);
    }

    try {
        // Test database connection
        await db.query('SELECT 1');
        console.log('✓ Database connection successful');

        // Run migrations
        await migrateQuizzes(dryRun);
        await migrateResults(dryRun);

        // Validate if requested
        if (validate && !dryRun) {
            await validateMigration();
        }

        console.log('\n✅ Migration complete!');
    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await db.close();
    }
}

main();
```

### Phase 4: Switch to Database-Primary

Once dual-write is stable:

1. Update environment variable:
   ```bash
   USE_DATABASE=true
   DATABASE_PRIMARY=true
   ```

2. Update services to read from database:
   ```javascript
   async listQuizzes() {
       if (process.env.DATABASE_PRIMARY === 'true') {
           return await quizDbService.listQuizzes();
       }
       return await this.listFromFiles();
   }
   ```

### Phase 5: Deprecate File Storage

1. Stop writing to files
2. Keep files for backup period (30 days recommended)
3. Archive files to object storage (S3, GCS)
4. Remove file-based code paths

## Kubernetes Deployment

### PostgreSQL on Kubernetes

**Option A: CloudNativePG (Recommended)**

```yaml
# postgresql-cluster.yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: quizix-db
spec:
  instances: 3
  storage:
    size: 10Gi
  bootstrap:
    initdb:
      database: quizix
      owner: quizix
  postgresql:
    parameters:
      max_connections: "200"
      shared_buffers: "256MB"
```

**Option B: Helm Chart**

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install quizix-db bitnami/postgresql \
  --set auth.database=quizix \
  --set auth.username=quizix \
  --set primary.persistence.size=10Gi
```

### Environment Configuration

```yaml
# kubernetes/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: quizix-config
data:
  USE_DATABASE: "true"
  DATABASE_PRIMARY: "true"

---
# kubernetes/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: quizix-secrets
type: Opaque
stringData:
  DATABASE_URL: "postgresql://quizix:password@quizix-db:5432/quizix"
```

## Rollback Procedure

If issues occur during migration:

1. **Disable database mode**
   ```bash
   USE_DATABASE=false
   DATABASE_PRIMARY=false
   ```

2. **Restore from file backup**
   ```bash
   cp -r /backup/quizzes/* ./quizzes/
   cp -r /backup/results/* ./results/
   ```

3. **Verify application works**
   - Test quiz listing
   - Test quiz creation
   - Test game play

4. **Investigate database issues**
   - Check database logs
   - Verify connection string
   - Check schema compatibility

## Performance Considerations

### Indexing Strategy

```sql
-- Add indexes for common queries
CREATE INDEX CONCURRENTLY idx_quizzes_title_gin
ON quizzes USING gin(to_tsvector('english', title));

-- Partial index for active quizzes
CREATE INDEX idx_quizzes_active
ON quizzes(updated_at DESC)
WHERE is_deleted = false;

-- JSONB index for question search
CREATE INDEX idx_quizzes_questions
ON quizzes USING gin(questions);
```

### Connection Pooling

For Kubernetes with multiple replicas:

```javascript
// Use PgBouncer or connection pooling
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,  // Per instance, multiply by replicas
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});
```

### Query Optimization

```javascript
// Use prepared statements for frequent queries
const getQuizStatement = {
    name: 'get-quiz',
    text: 'SELECT * FROM quizzes WHERE id = $1 AND is_deleted = false',
};

async getQuiz(id) {
    return await db.query(getQuizStatement, [id]);
}
```

## Monitoring

### Health Checks

```javascript
// Add database health to /ready endpoint
app.get('/ready', async (req, res) => {
    const checks = {
        database: false,
        quizzes: false,
        results: false,
    };

    try {
        await db.query('SELECT 1');
        checks.database = true;
    } catch (err) {
        console.error('Database health check failed:', err);
    }

    // ... other checks

    const allHealthy = Object.values(checks).every(v => v);
    res.status(allHealthy ? 200 : 503).json({
        status: allHealthy ? 'ready' : 'degraded',
        checks
    });
});
```

### Metrics

Consider adding database metrics:
- Query latency (p50, p95, p99)
- Connection pool utilization
- Query error rate
- Row counts

## Timeline Estimate

| Phase | Tasks |
|-------|-------|
| Phase 1 | Add database layer, create abstraction |
| Phase 2 | Implement dual-write, test thoroughly |
| Phase 3 | Run migration script, validate data |
| Phase 4 | Switch to database-primary |
| Phase 5 | Deprecate and archive file storage |

## Checklist

- [ ] Choose database (PostgreSQL recommended for K8s)
- [ ] Set up database in development environment
- [ ] Create schema and run migrations
- [ ] Implement database service layer
- [ ] Add dual-write mode
- [ ] Test thoroughly in staging
- [ ] Run migration script
- [ ] Validate migrated data
- [ ] Switch to database-primary
- [ ] Monitor for issues
- [ ] Archive file storage
- [ ] Remove file-based code paths
