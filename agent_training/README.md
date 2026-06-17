# MagerLife Agent Training

This folder is the first lightweight training pipeline for the MagerLife decision agents.

The goal is not to train a language model. The goal is to train a small base decision model from policy-generated synthetic data, then later combine it with real user feedback.

## Pipeline

1. Generate synthetic meal decision data from controlled business rules.
2. Train a small logistic model that scores whether a meal action should be recommended.
3. Export the model as JSON.
4. The app can later load the JSON model and combine it with per-user preference weights.
5. Real user events can be logged and used to retrain the base model periodically.

The current app also extracts lightweight profile signals from onboarding "Khác" text. This is rule-based extraction, not LLM fine-tuning. The extracted signals are fed into the model context as numeric features.

## Files

- `generate_synthetic_data.py`: creates synthetic examples for meal decisions.
- `train_meal_model.py`: trains a lightweight logistic regression model without external ML dependencies.
- `score_example.py`: loads the exported JSON model and scores a sample user context.
- `run_training.py`: runs generation + training in one command.
- `data/`: generated CSV data.
- `models/`: exported model JSON.

## Run

```bash
python agent_training/run_training.py
python agent_training/score_example.py
```

Or run each step:

```bash
python agent_training/generate_synthetic_data.py --rows 3000
python agent_training/train_meal_model.py
```

## Model idea

The model scores candidate actions such as:

- `home_high_protein`
- `eat_out_controlled`
- `meal_prep`
- `snack_recovery`
- `vegetarian_meal`
- `sweet_treat`

Current feature groups:

- Budget: income, monthly food budget, remaining food budget, budget pressure.
- Calendar: days left in month, planned food per day, vegetarian day.
- Health: TDEE, fat-loss goal, muscle-gain goal, maintain goal, healthy-eating goal.
- Lifestyle: training frequency, sleep quality, stress risk, injury risk, time pressure.
- Personalization: high-protein preference, vegetarian preference, convenience need.

Example:

```txt
context + candidate action -> recommend probability
```

The current labels come from policy rules. Later, real feedback events should be mixed in:

```txt
synthetic data -> base model
real user events -> retrain base model
per-user feedback -> personal weights
```
