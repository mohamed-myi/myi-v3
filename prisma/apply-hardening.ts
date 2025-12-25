import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter, log: ['info'] });

async function main() {
    const sqlPath = path.join(__dirname, 'post-migration.sql');
    console.log(`Reading SQL from ${sqlPath}`);
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    console.log('Applying hardening SQL...');

    try {
        // Execute as raw SQL
        // Note: The SQL file contains multiple statements. 
        // Prisma/pg driver generally handles this fine in a single query string.
        const result = await prisma.$executeRawUnsafe(sql);
        console.log('Successfully applied hardening SQL. Result:', result);
    } catch (e) {
        console.error('Error applying hardening SQL:', e);
        process.exit(1);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
