from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path


ROOT = Path(__file__).resolve().parent
DEFAULT_OUT = ROOT / "data" / "synthetic_meal_decisions.csv"

ACTIONS = [
    "home_high_protein",
    "eat_out_controlled",
    "meal_prep",
    "snack_recovery",
    "vegetarian_meal",
    "sweet_treat",
]

BUDGET_STYLES = ["strict", "balanced", "comfort", "emotional"]
GOALS = ["fat_loss", "muscle_gain", "maintain", "healthy_eating"]


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def choose_goals(rng: random.Random) -> dict[str, int]:
    fat_loss = int(rng.random() < 0.38)
    muscle_gain = int(rng.random() < 0.36)
    maintain = int(rng.random() < 0.28 and not fat_loss)
    healthy_eating = int(rng.random() < 0.58)
    if fat_loss == 0 and muscle_gain == 0 and maintain == 0 and healthy_eating == 0:
        healthy_eating = 1
    return {
        "goal_fat_loss": fat_loss,
        "goal_muscle_gain": muscle_gain,
        "goal_maintain": maintain,
        "goal_healthy_eating": healthy_eating,
    }


def policy_score(row: dict[str, float | int | str]) -> float:
    action = str(row["action"])
    budget_ratio = float(row["food_remaining_per_day"]) / max(float(row["planned_food_per_day"]), 1.0)
    budget_fit = clamp(budget_ratio, 0.0, 1.35)
    convenience = float(row["convenience_need"])
    vegetarian_day = int(row["vegetarian_day"])
    budget_style = str(row["budget_style"])
    fat_loss = int(row["goal_fat_loss"])
    muscle_gain = int(row["goal_muscle_gain"])
    healthy = int(row["goal_healthy_eating"])
    training = float(row["training_frequency"])
    sleep_quality = float(row["sleep_quality_score"])
    injury_risk = int(row["injury_risk"])
    time_pressure = float(row["time_pressure"])
    stress_risk = int(row["stress_risk"])
    budget_pressure = int(row["budget_pressure"])
    high_protein = int(row["high_protein_preference"])
    vegetarian_preference = int(row["vegetarian_preference"])

    score = 0.45

    if budget_fit < 0.65:
        score -= 0.28
    elif budget_fit > 1.05:
        score += 0.12

    if budget_style == "strict":
        score += 0.08 if action in {"home_high_protein", "meal_prep", "vegetarian_meal"} else -0.16
    elif budget_style == "balanced":
        score += 0.04 if action != "sweet_treat" else -0.08
    elif budget_style == "comfort":
        score += 0.05 if action in {"eat_out_controlled", "snack_recovery"} else 0.0
    else:
        score += 0.08 if action in {"eat_out_controlled", "sweet_treat"} else -0.04

    if budget_pressure:
        score += 0.12 if action in {"home_high_protein", "meal_prep", "vegetarian_meal"} else -0.18

    if fat_loss:
        score += 0.18 if action in {"home_high_protein", "meal_prep", "vegetarian_meal"} else -0.16
    if muscle_gain:
        score += 0.2 if action in {"home_high_protein", "meal_prep", "snack_recovery"} else -0.06
    if healthy:
        score += 0.12 if action in {"home_high_protein", "meal_prep", "vegetarian_meal"} else -0.04
    if high_protein:
        score += 0.16 if action in {"home_high_protein", "meal_prep", "snack_recovery"} else -0.06

    if training >= 3:
        score += 0.12 if action in {"home_high_protein", "snack_recovery", "meal_prep"} else 0.0

    convenience = max(convenience, time_pressure)
    if convenience > 0.7:
        score += 0.14 if action in {"eat_out_controlled", "meal_prep", "snack_recovery"} else -0.08
    elif convenience < 0.35:
        score += 0.08 if action in {"home_high_protein", "meal_prep"} else -0.04

    if vegetarian_day or vegetarian_preference:
        score += 0.28 if action == "vegetarian_meal" else -0.04

    if sleep_quality < 0.35 or stress_risk:
        score += 0.12 if action in {"snack_recovery", "meal_prep"} else -0.04
    if injury_risk:
        score += 0.08 if action in {"home_high_protein", "meal_prep", "snack_recovery"} else -0.04

    if action == "sweet_treat":
        score -= 0.22
        if budget_fit > 1.15 and budget_style in {"comfort", "emotional"}:
            score += 0.15
        if stress_risk or budget_pressure or fat_loss:
            score -= 0.1

    if action == "eat_out_controlled" and budget_fit < 0.85:
        score -= 0.18

    return clamp(score, 0.02, 0.98)


