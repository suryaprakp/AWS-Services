#!/usr/bin/env node

var ami_data = new Object();
ami_data.bucket_name = "make_ami_tmp_bucket";
ami_data.import_region = 'cn-north-1';
ami_data.import_availability_zone = 'cn-north-1a';
ami_data.one_region_only = false;
ami_data.model_name = "CBVPX";

/* This option is only useful if you have uploaded a huge image into S3 and then ran into some problem with the script.
 * If this is true, then clearing of the bucket and uploading the image will be skipped.  The manifest will get
 * recreated and the import will resume as normal.
 */
ami_data.assume_already_uploaded = false;

var AWS = require('aws-sdk');

AWS.config.update({region: ami_data.import_region});
var fs = require('fs');
var path = require('path');

/* This data comes from: http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/UserProvidedKernels.html */
ami_data.amazon_region_list = [ 
	{Name: "eu-west-1",      AKI: "aki-52a34525" },
	{Name: "sa-east-1",      AKI: "aki-5553f448" },
	{Name: "us-east-1",      AKI: "aki-919dcaf8" },
	{Name: "ap-northeast-1", AKI: "aki-176bf516" },
	{Name: "us-west-2",      AKI: "aki-fc8f11cc" },
	{Name: "us-west-1",      AKI: "aki-880531cd" },
	{Name: "ap-southeast-1", AKI: "aki-503e7402" },
	{Name: "ap-southeast-2", AKI: "aki-c362fff9" },
	{Name: "eu-central-1",   AKI: "aki-184c7a05" },
	{Name: "us-gov-west-1",  AKI: "aki-1de98d3e" }
];

function get_aki_for_region_name(region_name)
{
	for (var i = 0; i < ami_data.amazon_region_list.length; i++)
	{
		if (ami_data.amazon_region_list[i].Name === region_name)
		{
			return ami_data.amazon_region_list[i].AKI;
		}
	}
	return null;
}

function usage()
{
	return "make_ami.js [-h|--help] -v|--vmdk <vmdk file> -s|--volume-size <volume size in GB> -l|--label <sw label> " +
		"[-m|--model <model name (default " + ami_data.model_name + ")>] " +
		"[-b|--bucket <S3 bucket name (default " + ami_data.bucket_name + ")>] [-o|--one-region-only] [-a|--log-aws-calls <log file name>]";
}

function error_exit(str)
{
	console.log("Error: " + str);
	process.exit(-1);
}

function error_exit_usage(str)
{
	console.log("Error: " + str);
	console.log(usage());
	process.exit(-1);
}


function process_args()
{
	var args = process.argv.slice(2);
	var i;
	for (i = 0; i < args.length; i++)
	{
		switch (args[i])
		{
		case "-h":
		case "--help":
			console.log(usage());
			process.exit(0);
			break;
		case "-v":
		case "--vmdk":
			i++;
			if (i >= args.length)
			{
				error_exit_usage("Missing <vmdk file> argument");
			}
			ami_data.vmdk_file = args[i];
			break;
		case "-s":
		case "--volume-size":
			i++;
			if (i >= args.length)
			{
				error_exit_usage("Missing <volume size in GB> argument");
			}
			ami_data.volume_size = args[i];
			break;
		case "-l":
		case "--label":
			i++;
			if (i >= args.length)
			{
				error_exit_usage("Missing <sw label> argument");
			}
			ami_data.sw_label = args[i];
			break;
		case "-b":
		case "--bucket":
			i++;
			if (i >= args.length)
			{
				error_exit_usage("Missing <S3 bucket name> argument");
			}
			ami_data.bucket_name = args[i];
			break;
		case "-o":
		case "--one-region-only":
			ami_data.one_region_only = true;
			break;
		case "-a":
		case "--log-aws-calls":
			i++;
			if (i >= args.length)
			{
				error_exit_usage("Missing <log file name> argument");
			}
			ami_data.aws_log_file_name = args[i];
			break;
		case "-m":
		case "--model":
			i++;
			if (i >= args.length)
			{
				error_exit_usage("Missing <model> argument");
			}
			ami_data.model_name = args[i];
			break;
		}
	}

	if (!ami_data.vmdk_file)
	{
		error_exit_usage("Missing <vmdk file> argument");
	}

	if (!ami_data.volume_size)
	{
		error_exit_usage("Missing <volume size in GB> argument");
	}

	if (ami_data.volume_size <=0 || ami_data.volume_size > 150)
	{
		error_exit_usage("Invalid <volume size in GB> argument");
	}

	if (!ami_data.sw_label)
	{
		error_exit_usage("Missing <sw label> argument");
	}
}

