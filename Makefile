.PHONY: requirements
requirements:  ## Install all dependencies for local development
	uv sync --group dev

.PHONY: upgrade
upgrade:  ## Update uv.lock with latest packages satisfying pyproject.toml constraints
	uv run --with edx-lint edx_lint write_uv_constraints pyproject.toml
	uv lock --upgrade

.PHONY: quality
quality:  ## Run code quality checks
	uv run --group quality pycodestyle src/invideoquiz/
	uv run --group quality pylint src/invideoquiz/

.PHONY: test
test:  ## Run tests
	uv run --group test pytest

.PHONY: coverage
coverage:  ## Run tests with coverage
	uv run --group test coverage run -m pytest
