import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// Helper to generate a dummy 768-dimension embedding vector
function generateMockEmbedding(): number[] {
  const vec: number[] = [];
  for (let i = 0; i < 768; i++) {
    // Generate small floats centered around 0.0
    vec.push((Math.random() - 0.5) * 0.1);
  }
  return vec;
}

async function main() {
  console.log("🌱 Starting database seeding script...");

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL env variable is not set. Seeding aborted.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // 1. Clean existing records (Optional for fresh seed)
    console.log("Cleaning old records...");
    await prisma.scheme.deleteMany({});
    await prisma.grievanceReport.deleteMany({});
    await prisma.historicalResolution.deleteMany({});
    await prisma.adminUser.deleteMany({});
    await prisma.mLModel.deleteMany({});

    // 2. Seed Default Schemes
    console.log("Seeding Schemes...");
    const schemesData = [
      {
        name: "Mahila Kisan Sashaktikaran Pariyojana",
        description: "Empowers women in agriculture by making systematic investments to enhance their participation and productivity.",
        eligibilityCriteria: {
          minAge: 18,
          maxIncome: 250000,
          genders: ["Female"],
          occupations: ["Farmer"],
        },
        embedding: generateMockEmbedding(),
      },
      {
        name: "Pradhan Mantri Awas Yojana (Gramin)",
        description: "Provides financial assistance to rural households below the poverty line to construct durable residential houses.",
        eligibilityCriteria: {
          minAge: 21,
          maxAge: 65,
          maxIncome: 180000,
          regions: ["Maharashtra", "Bihar", "Uttar Pradesh"],
        },
        embedding: generateMockEmbedding(),
      },
      {
        name: "Senior Citizen Pension Assistance",
        description: "Provides monthly financial allowance and healthcare subvention to elderly citizens below the poverty line.",
        eligibilityCriteria: {
          minAge: 60,
          maxIncome: 150000,
          categories: ["General", "OBC", "SC", "ST"],
        },
        embedding: generateMockEmbedding(),
      },
      {
        name: "Post-Matric Scholarship Scheme for SC/ST Students",
        description: "Financial assistance for pursuing higher post-matriculation studies for SC/ST community students.",
        eligibilityCriteria: {
          minAge: 16,
          maxAge: 28,
          maxIncome: 300000,
          categories: ["SC", "ST"],
        },
        embedding: generateMockEmbedding(),
      },
    ];

    for (const scheme of schemesData) {
      await prisma.scheme.create({ data: scheme });
    }
    console.log("Welfare schemes seeded.");

    // 3. Seed Default Admin
    console.log("Seeding Admin User...");
    const adminPasswordHash = await bcrypt.hash("adminpassword123", 10);
    const municipalPasswordHash = await bcrypt.hash("municipal123", 10);

    await prisma.adminUser.create({
      data: {
        username: "admin",
        passwordHash: adminPasswordHash,
        role: "ADMIN",
      },
    });

    await prisma.adminUser.create({
      data: {
        username: "municipal_officer",
        passwordHash: municipalPasswordHash,
        role: "MUNICIPAL",
        region: "Zone-A",
      },
    });
    console.log("Admin and Municipal users seeded (Admin: admin / adminpassword123, Municipal: municipal_officer / municipal123).");

    // 4. Seed Grievance Reports (Active & Resolved)
    console.log("Seeding Grievance Reports...");
    
    // Active reports
    const reportsData = [
      {
        trackingId: "NS-5283-XP",
        description: "Potholes on the main connector street blocking municipal transport buses.",
        category: "Roads",
        region: "Zone-A",
        latitude: 19.076,
        longitude: 72.877,
        status: "SUBMITTED",
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
      },
      {
        trackingId: "NS-9102-LA",
        description: "Broken pipeline leading to clean drinking water flooding the road outside Ward 5 blocks.",
        category: "Water Supply",
        region: "Zone-B",
        latitude: 19.088,
        longitude: 72.882,
        status: "UNDER_REVIEW",
        createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000), // 36 hours ago (near SLA)
      },
      {
        trackingId: "NS-3382-TR",
        description: "Garbage accumulating at the local park corner causing foul smell and health hazards.",
        category: "Sanitation",
        region: "Zone-A",
        latitude: 19.055,
        longitude: 72.891,
        status: "SUBMITTED",
        createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000), // 72 hours ago (breached SLA)
      },
    ];

    for (const report of reportsData) {
      await prisma.grievanceReport.create({ data: report as any });
    }

    // 5. Seed Historical Resolution Data (needed to retrain model immediately)
    console.log("Seeding Historical Resolutions...");
    const historicalData = [
      { category: "Water Supply", region: "Zone-A", slaHours: 24, elapsedTime: 12.5, isOverdue: false, createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) },
      { category: "Water Supply", region: "Zone-B", slaHours: 24, elapsedTime: 28.0, isOverdue: true, createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000) },
      { category: "Roads", region: "Zone-A", slaHours: 48, elapsedTime: 36.2, isOverdue: false, createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
      { category: "Roads", region: "Zone-B", slaHours: 48, elapsedTime: 72.5, isOverdue: true, createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      { category: "Sanitation", region: "Zone-A", slaHours: 24, elapsedTime: 18.0, isOverdue: false, createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
      { category: "Sanitation", region: "Zone-B", slaHours: 24, elapsedTime: 40.0, isOverdue: true, createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
      { category: "Streetlights", region: "Zone-A", slaHours: 24, elapsedTime: 10.0, isOverdue: false, createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) },
      { category: "Streetlights", region: "Zone-B", slaHours: 24, elapsedTime: 30.5, isOverdue: true, createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      { category: "Sanitation", region: "Zone-A", slaHours: 24, elapsedTime: 14.5, isOverdue: false, createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
      { category: "Roads", region: "Zone-A", slaHours: 48, elapsedTime: 80.0, isOverdue: true, createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000) },
    ];

    for (const hist of historicalData) {
      await prisma.historicalResolution.create({ data: hist });
    }
    console.log("Historical resolution data seeded.");

    console.log("🎉 Database seeding completed successfully!");
  } catch (error) {
    console.error("Seeding failed with error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