function delete_object_list(bucket_name, object_list, callback)
{
	if (!object_list.length)
	{
		callback();
		return;
	}

	var object_key = object_list[0].Key;
	var params = {
		Bucket: bucket_name,
		Key: object_key
	};
	console.log("Deleting object " + object_key + " from bucket " + bucket_name);
	s3.deleteObject(params, function(err, data) {
			if (err)
			{
				console.log("Cannot delete object " + object_key + " of bucket " + bucket_name);
				console.log(err);
				process.exit(-1);
			}
			else
			{
				if (object_list.length == 1)
				{
					callback();
				}
				else
				{
					delete_object_list(bucket_name, object_list.slice(1), callback);
				}
			}
	});
}

function delete_all_objects_from_bucket(bucket_name, callback)
{
	var params = {
		Bucket: bucket_name
	};
	s3.listObjects(params, function(err, data) {
				if (err)
				{
					console.log("Cannot list objects of bucket " + bucket_name);
					console.log(err);
					process.exit(-1);
				}
				else
				{
					delete_object_list(bucket_name, data.Contents, callback);
				}
			});
}

function delete_bucket(bucket_name, callback)
{
	console.log("Deleting bucket " + bucket_name);
	var params = { Bucket: bucket_name };
	delete_all_objects_from_bucket(bucket_name, 
			function()
			{
				s3.deleteBucket(params, function(err, data) { 
						if(err)
						{
							console.log(err);
							process.exit(-1);
						}
						else
						{
							callback();
						}
					});
			});
}

function delete_bucket_if_it_exists(bucket_name, callback)
{
	var params = {};
	s3.listBuckets(params, function(err, bucket_list) {
			if (err)
			{
				console.log("Cannot list buckets.\n" + err);
				process.exit(-1);
			}
			else
			{
				var callback_made = 0;
				bucket_list.Buckets.forEach(function(bucket, index, array) {
					if (bucket.Name === bucket_name)
					{
						callback_made = 1;
						delete_bucket(bucket_name, callback);
					}
				});
				if (!callback_made)
				{
					callback();
				}
			}
	});
}

function create_bucket(bucket_name, callback)
{
	var params = {
		Bucket: bucket_name,
		ACL: 'private'
	};
	s3.createBucket(params, function(err, data) {
					if (err) {
						console.log("Cannot create bucket " + bucket_name + "\n" + err);
						process.exit(-1);
					}
					else
					{
						console.log("Created bucket " + bucket_name);
						callback();
					}
	});
}

function setup_bucket(bucket_name, callback)
{
	if (ami_data.assume_already_uploaded)
	{
		callback();
	}
	else
	{
		delete_bucket_if_it_exists(bucket_name, function() { create_bucket(bucket_name, callback) } );
	}
	// create_bucket(bucket_name, callback);
}

function get_signed_url(bucket_name, key_name, operation)
{
	var params = { Bucket: bucket_name, Key: key_name, Expires: 86400};
	var url = s3.getSignedUrl(operation, params);
	return url;
}

function import_vmdk_file()
{
	var url = get_signed_url(ami_data.bucket_name, ami_data.manifest_key, 'getObject');
	console.log("Calling importVolume");
	console.log("Using " + url + " as the signed URL to the manifest");
	var params = {
		AvailabilityZone: ami_data.import_availability_zone,
		Description: 'Volume imported for model ' + ami_data.model_name + 
			' with label ' + ami_data.sw_label + ' by make_ami.js from ' + ami_data.vmdk_file,
		Image: {
			Bytes: ami_data.vmdk_file_stats.size,
			Format: 'VMDK',
			ImportManifestUrl: url
		},
		Volume: { Size: ami_data.volume_size }
	};
	ec2.importVolume(params, function(err, data) {
					if (err)
					{
						console.log("importVolume failed ");
						console.log(err);
						process.exit(-1);
					}
					else
					{
						ami_data.conversion_task_id = data.ConversionTask.ConversionTaskId;
						console.log("importVolume called.  Running conversion task " +
							ami_data.conversion_task_id + " in zone " + ami_data.import_availability_zone);
						upload_vmdk_file_to_s3();
					}
	});
}

