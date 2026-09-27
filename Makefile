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
	@test -n "$(DATASET)" || (echo "Set DATASET=/path/to/labeled-pairs.jsonl" && exit 2)
	cd services/api && python scripts/benchmark_semantic.py "$(DATASET)" --progress
