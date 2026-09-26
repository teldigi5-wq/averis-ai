.PHONY: api-test api-dev web-dev infra-up infra-down

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
