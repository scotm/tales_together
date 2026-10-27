.PHONY: check check-frontend check-backend

check: check-frontend check-backend

check-frontend:
	cd frontend && npm run check

check-backend:
	cd backend && uv run ruff check . \
		&& uv run ruff format --check . \
		&& uv run mypy . \
		&& uv run pytest --cov
