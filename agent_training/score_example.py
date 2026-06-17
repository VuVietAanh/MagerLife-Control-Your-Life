from __future__ import annotations

import json
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "models" / "meal_decision_model.json"


def sigmoid(value: float) -> float:
    if value < -35:
        return 0.0
    if value > 35:
        return 1.0
    return 1 / (1 + math.exp(-value))


def build_features(context: dict[str, float | int | str], action: str, model: dict[str, object]) -> list[float]:
    feature_names = list(model["feature_names"])
    values: dict[str, float] = {}
    for name in feature_names:
        values[name] = 0.0

    for key, value in context.items():
        if key in values:
            values[key] = float(value)

    values[f"budget_style={context['budget_style']}"] = 1.0
    values[f"action={action}"] = 1.0

    planned = max(float(context["planned_food_per_day"]), 1.0)
    remaining_day = float(context["food_remaining_per_day"])
    monthly_income = max(float(context["monthly_income"]), 1.0)
    food_budget = float(context["food_monthly_budget"])
    days_left = max(float(context["days_left"]), 1.0)
    days_in_month = max(float(context["days_in_month"]), 1.0)

    values["budget_ratio"] = remaining_day / planned
    values["food_budget_income_ratio"] = food_budget / monthly_income
    values["remaining_month_ratio"] = days_left / days_in_month
    values["high_training"] = 1.0 if float(context["training_frequency"]) >= 3 else 0.0
    values["low_budget_pressure"] = 1.0 if remaining_day < planned * 0.75 else 0.0
    values["sleep_recovery_need"] = 1.0 if float(context["sleep_quality_score"]) < 0.35 or float(context["stress_risk"]) > 0 else 0.0
    values["personalization_pressure"] = (
        float(context["time_pressure"])
        + float(context["budget_pressure"])
        + float(context["injury_risk"])
        + float(context["vegetarian_preference"])
        + float(context["high_protein_preference"])
    ) / 5
    return [values[name] for name in feature_names]


def score_action(context: dict[str, float | int | str], action: str, model: dict[str, object]) -> float:
    raw = build_features(context, action, model)
    means = list(model["means"])
    stds = list(model["stds"])
    weights = list(model["weights"])
    bias = float(model["bias"])
    normalized = [(value - means[index]) / stds[index] for index, value in enumerate(raw)]
    return sigmoid(sum(weight * value for weight, value in zip(weights, normalized)) + bias)


def main() -> None:
    model = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    context = {
        "monthly_income": 9_000_000,
        "food_monthly_budget": 4_000_000,
        "food_remaining": 2_100_000,
        "days_left": 18,
        "days_in_month": 30,
        "planned_food_per_day": 4_000_000 / 30,
        "food_remaining_per_day": 2_100_000 / 18,
        "tdee": 2199,
        "training_frequency": 3,
        "budget_style": "balanced",
        "convenience_need": 0.45,
        "vegetarian_day": 0,
        "goal_fat_loss": 1,
        "goal_muscle_gain": 1,
        "goal_maintain": 0,
        "goal_healthy_eating": 1,
        "sleep_quality_score": 0.5,
        "injury_risk": 0,
        "time_pressure": 0.62,
        "stress_risk": 0,
        "budget_pressure": 1,
        "high_protein_preference": 1,
        "vegetarian_preference": 0,
    }
    scores = [(action, score_action(context, action, model)) for action in model["actions"]]
    for action, score in sorted(scores, key=lambda item: item[1], reverse=True):
        print(f"{action:22s} {score:.3f}")


if __name__ == "__main__":
    main()
