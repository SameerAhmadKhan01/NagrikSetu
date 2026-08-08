import { describe, it, expect } from "vitest";
import { LogisticRegression } from "../modules/escalation/model.js";

describe("ML Escalation Classifier - Logistic Regression Engine", () => {
  it("should train and converge on simple separable data", () => {
    const clf = new LogisticRegression();

    // Features: [1.0 (bias), category_rate, region_rate, normalized_hour, normalized_backlog]
    // Let's create a dataset where high region_rate and high backlog guarantee overdue (label 1)
    const X = [
      [1.0, 0.1, 0.2, 0.3, 0.1], // low values -> not overdue (0)
      [1.0, 0.2, 0.1, 0.4, 0.2], // low values -> not overdue (0)
      [1.0, 0.9, 0.8, 0.5, 0.9], // high values -> overdue (1)
      [1.0, 0.8, 0.9, 0.6, 0.8], // high values -> overdue (1)
      [1.0, 0.15, 0.18, 0.2, 0.15], // low values -> not overdue (0)
      [1.0, 0.85, 0.88, 0.45, 0.85], // high values -> overdue (1)
    ];

    const y = [0, 0, 1, 1, 0, 1];

    // Train
    const accuracy = clf.train(X, y);

    // Verify training convergence (should be high accuracy, e.g. 100% on this simple set)
    expect(accuracy).toBeGreaterThanOrEqual(0.8);

    // Run prediction on low risk
    const lowRiskProb = clf.predict([1.0, 0.1, 0.1, 0.3, 0.1]);
    expect(lowRiskProb).toBeLessThan(0.5);

    // Run prediction on high risk
    const highRiskProb = clf.predict([1.0, 0.9, 0.9, 0.5, 0.9]);
    expect(highRiskProb).toBeGreaterThanOrEqual(0.5);
  });
});
