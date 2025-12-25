import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('Verifying Partitioning and Hardening...');

    const partitions = await prisma.$queryRaw`
        SELECT
            parent.relname      AS parent_table,
            child.relname       AS child_partition,
            pg_get_expr(child.relpartbound, child.oid) AS partition_expression
        FROM pg_inherits
        JOIN pg_class parent        ON pg_inherits.inhparent = parent.oid
        JOIN pg_class child         ON pg_inherits.inhrelid   = child.oid
        WHERE parent.relname = 'listening_events'
        ORDER BY child.relname;
    `;
    console.log('Partitions:', partitions);

    const columns = await prisma.$queryRaw`
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_name = 'listening_events' AND column_name = 'played_at';
    `;
    console.log('Column Definition:', columns);

    const settings = await prisma.$queryRaw`
        SELECT relname, reloptions
        FROM pg_class
        WHERE relname IN ('listening_events_y2025m12', 'listening_events_y2026m01');
    `;
    console.log('Partition Settings:', settings);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
