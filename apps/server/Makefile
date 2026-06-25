PYTHON := python
VENV := .venv

.PHONY: freeze run install activate deactivate migration migrate downgrade

freeze:
	$(PYTHON) -m pip freeze > requirements.txt

run:
	$(PYTHON) -m uvicorn app.main:app --reload

install:
	$(PYTHON) -m pip install -r requirements.txt

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