def make_context(rng: random.Random) -> dict[str, float | int | str]:
    monthly_income = rng.choice([5_000_000, 7_000_000, 9_000_000, 12_000_000, 18_000_000, 28_000_000, 45_000_000])
    food_budget_ratio = rng.uniform(0.18, 0.48)
    food_monthly_budget = monthly_income * food_budget_ratio
    days_left = rng.randint(1, 31)
    days_in_month = rng.choice([28, 29, 30, 31])
    spent_ratio = rng.betavariate(1.4, 2.2)
    food_remaining = max(0.0, food_monthly_budget * (1 - spent_ratio))
    planned_food_per_day = food_monthly_budget / days_in_month
    food_remaining_per_day = food_remaining / days_left
    tdee = rng.randint(1550, 3100)
    training_frequency = rng.choice([0, 1, 2, 3, 4, 5, 6])
    budget_style = rng.choice(BUDGET_STYLES)
    convenience_need = rng.random()
    vegetarian_day = int(rng.random() < 0.08)
    goals = choose_goals(rng)
    sleep_quality_score = rng.choice([0.15, 0.25, 0.5, 0.78, 0.92])
    injury_risk = int(rng.random() < 0.18)
    time_pressure = clamp(rng.betavariate(1.4, 1.8), 0.0, 1.0)
    stress_risk = int(rng.random() < (0.34 if time_pressure > 0.65 or sleep_quality_score < 0.35 else 0.16))
    budget_pressure = int(budget_style == "strict" or food_budget_ratio < 0.26 or rng.random() < 0.16)
    high_protein_preference = int(goals["goal_muscle_gain"] or goals["goal_fat_loss"] or rng.random() < 0.22)
    vegetarian_preference = int(rng.random() < 0.16)

    return {
        "monthly_income": round(monthly_income, 2),
        "food_monthly_budget": round(food_monthly_budget, 2),
        "food_remaining": round(food_remaining, 2),
        "days_left": days_left,
        "days_in_month": days_in_month,
        "planned_food_per_day": round(planned_food_per_day, 2),
        "food_remaining_per_day": round(food_remaining_per_day, 2),
        "tdee": tdee,
        "training_frequency": training_frequency,
        "budget_style": budget_style,
        "convenience_need": round(convenience_need, 4),
        "vegetarian_day": vegetarian_day,
        **goals,
        "sleep_quality_score": sleep_quality_score,
        "injury_risk": injury_risk,
        "time_pressure": round(time_pressure, 4),
        "stress_risk": stress_risk,
        "budget_pressure": budget_pressure,
        "high_protein_preference": high_protein_preference,
        "vegetarian_preference": vegetarian_preference,
    }


def generate(rows: int, seed: int, out_path: Path) -> None:
    rng = random.Random(seed)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "monthly_income",
        "food_monthly_budget",
        "food_remaining",
        "days_left",
        "days_in_month",
        "planned_food_per_day",
        "food_remaining_per_day",
        "tdee",
        "training_frequency",
        "budget_style",
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
        "action",
        "policy_score",
        "label",
    ]
    with out_path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for _ in range(rows):
            context = make_context(rng)
            for action in ACTIONS:
                row = {**context, "action": action}
                score = policy_score(row)
                label = int(score >= 0.62)
                writer.writerow({**row, "policy_score": round(score, 4), "label": label})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=3000, help="Number of contexts. Total CSV rows = contexts * actions.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    generate(args.rows, args.seed, args.out)
    print(f"generated {args.rows * len(ACTIONS)} rows -> {args.out}")


if __name__ == "__main__":
    main()