function upload_current_block(uploader)
{
	var start_pos = uploader.current_upload_part * uploader.max_block_size;
	var end_pos = start_pos + uploader.max_block_size - 1;
	if (end_pos > uploader.file_stats.size)
	{
		end_pos = uploader.file_stats.size - 1;
	}
	var file_stream = fs.createReadStream(uploader.file_name, {start: start_pos, end: end_pos});
	var params = {
		Bucket: ami_data.bucket_name,
		Key: uploader.file_key_base + "_" + uploader.current_upload_part,
		Body: file_stream,
		//ContentLength: end_pos - start_pos + 1
	};
	console.log("Uploading part " + (uploader.current_upload_part + 1) + " of " + uploader.num_parts_to_upload 
		    + " (bytes " + (start_pos + 1) + "-" + (end_pos + 1) + ") of " + uploader.file_name);

	var start_put_object_time_ms = Date.now();
	var put_request = s3.putObject(params);
	/* This is pretty screwed up, but it works around a bug where the AWS SDK could throw an exception if multiple
	 * network errors happen.  See:
	 * https://github.com/aws/aws-sdk-js/issues/290
	 */
	Object.defineProperty(put_request, '_hardError', {value: false});
	put_request.send(function(err, data) {
		if (err)
		{
			file_stream.close();
			console.log("Upload of part " + (uploader.current_upload_part + 1) + " failed");
			console.log(err);
			uploader.raise_event('Fail');
		}
		else
		{
			var stop_put_object_time_ms = Date.now();
			var put_object_delta_ms = stop_put_object_time_ms - start_put_object_time_ms;
			var bits_transferred = (end_pos - start_pos + 1) * 8;
			var bandwidth_kbps = (bits_transferred / 1000) / (put_object_delta_ms / 1000)
			file_stream.close();
			console.log("Part " + (uploader.current_upload_part + 1) + " (" + (bits_transferred/8) + " bytes) upload complete in " +
				    Math.floor(put_object_delta_ms / 1000) + " seconds (" + Math.floor(bandwidth_kbps) +
				    " kbps)");
			uploader.raise_event('Success');
		}
	});
}

