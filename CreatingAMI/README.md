# Description
This script is used to take a disk image in VMDK format, upload it into Amazon Web Services (AWS) and create an AMI that can be used to launch virtual machine instances.  This script uses node.js and the AWS javascript SDK to interact with AWS.  Note that this process is not fast as we are dealing with very large files.
 
 To convert a VMDK disk into an AMI the following things have to be done:
 - Upload the VMDK into an S3 Bucket.  This can take a while as the file is large.
 - Create a manifest file pointing at the uploaded VMDK and providing metadata about the intended disk volume
 - Upload the manifest file to an S3 Bucket
 - Make a request to AWS to begin importing the manifest file into an EBS volume.  This will take a while.
 - Make a snapshot of the new EBS volume.  This will take a while.
 - Register the snapshot as an AMI.
 - Copy the AMI to all of the Amazon regions.

This script does all of these steps for you.  Without this script, steps 1-4 could be initiated with the ec2-import-volume command.  You  would have to then run ec2-describe-conversion-tasks repeatedly to determine when the import of the volume was complete.  The ec2-create-snapshot could then be run to start the snapshot process and ec2-describe-snapshots could be run repeatedly to determine when the snapshot had completed.  Finally, the ec2-register command could be run to register the AMI.

This script requires three parameters to be passed in.  The first is the name of the vmdk file to use. The second parameter is the volume size.  This is the size of the disk that will be created in AWS.The vmdk file is a compressed disk image so it is hard for this script to know what the full disk size should be.  The last parameter is the software label used to make the vmdk.  This is
used to put reasonable names and descriptions on the objects in AWS.
