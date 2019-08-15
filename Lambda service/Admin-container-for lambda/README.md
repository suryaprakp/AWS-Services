
This project autotags ec2 resources on startup and reboots . Tags which are associated are : <br />

 {"subnet-id,"subnet-name","vpc-id:","vpc-name","key-name","hypervisor","virtualization-type","ebs-optimized","ena-enabled","tenancy","mgmt-ip","iamuser"} 

 # Containerizing 

 We have containarised the builidng / execution of AWS API's and terraform so that all the dependencies are taken care also securing credentials in the environment 
 
 Usage:
 - start the admin container ./admin-container.sh envs/lab
 - after logging into the container, use admin_terraform_plan to see changes to your infrastructure
 - use admin_terraform_apply to apply changes to your infre
 
# Lambda trigger flow
Cloudwatch events --> lambda function --> Request KMS to decrypt Datadog API keys --> Authenticate to Datadog API --> Post request to Datadog resources

# Terraform
Using terraform to encrypt Datadog API key with KMS key and passing the encoded data to lambda via environment variables 
https://www.terraform.io/docs/providers/aws/r/kms_ciphertext.html

# How to update the AWS Lambda function source code
If you make changes to the lambda function source code, you must
ensure
- change the script both in existing_instances src file ( which runs on existing resources / instances ) and lambda function code for future instances 
- To also run `make` in this directory
- Change the required version of datadog Library to package 
- All the packages are zipped and placed in folder

is packaged as a "AWS Lambda Deployment Package" <br />
https://docs.aws.amazon.com/lambda/latest/dg/lambda-python-how-to-create-deployment-package.html
