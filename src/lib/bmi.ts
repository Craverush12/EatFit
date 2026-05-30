export type BMICategory = "underweight" | "normal" | "overweight" | "obese";

export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function getBMICategory(bmi: number): BMICategory {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}

export function computeBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: "male" | "female",
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(gender === "male" ? base + 5 : base - 161);
}

export function computeTDEE(bmr: number): number {
  return Math.round(bmr * 1.375);
}

export function computeTargetCalories(
  tdee: number,
  goal: "lose" | "healthy" | "muscle" | "maintain",
): number {
  if (goal === "lose") return Math.max(1200, tdee - 500);
  if (goal === "muscle") return tdee + 300;
  return tdee;
}

export function computeMacroTargets(
  targetCalories: number,
  weightKg: number,
  goal: "lose" | "healthy" | "muscle" | "maintain",
) {
  const protein = Math.round(goal === "muscle" ? weightKg * 1.6 : weightKg * 1.2);
  const fat = Math.round((targetCalories * 0.28) / 9);
  const carbs = Math.max(0, Math.round((targetCalories - protein * 4 - fat * 9) / 4));
  return { calories: targetCalories, protein, fat, carbs };
}

export function bmiCategoryLabel(category: BMICategory): string {
  return {
    underweight: "Underweight",
    normal: "Healthy weight",
    overweight: "Slightly overweight",
    obese: "Obese",
  }[category];
}

export function bmiCategoryEmoji(category: BMICategory): string {
  return { underweight: "📉", normal: "✅", overweight: "⚠️", obese: "🔴" }[category];
}
