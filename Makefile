.PHONY: setup test lint build dev-api dev-worker

setup:
	@echo "=== Flutter SDKs ==="
	cd sdks && flutter pub get && dart run melos bootstrap
	@echo "=== SRS ==="
	cd srs && pnpm install

test:
	cd sdks && melos run test
	cd srs && pnpm run test

lint:
	cd sdks && melos run analyze
	cd srs && pnpm run lint

build:
	cd sdks && melos run build
	cd srs && pnpm run build

dev-api:
	cd srs && pnpm run dev:api

dev-worker:
	cd srs && pnpm run dev:worker
