import { PrismaClient } from "@prisma/client";

// Acepta también los nombres de la integración Supabase de Vercel.
process.env.DATABASE_URL ||= process.env.POSTGRES_PRISMA_URL;
process.env.DIRECT_URL ||= process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
