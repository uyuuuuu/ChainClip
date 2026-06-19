PYTHON := .\.venv\Scripts\python.exe

.PHONY: freeze run

freeze:
	$(PYTHON) -m pip freeze > requirements.txt

run:
	$(PYTHON) -m uvicorn app.main:app --reload
