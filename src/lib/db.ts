import { PrismaClient } from "@prisma/client";

// Acepta también el nombre de la integración Supabase de Vercel.
process.env.DATABASE_URL ||= process.env.POSTGRES_PRISMA_URL;

const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
