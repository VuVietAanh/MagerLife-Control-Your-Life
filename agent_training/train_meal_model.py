from __future__ import annotations

import argparse
import csv
import json
import math
import random
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_DATA = ROOT / "data" / "synthetic_meal_decisions.csv"
DEFAULT_MODEL = ROOT / "models" / "meal_decision_model.json"

NUMERIC_FEATURES = [
    "monthly_income",
    "food_monthly_budget",
    "food_remaining",
    "days_left",
    "days_in_month",
    "planned_food_per_day",
    "food_remaining_per_day",
    "tdee",
    "training_frequency",
    "convenience_need",
    "vegetarian_day",
    "goal_fat_loss",
    "goal_muscle_gain",
    "goal_maintain",
    "goal_healthy_eating",
    "sleep_quality_score",
    "injury_risk",
    "time_pressure",
    "stress_risk",
    "budget_pressure",
    "high_protein_preference",
    "vegetarian_preference",
]

BUDGET_STYLES = ["strict", "balanced", "comfort", "emotional"]
ACTIONS = [
    "home_high_protein",
    "eat_out_controlled",
    "meal_prep",
    "snack_recovery",
    "vegetarian_meal",
    "sweet_treat",
]


def sigmoid(value: float) -> float:
    if value < -35:
        return 0.0
    if value > 35:
        return 1.0
    return 1 / (1 + math.exp(-value))


def load_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", newline="", encoding="utf-8") as file:
        return list(csv.DictReader(file))


def build_feature_names() -> list[str]:
    names = list(NUMERIC_FEATURES)
    names += [f"budget_style={item}" for item in BUDGET_STYLES]
    names += [f"action={item}" for item in ACTIONS]
    names += [
        "budget_ratio",
        "food_budget_income_ratio",
        "remaining_month_ratio",
        "high_training",
        "low_budget_pressure",
        "sleep_recovery_need",
        "personalization_pressure",
    ]
    return names


def raw_features(row: dict[str, str], names: list[str]) -> list[float]:
    values: dict[str, float] = {}
    for feature in NUMERIC_FEATURES:
        values[feature] = float(row[feature])

    for style in BUDGET_STYLES:
        values[f"budget_style={style}"] = 1.0 if row["budget_style"] == style else 0.0
    for action in ACTIONS:
        values[f"action={action}"] = 1.0 if row["action"] == action else 0.0

    planned = max(float(row["planned_food_per_day"]), 1.0)
    remaining_day = float(row["food_remaining_per_day"])
    monthly_income = max(float(row["monthly_income"]), 1.0)
    food_budget = float(row["food_monthly_budget"])
    days_left = max(float(row["days_left"]), 1.0)
    days_in_month = max(float(row["days_in_month"]), 1.0)

    values["budget_ratio"] = remaining_day / planned
    values["food_budget_income_ratio"] = food_budget / monthly_income
    values["remaining_month_ratio"] = days_left / days_in_month
    values["high_training"] = 1.0 if float(row["training_frequency"]) >= 3 else 0.0
    values["low_budget_pressure"] = 1.0 if remaining_day < planned * 0.75 else 0.0
    values["sleep_recovery_need"] = 1.0 if float(row["sleep_quality_score"]) < 0.35 or float(row["stress_risk"]) > 0 else 0.0
    values["personalization_pressure"] = (
        float(row["time_pressure"])
        + float(row["budget_pressure"])
        + float(row["injury_risk"])
        + float(row["vegetarian_preference"])
        + float(row["high_protein_preference"])
    ) / 5
    return [values[name] for name in names]


def mean_std(matrix: list[list[float]]) -> tuple[list[float], list[float]]:
    columns = len(matrix[0])
    means: list[float] = []
    stds: list[float] = []
    for index in range(columns):
        col = [row[index] for row in matrix]
        mean = sum(col) / len(col)
        variance = sum((value - mean) ** 2 for value in col) / len(col)
        std = math.sqrt(variance) or 1.0
        means.append(mean)
        stds.append(std)
    return means, stds


