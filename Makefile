# LangChain docs agent — Makefile (patterns adapted from caire-backend)

.PHONY: help format lint dev dev-all sync lock clean \
	pre-commit pre-commit-install pre-commit-update \
	frontend-dev frontend-install

.DEFAULT_GOAL := help

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

format: ## Format code with ruff and fix imports
	uv run ruff format langchain_docs_agent
	uv run ruff check --select I --fix langchain_docs_agent

lint: ## Run linting and type checking
	uv run ruff check langchain_docs_agent
	uv run ruff format langchain_docs_agent --diff
	uv run mypy langchain_docs_agent

dev: ## Run LangGraph dev server (needs .env with REDIS_URL and API keys)
	uv run langgraph dev --n-jobs-per-worker 20

dev-all: ## Run Agent Server + Vite UI together (same as ./scripts/dev-all.sh)
	./scripts/dev-all.sh

frontend-dev: ## Run Vite React UI (proxies /langgraph → localhost:2024; start `make dev` in another terminal)
	cd frontend && npm run dev

frontend-install: ## npm install for frontend/
	cd frontend && npm install

sync: ## Install dependencies from uv.lock
	uv sync --all-groups

lock: ## Refresh uv.lock from pyproject.toml
	uv lock

clean: ## Remove caches and build artifacts
	rm -rf htmlcov .mypy_cache .ruff_cache
	rm -f .coverage
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

pre-commit-install: ## Install pre-commit hooks
	uv run pre-commit install

pre-commit: ## Run pre-commit on all files
	uv run pre-commit run --all-files

pre-commit-update: ## Update pre-commit hooks
	uv run pre-commit autoupdate