function create_uploader_object(file_name, bucket_name)
{
	var uploader = new Object();
	uploader.percent = 0;
	uploader.max_block_size = 100000000; /* 100MB */

	uploader.file_name = file_name;
	try {
		uploader.file_stats = fs.statSync(uploader.file_name);
		// Make sure the file is readable for us
		var fd = fs.openSync(uploader.file_name, 'r');
		fs.closeSync(fd);
	} catch (err)
	{
		console.log("Error accessing " + uploader.file_name + "\n" + err);
		process.exit(-1);
	}
	uploader.file_base_name = path.basename(file_name);
	uploader.bucket_import_key_base = "import_vmdk_key";
	uploader.manifest_file_name = uploader.file_base_name + "manifest.xml";
	uploader.manifest_key = uploader.bucket_import_key_base + "/" + uploader.manifest_file_name;
	uploader.file_key_base = uploader.bucket_import_key_base + "/" + uploader.file_base_name;
	uploader.bucket_name = bucket_name;
	uploader.num_parts_to_upload = (Math.floor(uploader.file_stats.size / uploader.max_block_size)) +
		( (uploader.file_stats.size % uploader.max_block_size) ? 1 : 0 );
	uploader.current_upload_part = 0;
	uploader.current_state = "Idle";
	uploader.states = [
		{
			'name' : 'Idle',
			'events' : {
				'Start' : function()
				{
					if (ami_data.assume_already_uploaded)
					{
						uploader.current_state = 'UploadManifest';
						uploader.raise_event('Start');
					}
					else
					{
						uploader.current_state = 'Uploading';
						console.log("Starting upload of " + uploader.file_name);
						upload_current_block(uploader);
					}
				}
			}
		},
		{
			'name' : 'Uploading',
			'events' : {
				'Success' : function() {
					if (uploader.current_upload_part == uploader.num_parts_to_upload - 1)
					{
						uploader.raise_event('UploadFileComplete');
					}
					else
					{
						uploader.current_upload_part++;
						uploader.raise_event('UploadNextBlock');
					}
				},
				'Fail' : function() { upload_current_block(uploader); },
				'UploadNextBlock' : function() { upload_current_block(uploader); },
				'UploadFileComplete' : function() {
					uploader.current_state = 'UploadManifest';
					uploader.raise_event('Start');
				}
			}
		},
		{
			'name' : 'UploadManifest',
			'events' : {
				'Start' : function() {
					uploader.upload_manifest_to_s3();
					//var manifest_str = uploader.create_manifest_str();
					//console.log(manifest_str);
				},
				'Fail' : function() { uploader.upload_manifest_to_s3(); },
				'Success' : function() { 
					uploader.current_state = 'AllUploadsComplete';
					uploader.raise_event('Done');
				}
			}
		},
		{
			'name' : 'AllUploadsComplete',
			'events' : {
				'Done' : function() { uploader.callback(); }
			}
		}
	];
	uploader.raise_event = function(ev) {
		//console.log("Raising event " + ev + " while in state " + uploader.current_state);
		for (var i = 0; i < uploader.states.length; i++)
		{
			if (uploader.states[i].name == uploader.current_state)
			{
				if (uploader.states[i].events[ev])
				{
					uploader.states[i].events[ev]();
					return;
				}
				else
				{
					console.trace("Ignoring event " + ev + " while in state " + uploader.current_state);
					return;
				}
			}
		}
	};
	uploader.start = function(cb) { uploader.callback = cb; uploader.raise_event('Start'); };

	uploader.create_manifest_str = function() {
		var manifest_str = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
		manifest_str    += '<manifest>\n';
		manifest_str    += '    <version>2010-11-15</version>\n';
		manifest_str    += '    <file-format>VMDK</file-format>\n';
		manifest_str    += '    <importer>\n';
		manifest_str    += '        <name>ec2-upload-disk-image</name>\n';
		manifest_str    += '        <version>1.0.0</version>\n';
		manifest_str    += '        <release>2010-11-15</release>\n';
		manifest_str    += '    </importer>\n';

		manifest_str    += '    <self-destruct-url>';
		manifest_str    += get_signed_url(this.bucket_name, this.manifest_key, 'getObject').replace(/&/g, "&amp;");
		manifest_str    += '</self-destruct-url>\n';

		manifest_str    += '    <import>\n';
		manifest_str    += '        <size>' + this.file_stats.size + '</size>\n';
		manifest_str    += '        <volume-size>' + ami_data.volume_size + '</volume-size>\n';
		manifest_str    += '        <parts count="' + this.num_parts_to_upload + '">\n';
		for (var i = 0; i < this.num_parts_to_upload; i++)
		{
			var key_file = this.file_key_base + "_" + i;
			manifest_str    += '            <part index="' + i +'">\n';
			var start_pos = i * uploader.max_block_size;
			var end_pos = start_pos + uploader.max_block_size - 1;
			if (end_pos > uploader.file_stats.size)
			{
				end_pos = uploader.file_stats.size - 1;
			}
			manifest_str    += '                <byte-range end="' + end_pos + '" start="' + start_pos + '"/>\n';
			manifest_str    += '                <key>' + key_file + '</key>\n';

			var head_url     = get_signed_url(this.bucket_name, key_file, 'headObject').replace(/&/g, "&amp;");
			var get_url      = get_signed_url(this.bucket_name, key_file, 'getObject').replace(/&/g, "&amp;");
			var delete_url   = get_signed_url(this.bucket_name, key_file, 'deleteObject').replace(/&/g, "&amp;");
			manifest_str    += '                <head-url>'   + head_url   + '</head-url>\n';
			manifest_str    += '                <get-url>'    + get_url    + '</get-url>\n';
			manifest_str    += '                <delete-url>' + delete_url + '</delete-url>\n';

			manifest_str    += '            </part>\n';
		}
		manifest_str    += '        </parts>\n';
		manifest_str    += '    </import>\n';
		manifest_str    += '</manifest>\n';
		return manifest_str;
	};

	uploader.upload_manifest_to_s3 = function() {
		var manifest_contents = this.create_manifest_str();
		console.log("Uploading manifest to " + this.manifest_key);
		var params = {
			Bucket: this.bucket_name,
			Key: this.manifest_key,
			Body: manifest_contents
		};
		s3.putObject(params, function(err, data) {
					if (err)
					{
						console.log("Upload of manifest failed");
						console.log(err);
						uploader.raise_event('Fail');
					}
					else
					{
						console.log("Upload of manifest succeeded");
						uploader.raise_event('Success');
						//wait_for_conversion_task_complete();
					}
		});
	}


	return uploader;
}

