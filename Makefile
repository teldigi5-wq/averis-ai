.PHONY: api-test api-dev web-dev infra-up infra-down ai-smoke ai-benchmark ai-academic-eval

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
	cd services/api && python -m scripts.certify_ollama --check-coach

ai-benchmark:
	@test -n "$(CALIBRATION_DATASET)" || (echo "Set CALIBRATION_DATASET=/path/to/calibration.jsonl" && exit 2)
	@test -n "$(HOLDOUT_DATASET)" || (echo "Set HOLDOUT_DATASET=/path/to/holdout.jsonl" && exit 2)
	cd services/api && python -m scripts.benchmark_semantic "$(CALIBRATION_DATASET)" "$(HOLDOUT_DATASET)" --progress

ai-academic-eval:
	@test -n "$(MANIFEST)" || (echo "Set MANIFEST=/path/to/academic-evaluation-manifest.json" && exit 2)
	@test -n "$(CALIBRATION_DATASET)" || (echo "Set CALIBRATION_DATASET=/path/to/calibration.jsonl" && exit 2)
	@test -n "$(HOLDOUT_DATASET)" || (echo "Set HOLDOUT_DATASET=/path/to/holdout.jsonl" && exit 2)
	cd services/api && python -m scripts.evaluate_academic_semantic \
		"$(MANIFEST)" \
		"$(CALIBRATION_DATASET)" \
		"$(HOLDOUT_DATASET)" \
		--embedding-model "$(or $(EMBEDDING_MODEL),nomic-embed-text)" \
		--progress
