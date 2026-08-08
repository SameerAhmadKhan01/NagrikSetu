import { prisma } from "../../db.js";

export interface ModelMetadata {
  weights: number[]; // [bias, w_category, w_region, w_hour, w_backlog]
  categoryRates: Record<string, number>;
  regionRates: Record<string, number>;
  accuracy: number;
}

/**
 * Hand-rolled Logistic Regression Classifier for explainable risk classification.
 * Prevents native C++ dependency compilation errors on user environments.
 */
export class LogisticRegression {
  private weights: number[] = [0, 0, 0, 0, 0]; // [bias, w_category, w_region, w_hour, w_backlog]
  private learningRate = 0.1;
  private epochs = 500;

  constructor(weights?: number[]) {
    if (weights && weights.length === 5) {
      this.weights = [...weights];
    }
  }

  private sigmoid(z: number): number {
    return 1 / (1 + Math.exp(-z));
  }

  /**
   * Predict risk probability [0, 1] for a feature vector.
   * Features: [1.0 (bias), category_rate, region_rate, normalized_hour, normalized_backlog]
   */
  public predict(features: number[]): number {
    let z = 0;
    for (let i = 0; i < this.weights.length; i++) {
      z += this.weights[i] * features[i];
    }
    return this.sigmoid(z);
  }

  /**
   * Trains the model using Gradient Descent.
   * X: Array of feature vectors (each length 5)
   * y: Array of labels (0 or 1)
   */
  public train(X: number[][], y: number[]): number {
    const m = X.length;
    if (m === 0) {
      return 1.0; // Perfect accuracy on empty set
    }

    this.weights = [0, 0, 0, 0, 0]; // reset

    for (let epoch = 0; epoch < this.epochs; epoch++) {
      const gradients = [0, 0, 0, 0, 0];

      for (let i = 0; i < m; i++) {
        const xi = X[i];
        const yi = y[i];
        const prediction = this.predict(xi);
        const error = prediction - yi;

        for (let j = 0; j < this.weights.length; j++) {
          gradients[j] += error * xi[j];
        }
      }

      for (let j = 0; j < this.weights.length; j++) {
        this.weights[j] -= (this.learningRate * gradients[j]) / m;
      }
    }

    // Calculate training accuracy
    let correct = 0;
    for (let i = 0; i < m; i++) {
      const prediction = this.predict(X[i]) >= 0.5 ? 1 : 0;
      if (prediction === y[i]) {
        correct++;
      }
    }

    return correct / m;
  }

  public getWeights(): number[] {
    return this.weights;
  }
}

/**
 * Extracts features for a grievance report.
 */
export function extractFeatures(
  category: string,
  region: string,
  createdAt: Date,
  backlogCount: number,
  categoryRates: Record<string, number>,
  regionRates: Record<string, number>
): number[] {
  const catRate = categoryRates[category] !== undefined ? categoryRates[category] : 0.5;
  const regRate = regionRates[region] !== undefined ? regionRates[region] : 0.5;
  
  const hour = createdAt.getHours() / 24.0;
  // Normalize backlog (e.g. assume a backlog of 50 is full capacity)
  const normBacklog = Math.min(backlogCount / 50.0, 1.5);

  return [
    1.0,        // Bias intercept
    catRate,    // Category overdue probability
    regRate,    // Region overdue probability
    hour,       // Hour of submission
    normBacklog // Local queue load
  ];
}

/**
 * Loads the trained model weights and metadata from the database.
 * If model doesn't exist, returns default weights.
 */
export async function loadEscalationModel(): Promise<ModelMetadata> {
  try {
    const modelRecord = await prisma.mLModel.findUnique({
      where: { name: "escalation-prediction" },
    });

    if (modelRecord) {
      const metadata = modelRecord.weights as any;
      if (
        metadata &&
        Array.isArray(metadata.weights) &&
        metadata.categoryRates &&
        metadata.regionRates
      ) {
        return {
          weights: metadata.weights,
          categoryRates: metadata.categoryRates,
          regionRates: metadata.regionRates,
          accuracy: modelRecord.accuracy,
        };
      }
    }
  } catch (err) {
    console.warn("Could not load MLModel from DB. Using default heuristics.", err);
  }

  // Fallback defaults
  return {
    weights: [-0.5, 1.2, 0.8, 0.1, 0.5], // heuristic weights
    categoryRates: {},
    regionRates: {},
    accuracy: 0.75,
  };
}

/**
 * Evaluates the risk score [0, 1] for a single report.
 */
export async function predictEscalationRisk(
  category: string,
  region: string,
  createdAt: Date
): Promise<number> {
  const modelData = await loadEscalationModel();
  
  // Count current backlog in the region (unresolved reports)
  let backlogCount = 0;
  try {
    backlogCount = await prisma.grievanceReport.count({
      where: {
        region,
        status: { in: ["SUBMITTED", "UNDER_REVIEW", "ESCALATED"] },
      },
    });
  } catch (err) {
    // Fallback if DB queries fail
    backlogCount = 5;
  }

  const features = extractFeatures(
    category,
    region,
    createdAt,
    backlogCount,
    modelData.categoryRates,
    modelData.regionRates
  );

  const clf = new LogisticRegression(modelData.weights);
  return clf.predict(features);
}