def normalize(matrix: list[list[float]], means: list[float], stds: list[float]) -> list[list[float]]:
    return [[(value - means[index]) / stds[index] for index, value in enumerate(row)] for row in matrix]


def train_logistic(
    x_train: list[list[float]],
    y_train: list[int],
    epochs: int,
    learning_rate: float,
    l2: float,
    seed: int,
) -> tuple[list[float], float]:
    rng = random.Random(seed)
    weights = [0.0 for _ in x_train[0]]
    bias = 0.0
    indices = list(range(len(x_train)))

    for _ in range(epochs):
        rng.shuffle(indices)
        for row_index in indices:
            row = x_train[row_index]
            label = y_train[row_index]
            prediction = sigmoid(sum(w * x for w, x in zip(weights, row)) + bias)
            error = prediction - label
            for feature_index, value in enumerate(row):
                weights[feature_index] -= learning_rate * (error * value + l2 * weights[feature_index])
            bias -= learning_rate * error
    return weights, bias


def evaluate(x_test: list[list[float]], y_test: list[int], weights: list[float], bias: float) -> dict[str, float]:
    tp = tn = fp = fn = 0
    losses = []
    for row, label in zip(x_test, y_test):
        probability = sigmoid(sum(w * x for w, x in zip(weights, row)) + bias)
        prediction = int(probability >= 0.5)
        losses.append(-(label * math.log(max(probability, 1e-8)) + (1 - label) * math.log(max(1 - probability, 1e-8))))
        if prediction == 1 and label == 1:
            tp += 1
        elif prediction == 0 and label == 0:
            tn += 1
        elif prediction == 1 and label == 0:
            fp += 1
        else:
            fn += 1
    total = max(tp + tn + fp + fn, 1)
    precision = tp / max(tp + fp, 1)
    recall = tp / max(tp + fn, 1)
    f1 = 2 * precision * recall / max(precision + recall, 1e-8)
    return {
        "accuracy": round((tp + tn) / total, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "log_loss": round(sum(losses) / len(losses), 4),
    }


def train(data_path: Path, model_path: Path, epochs: int, learning_rate: float, seed: int) -> dict[str, object]:
    rows = load_rows(data_path)
    rng = random.Random(seed)
    rng.shuffle(rows)

    feature_names = build_feature_names()
    x_raw = [raw_features(row, feature_names) for row in rows]
    y = [int(row["label"]) for row in rows]
    split = int(len(rows) * 0.82)
    x_train_raw, x_test_raw = x_raw[:split], x_raw[split:]
    y_train, y_test = y[:split], y[split:]

    means, stds = mean_std(x_train_raw)
    x_train = normalize(x_train_raw, means, stds)
    x_test = normalize(x_test_raw, means, stds)
    weights, bias = train_logistic(x_train, y_train, epochs, learning_rate, l2=0.0005, seed=seed)
    metrics = evaluate(x_test, y_test, weights, bias)

    model = {
        "model_name": "magerlife_meal_decision_v1",
        "model_type": "logistic_regression",
        "trained_on": "policy_generated_synthetic_data",
        "feature_names": feature_names,
        "means": means,
        "stds": stds,
        "weights": weights,
        "bias": bias,
        "threshold": 0.5,
        "actions": ACTIONS,
        "budget_styles": BUDGET_STYLES,
        "metrics": metrics,
        "notes": [
            "Base model only. Do not treat it as personalized intelligence.",
            "Personal weights should adapt per user from interaction events.",
            "Retrain this model periodically when real feedback data is available.",
        ],
    }
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.write_text(json.dumps(model, ensure_ascii=False, indent=2), encoding="utf-8")
    return model


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA)
    parser.add_argument("--out", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=0.02)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()
    model = train(args.data, args.out, args.epochs, args.learning_rate, args.seed)
    print(f"trained -> {args.out}")
    print(json.dumps(model["metrics"], indent=2))


if __name__ == "__main__":
    main()
