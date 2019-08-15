.SUFFIXES:
.PHONY: clean default
.DEFAULT_GOAL := default

GIT_REV := $(shell git rev-parse --short HEAD)

ifneq ($(BUILD_NUMBER),)
BUILD_NUMBER_TAG=-$(BUILD_NUMBER)
else
BUILD_NUMBER_TAG=
endif

SOURCES := src/datadog_autotagger_lambdafunction.py
DATADOG_CURRENT_LIB_VERSION := 0_28_0
DATADOG_PACKAGE := datadog_library_v_$(DATADOG_CURRENT_LIB_VERSION)/datadog_library.zip
LAMBDA_PACKAGE := packages/datadog_autotagger_lambdafunction-$(GIT_REV)$(BUILD_NUMBER_TAG).zip

clean:
	$(RM) -r packages/

packages :
	mkdir -p $@

$(LAMBDA_PACKAGE): $(SOURCES) | packages
	cd src && zip  -g $(abspath $(DATADOG_PACKAGE)) $(notdir $(SOURCES)) && cp $(abspath $(DATADOG_PACKAGE)) $(abspath $(LAMBDA_PACKAGE))

default: $(LAMBDA_PACKAGE)