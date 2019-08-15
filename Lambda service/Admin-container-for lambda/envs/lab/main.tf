provider "aws" {
  region = "${var.aws_region}"
}

data "aws_iam_policy_document" "datadog_autotagger" {
  statement {
    actions = [
      "cloudtrail:LookupEvents",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]

    resources = [
      "*",
    ]
  }

  statement {
    actions = [
      "ec2:CreateTags",
      "ec2:Describe*",
    ]

    resources = [
      "*",
    ]
  }

  statement {
    actions = [
      "logs:CreateLogGroup",
    ]

    resources = [
      "*",
    ]
  }
}

resource "aws_iam_policy" "datadog_autotagger_policy" {
  name   = "${var.resource_prefix}.${var.aws_region}datadog-autotagger"
  policy = "${data.aws_iam_policy_document.datadog_autotagger.json}"
}

resource "aws_iam_role" "datadog_autotagger" {
  name = "${var.resource_prefix}.${var.aws_region}datadog-autotagger"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Effect": "Allow"
    }
  ]
}
EOF
}

resource "aws_iam_policy_attachment" "autoupdate_lambda" {
  name       = "${var.resource_prefix}.${var.aws_region}datadog-autotagger"
  roles      = ["${aws_iam_role.datadog_autotagger.name}"]
  policy_arn = "${aws_iam_policy.datadog_autotagger_policy.arn}"
}

resource "aws_kms_key" "datadog_keys" {
  description         = "Master key to encrypt and decrypt datadog keys"
  enable_key_rotation = true
  is_enabled          = true

  tags {
    Name = "${var.resource_prefix}.${var.aws_region}kms-key-datadog"
  }
}

data "aws_kms_ciphertext" "datadogkeys-cipher" {
  key_id = "${aws_kms_key.datadog_keys.key_id}"

  plaintext = <<EOF
{
  "api_key": "${var.datadog_api_key}",
  "app_key": "${var.datadog_app_key}"
}
EOF
}

resource "aws_kms_alias" "datadogkeys-alias" {
  name          = "alias/${var.resource_prefix}datadog-keys-alias"
  target_key_id = "${aws_kms_key.datadog_keys.key_id}"
}

resource "aws_kms_grant" "datadog_keys_grant" {
  name              = "${var.resource_prefix}datadog-autotagger-grant"
  key_id            = "${aws_kms_key.datadog_keys.key_id}"
  grantee_principal = "${aws_iam_role.datadog_autotagger.arn}"
  operations        = ["Encrypt", "Decrypt"]
}

resource "aws_lambda_function" "datadog_autotagger" {
  description = "Function is invoked on all the newly created AWS EC2 instances . The function fetches the required information and creates tags in datadog for specific resource"

  filename         = "/packages/datadog_autotagger_lambdafunction.zip"
  function_name    = "${var.resource_prefix}datadog-autotagger"
  role             = "${aws_iam_role.datadog_autotagger.arn}"
  handler          = "datadog_autotagger_lambdafunction.lambda_handler"
  source_code_hash = "${base64sha256(file("/packages/datadog_autotagger_lambdafunction.zip"))}"
  runtime          = "python3.7"
  timeout          = 80
  kms_key_arn      = "${aws_kms_key.datadog_keys.arn}"

  environment = {
    variables = {
      DATADOG_API_KEY = "${data.aws_kms_ciphertext.datadogkeys-cipher.ciphertext_blob}"
    }
  }

  tags {
    Environment = "${var.environment}"
    Name        = "Datadog-autotagger-ec2"
  }
}

# create cloudwatch event rule
resource "aws_cloudwatch_event_rule" datadog_autotagger {
  name        = "datadog_autotagger_event"
  description = "Trigger lambda when EC2 instances are launched or rebooted"

  event_pattern = <<PATTERN
{
  "source": [
    "aws.ec2"
  ],
  "detail-type": [
    "AWS API Call via CloudTrail"
  ],
  "detail": {
    "eventSource": [
      "ec2.amazonaws.com"
    ],
    "eventName": [
      "RebootInstances",
      "RunInstances"
    ] 
  }
}
PATTERN
}

# invoke lambda when the cloudwatch event rule triggers
resource "aws_cloudwatch_event_target" "invoke-lambda" {
  rule      = "${aws_cloudwatch_event_rule.datadog_autotagger.name}"
  target_id = "InvokeLambda"
  arn       = "${aws_lambda_function.datadog_autotagger.arn}"
}

# permit cloudwatch event rule to invoke lambda
resource "aws_lambda_permission" "lambda_permissions" {
  statement_id  = "AllowExecutionFromCloudWatch"
  action        = "lambda:InvokeFunction"
  function_name = "${aws_lambda_function.datadog_autotagger.function_name}"
  principal     = "events.amazonaws.com"
  source_arn    = "${aws_cloudwatch_event_rule.datadog_autotagger.arn}"
}
