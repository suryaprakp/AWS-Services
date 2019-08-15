SHELL := /bin/bash
.SUFFIXES:
.PHONY: clean docker-image
.DEFAULT_GOAL := docker-image

CONTAINER_TAG ?= datadog-autotagger-lambda

docker-image: Dockerfile
	docker build --rm -t $(CONTAINER_TAG) -f Dockerfile .