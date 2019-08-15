variable "resource_prefix" {
  type        = "string"
  description = "prefix for all the resources"
}

variable "environment" {
  type        = "string"
  description = "environment name (lab or prod)"
}

variable "aws_region" {
  type        = "string"
  description = "aws region name"
}

variable "datadog_app_key" {
  type        = "string"
  description = "datadog app key"
}

variable "datadog_api_key" {
  type        = "string"
  description = "datadog api key"
}
