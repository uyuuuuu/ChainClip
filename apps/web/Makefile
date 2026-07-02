.PHONY: install build dev login deploy

install:
	npm install

build:
	npm run build:css

dev: build
	npx wrangler dev

login:
	npx wrangler login

deploy: build
	npx wrangler deploy