function upload_vmdk_file_to_s3()
{
	var s3_uploader = create_uploader_object(ami_data.vmdk_file, ami_data.bucket_name);
	s3_uploader.start(wait_for_conversion_task_complete);
}

function copy_ami_to_all_regions(ami_id, ami_name)
{
	ami_data.amazon_region_list.forEach(function(bucket, index, array) {
		/* Skip the import_region because that is where we made the AMI.  Also skip the us-gov-west-1 region
		 * because our credentials are not valid for that and I don't want the FBI asking us why we are trying
		 * to break into their stuff. */
		if (bucket.Name != ami_data.import_region && bucket.Name != "us-gov-west-1")
		{
			var ec2_region = new AWS.EC2({region: bucket.Name});
			console.log("Copying AMI " + ami_id + " to the " + bucket.Name + " region");
			var params = {
				Name: ami_name,
				SourceImageId: ami_id,
				SourceRegion: ami_data.import_region,
				Description: ami_data.ami_description
			};
			ec2_region.copyImage(params, function(err, data) {
				if (err)
				{
					console.log("Copy of AMI " + ami_id + " to the " + bucket.Name + " region failed");
					console.log(err);
				}
				else
				{
					console.log("Copy of AMI " + ami_id + " to the " + bucket.Name + " region succeeded (" + data.ImageId + ")");
				}
			});
		}
	});
}

function handle_register_image_callback(err, data, ami_name, virtualization_type, snapshot_id)
{
	if (err)
	{
		console.log("Registering " + virtualization_type + " image " + ami_name + " of snapshot " + snapshot_id + " failed");
		console.log(err);
		process.exit(-1);
	}
	else
	{
		var ami_id = data.ImageId;
		console.log("AMI " + ami_name + " registered with ID " + ami_id);
		if (!ami_data.one_region_only)
		{
			copy_ami_to_all_regions(ami_id, ami_name);
		}
	}
}

function register_ami(snapshot_id, virtualization_type, callback)
{
	var virt_str = (virtualization_type == 'paravirtual') ? 'pv' : 'hvm';
	var ami_name = ami_data.model_name + '_' + virt_str + '_' + ami_data.sw_label;
	var block_device_name = (virtualization_type == 'paravirtual') ? '/dev/sda' : '/dev/sda1';
	console.log("Registering a " + virtualization_type + " AMI named " + ami_name + " based on snapshot " + snapshot_id);

	var params = {
		Architecture: 'x86_64',
		RootDeviceName: '/dev/sda1',
		BlockDeviceMappings: [
			{
				DeviceName: block_device_name,
				Ebs: {
					SnapshotId: snapshot_id
				}
			}
		],
		Description: ami_data.ami_description,
		VirtualizationType: virtualization_type,
		Name: ami_name
	};
	if (virtualization_type == 'paravirtual')
	{
		params.KernelId = get_aki_for_region_name(ami_data.import_region);
	}
	ec2.registerImage(params, function(err, data) { callback(err, data, ami_name, virtualization_type, snapshot_id); });
}

function register_amis()
{
	register_ami(ami_data.snapshot_task_id, 'paravirtual', handle_register_image_callback);
	register_ami(ami_data.snapshot_task_id, 'hvm', handle_register_image_callback);
}

function handle_call_check_snapshot(err, data)
{
	if (err)
	{
		console.log("describeSnapshotfailed");
		console.log(err);
	}
	else
	{
		var state = data.Snapshots[0].State;
		if (state != ami_data.last_snapshot_state)
		{
			console.log("Snapshot " + ami_data.snapshot_task_id + ": " + state);
			ami_data.last_snapshot_state = state;
		}
		if (state != "completed")
		{
			ami_data.wait_for_snapshot_timer = setTimeout(call_check_snapshot, 1000);
		}
		else
		{
			register_amis();
		}
	}
}

function call_check_snapshot()
{
	var params = {
		SnapshotIds: [ami_data.snapshot_task_id]
	};
	ec2.describeSnapshots(params, handle_call_check_snapshot);
}

