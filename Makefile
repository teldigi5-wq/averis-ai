.PHONY: api-test api-dev web-dev infra-up infra-down ai-smoke ai-benchmark

api-test:
	cd services/api && pytest -q

api-dev:
	cd services/api && uvicorn app.main:app --reload --port 8000

web-dev:
	cd apps/web && npm run dev

infra-up:
	docker compose up -d

infra-down:
	docker compose down

ai-smoke:
	cd services/api && python scripts/certify_ollama.py --check-coach

ai-benchmark:
	@test -n "$(CALIBRATION_DATASET)" || (echo "Set CALIBRATION_DATASET=/path/to/calibration.jsonl" && exit 2)
	@test -n "$(HOLDOUT_DATASET)" || (echo "Set HOLDOUT_DATASET=/path/to/holdout.jsonl" && exit 2)
	cd services/api && python scripts/benchmark_semantic.py "$(CALIBRATION_DATASET)" "$(HOLDOUT_DATASET)" --progress
