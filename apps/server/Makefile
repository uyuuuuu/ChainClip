VENV := .venv
PYTHON := $(VENV)\Scripts\python.exe
IMAGE := asia-northeast1-docker.pkg.dev/hmi2026/chainclip/api:latest
SERVICE := chainclip-api
REGION := asia-northeast1

.PHONY: freeze run install install-dev activate deactivate migration migrate downgrade build push deploy test test-unit test-db-up test-db-down

freeze:
	$(PYTHON) -m pip freeze > requirements.txt

run:
	$(PYTHON) -m uvicorn app.main:app --reload

install:
	$(PYTHON) -m pip install -r requirements.txt

install-dev:
	$(PYTHON) -m pip install -r requirements-dev.txt

# 手動でvenvを有効化したい時の案内(makeコマンド自体はvenvのpythonを直接指定するので有効化不要)
activate:
	@echo "$(VENV)\Scripts\activate"

deactivate:
	@echo "deactivate"

# 使い方: make migration m="add foo column"
migration:
	$(PYTHON) -m alembic revision --autogenerate -m "$(m)"

migrate:
	$(PYTHON) -m alembic upgrade head

downgrade:
	$(PYTHON) -m alembic downgrade -1

# docker desktopを起動した状態で実行すること
build:
	docker build -t $(IMAGE) .

push:
	docker push $(IMAGE)

deploy: build push
	gcloud run deploy $(SERVICE) --image $(IMAGE) --region $(REGION)

# usecase層のみ。DB不要で高速
test-unit:
	$(PYTHON) -m pytest tests/usecase

# repository層のテスト用postgresをdocker composeで起動
test-db-up:
	docker compose -f docker-compose.test.yml up -d

test-db-down:
	docker compose -f docker-compose.test.yml down

# usecase層+repository層。事前に test-db-up が必要
test: test-db-up
	$(PYTHON) -m pytest
