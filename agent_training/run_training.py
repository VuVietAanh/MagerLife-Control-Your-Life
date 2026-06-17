from __future__ import annotations

from pathlib import Path

from generate_synthetic_data import generate
from train_meal_model import train


ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "synthetic_meal_decisions.csv"
MODEL_PATH = ROOT / "models" / "meal_decision_model.json"


def main() -> None:
    generate(rows=3000, seed=42, out_path=DATA_PATH)
    model = train(DATA_PATH, MODEL_PATH, epochs=8, learning_rate=0.02, seed=7)
    print(f"data: {DATA_PATH}")
    print(f"model: {MODEL_PATH}")
    print(f"metrics: {model['metrics']}")


if __name__ == "__main__":
    main()
