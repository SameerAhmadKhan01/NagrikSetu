import { prisma } from "../../db.js";
import { LogisticRegression, extractFeatures } from "./model.js";

/**
 * Retrains the logistic regression classifier on accumulated historical resolution data.
 * Computes overdue target-encoding for categories/regions, trains the model, and saves weights to the DB.
 */
export async function retrainModel(): Promise<{
  success: boolean;
  accuracy: number;
  weights: number[];
  categoryRates: Record<string, number>;
  regionRates: Record<string, number>;
  message: string;
}> {
  try {
    const history = await prisma.historicalResolution.findMany();
    
    if (history.length < 5) {
      return {
        success: false,
        accuracy: 0.0,
        weights: [],
        categoryRates: {},
        regionRates: {},
        message: `Insufficient training data. Minimum 5 historical resolutions required. Current: ${history.length}. Please submit or seed historical data first.`,
      };
    }

    // 1. Calculate Overdue Rates for Categories and Regions (Target Encoding)
    const categoryCounts: Record<string, { total: number; overdue: number }> = {};
    const regionCounts: Record<string, { total: number; overdue: number }> = {};

    history.forEach((h: any) => {
      // Category count
      if (!categoryCounts[h.category]) {
        categoryCounts[h.category] = { total: 0, overdue: 0 };
      }
      categoryCounts[h.category].total++;
      if (h.isOverdue) {
        categoryCounts[h.category].overdue++;
      }

      // Region count
      if (!regionCounts[h.region]) {
        regionCounts[h.region] = { total: 0, overdue: 0 };
      }
      regionCounts[h.region].total++;
      if (h.isOverdue) {
        regionCounts[h.region].overdue++;
      }
    });

    const categoryRates: Record<string, number> = {};
    for (const [cat, counts] of Object.entries(categoryCounts)) {
      categoryRates[cat] = counts.overdue / counts.total;
    }

    const regionRates: Record<string, number> = {};
    for (const [reg, counts] of Object.entries(regionCounts)) {
      regionRates[reg] = counts.overdue / counts.total;
    }

    // 2. Build feature vectors and target labels
    const X: number[][] = [];
    const y: number[] = [];

    for (const h of history) {
      // Simulate historical queue depth density based on overall region sample frequency
      const simulatedBacklog = Math.floor(Math.random() * 8) + ((regionCounts[h.region]?.total || 1) % 5);
      
      const features = extractFeatures(
        h.category,
        h.region,
        h.createdAt,
        simulatedBacklog,
        categoryRates,
        regionRates
      );
      
      X.push(features);
      y.push(h.isOverdue ? 1 : 0);
    }

    // 3. Train Logistic Regression
    const clf = new LogisticRegression();
    const accuracy = clf.train(X, y);
    const weights = clf.getWeights();

    // 4. Serialize and Save ML Model state to DB
    const weightsPayload = {
      weights,
      categoryRates,
      regionRates,
    };

    await prisma.mLModel.upsert({
      where: { name: "escalation-prediction" },
      update: {
        weights: weightsPayload,
        accuracy,
      },
      create: {
        name: "escalation-prediction",
        weights: weightsPayload,
        accuracy,
      },
    });

    return {
      success: true,
      accuracy,
      weights,
      categoryRates,
      regionRates,
      message: "Escalation risk classifier model retrained successfully.",
    };
  } catch (error: any) {
    console.error("Retraining failed:", error);
    return {
      success: false,
      accuracy: 0.0,
      weights: [],
      categoryRates: {},
      regionRates: {},
      message: `Retraining model failed: ${error.message || error}`,
    };
  }
}