function wait_for_snapshot_task_complete()
{
	ami_data.last_snapshot_state = "not set";
	ami_data.wait_for_snapshot_timer = setTimeout(call_check_snapshot, 1000);
}

function snapshot_imported_volume()
{
	console.log("Creating snapshot of " + ami_data.import_volume_id);
	var params = {
		VolumeId: ami_data.import_volume_id,
		Description: "Snapshot of " + ami_data.import_volume_id + " running " + ami_data.sw_label
	};
	ec2.createSnapshot(params, function(err,data) {
				if (err)
				{
					console.log("Creating snapshot of " + ami_data.import_volume_id + " failed");
					console.log(err);
					process.exit(-1);
				}
				else
				{
					ami_data.snapshot_task_id = data.SnapshotId;
					wait_for_snapshot_task_complete();
				}
	});
}

function handle_call_check_conversion_task(err, data)
{
	if (err)
	{
		console.log("describeConversionTasks failed");
		console.log(err);
	}
	else
	{
		var state = data.ConversionTasks[0].State;
		var status = "";
		if (data.ConversionTasks[0].StatusMessage)
		{
			status = data.ConversionTasks[0].StatusMessage
		}
		if (state != ami_data.last_conversion_state || status != ami_data.last_conversion_status)
		{
			ami_data.last_conversion_state = state;
			ami_data.last_conversion_status = status;
			console.log("Volume conversion state: " + state + "/" + status);
		}
		if (state != "cancelled" && state != "completed")
		{
			ami_data.wait_for_conversion_timer = setTimeout(call_check_conversion_task, 2000);
		}
		else
		{
			if (state == "cancelled")
			{
				console.log("Creation of the AMI failed");
			}
			if (state == "completed")
			{
				ami_data.import_volume_id = data.ConversionTasks[0].ImportVolume.Volume.Id;
				console.log("Imported volume id is " + ami_data.import_volume_id);
				snapshot_imported_volume();
			}
		}
	}
}

function call_check_conversion_task()
{
	var params = {
		ConversionTaskIds: [ami_data.conversion_task_id]
	};
	ec2.describeConversionTasks(params, handle_call_check_conversion_task);
}

function wait_for_conversion_task_complete()
{
	console.log("Waiting for conversion of " + ami_data.conversion_task_id + ".  This can take a while so be patient.");
	ami_data.last_conversion_state = "not set";
	ami_data.last_conversion_status = "not set";
	ami_data.wait_for_conversion_timer = setTimeout(call_check_conversion_task, 1000);
}

function upload_and_import_vmdk_file(vmdk_file)
{
	console.log("Using S3 bucket " + ami_data.bucket_name);
	setup_bucket(ami_data.bucket_name, import_vmdk_file);
}

process_args();
try
{
	ami_data.vmdk_file_stats = fs.statSync(ami_data.vmdk_file);
	// Make sure the file is readable for us
	var fd = fs.openSync(ami_data.vmdk_file, 'r');
	fs.closeSync(fd);
} catch (err)
{
	console.log("Error accessing " + ami_data.vmdk_file + "\n" + err);
	process.exit(-1);
}
console.log("Using " + ami_data.vmdk_file + " (" + ami_data.vmdk_file_stats.size + " bytes) as the vmdk file");
ami_data.vmdk_file_basename = path.basename(ami_data.vmdk_file);
ami_data.manifest_file_name = ami_data.vmdk_file_basename + "manifest.xml";
ami_data.ami_description    = ami_data.model_name + '_' + ami_data.sw_label + " created from " + ami_data.vmdk_file + " on " + new Date();
ami_data.bucket_import_key  = "import_vmdk_key"; 
ami_data.manifest_key       = ami_data.bucket_import_key + "/" + ami_data.manifest_file_name;
if (ami_data.aws_log_file_name)
{
	try {
		ami_data.aws_log_stream = fs.createWriteStream(ami_data.aws_log_file_name);
	}
	catch (err)
	{
		console.log("Error opening " + ami_data.aws_log_file_name + " for writing\n" + err);
		process.exit(-1);
	}
	AWS.config.logger = ami_data.aws_log_stream;
}
var s3 = new AWS.S3();
var ec2 = new AWS.EC2();


upload_and_import_vmdk_file(ami_data.vmdk_file);
