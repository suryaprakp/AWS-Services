#!/usr/bin/env node

/* This allows us to treat an array as a Set by calling push_if_needed instead of push directly. */
Array.prototype.push_if_needed = function (e) {
	if (!this.length)
	{
		this.push(e);
		return;
	}
	var i;
	for (var i = 0; i < this.length; i++)
	{
		if (this[i] === e)
		{
			return;
		}
	}
	this.push(e);
};

var ami_data = new Object();
ami_data.test_mode = false;
ami_data.ami_name_list = new Array();

var fs = require('fs');
var AWS = require('aws-sdk');
var util = require('util');


function usage()
{
	return "delete_ami.js [-h|--help] -n|--name <AMI name> [-t|--test] [-a|--log-aws-calls <log file name>]";
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
		case "-n":
		case "--name":
			i++;
			if (i >= args.length)
			{
				error_exit_usage("Missing <AMI name> argument");
			}
			ami_data.ami_name_list.push_if_needed(args[i]);
			break;
		case "-t":
		case "--test":
			ami_data.test_mode = true;
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

		}
	}

	if (ami_data.ami_name_list.length == 0)
	{
		error_exit_usage("Missing <AMI name> argument");
	}
}

function handle_describe_regions(err, data, obj)
{
	if (err)
	{
		obj.emit('end_process_error', "describeRegions failed:\n" + err);
	}
	else
	{
		data.Regions.forEach(function(element, index, array) {
			obj.region_list.push(element.RegionName);
		});
		obj.emit("region_list_populated");
	}
}

function populate_region_list(obj)
{
	var params = {};
	obj.ec2.describeRegions(params, function(err, data) { handle_describe_regions(err, data, obj); });
}

function handle_delete_from_region(obj, region_list)
{
	if (region_list.length)
	{
		obj.emit('delete_from_region_list', region_list); 
	}
	else
	{
		obj.emit('delete_from_region_list_complete');
	}
}

function handle_describe_images(err, data, obj, curr_region, region_list)
{
	if (err)
	{
		obj.emit('end_process_error', "describeImages failed:\n" + err);
	}
	else
	{
		if (data.Images.length)
		{
			console.log("Region " + curr_region + " has these AMIs:");
			data.Images.forEach(function(element, index, array) {
				// console.log("    " + util.inspect(element));
				console.log("    " + element.ImageId);
			});
			var snapshot_list = new Array();
			var volume_list = new Array();
			obj.emit('delete_image_list', data.Images, curr_region, region_list, snapshot_list, volume_list);
		}
		else
		{
			console.log("Region " + curr_region + " has no AMIs named " + ami_data.ami_name_list);
			handle_delete_from_region(obj, region_list);
		}
	}
}

function handle_deregister_image(err, data, obj, image_list, curr_region, region_list, snapshot_list, volume_list)
{
	if (err)
	{
		obj.emit('end_process_error', "deregisterImage failed:\n" + err);
	}
	else
	{

		if (image_list.length)
		{
			obj.emit('delete_image_list', image_list, curr_region, region_list, snapshot_list, volume_list);
		}
		else
		{
			if (snapshot_list.length)
			{
				obj.emit('delete_snapshot_list', snapshot_list, curr_region, region_list, volume_list);
			}
			else
			{
				if (volume_list.length)
				{
					obj.emit('delete_volume_list', volume_list);
				}
				else
				{
					handle_delete_from_region(obj, region_list);
				}
			}
		}
	}
}

function delete_image_list(image_list, obj, curr_region, region_list, snapshot_list, volume_list)
{
	var image = image_list.pop();
	var curr_image_id = image.ImageId;
	var ami_snapshot_list = new Array();
	image.BlockDeviceMappings.forEach(function(element, index, array) {
		/* The SnapshotId could be undefined if AWS is in the processing of copying an AMI across regions.  The
		 * AMI will exist, but if the snapshot is still being created, then we will have an AMI with no
		 * SnapshotId.  In that case, we just skip it so that it will look like an image with no snapshots.
		 * This will leak the snapshot, but there is no way to figure out what the SnapshotId is.
		 */
		if (element.Ebs.SnapshotId != undefined)
		{
			snapshot_list.push_if_needed(element.Ebs.SnapshotId);
			ami_snapshot_list.push(element.Ebs.SnapshotId);
		}
	}); 
	if (snapshot_list.length)
	{
		console.log("Doing delete of image " + curr_image_id + " which has snapshots " + ami_snapshot_list);
	}
	else
	{
		console.log("Doing delete of image " + curr_image_id + " which has no snapshots");
	}
	var callback = function(err, data) { handle_deregister_image(err, data, obj, image_list, curr_region, region_list, snapshot_list, volume_list); };
	if (ami_data.test_mode)
	{
		console.log("Pretending to deregister AMI " + curr_image_id);
		var err = null;
		var data = "";
		callback(err, data);
	}
	else
	{

		var params = {
			ImageId: curr_image_id
		};
		console.log("Deregistering AMI " + curr_image_id);
		obj.ec2.deregisterImage(params, callback );
	}
}

function delete_from_region_list(obj, region_list)
{
	var curr_region = region_list.pop();
	console.log("\n\nChecking region " + curr_region);
	obj.ec2 = new AWS.EC2({region: curr_region});
	var params = new Object();
	params.Owners = new Array();
	params.Owners.push('self');
	var filter_list = new Array();
	var filter_obj = new Object();
	filter_obj.Name = 'name';
	filter_obj.Values = new Array();
	ami_data.ami_name_list.forEach(function(element, index, array) {
		filter_obj.Values.push(element);
	});
	params.Filters = new Array();
	params.Filters.push(filter_obj);
	obj.ec2.describeImages(params, function(err, data) { handle_describe_images(err, data, obj, curr_region, region_list); });
}

function handle_delete_snapshot(err, data, obj, snapshot_list, curr_region, region_list, volume_list)
{
	if (err)
	{
		obj.emit('end_process_error', "deleteSnapshot failed:\n" + err);
	}
	else
	{
		if (snapshot_list.length)
		{
			obj.emit('delete_snapshot_list', snapshot_list, curr_region, region_list, volume_list);
		}
		else
		{
			obj.emit('delete_volume_list', volume_list, curr_region, region_list);
		}
	}
}

function delete_snapshot(curr_snapshot, snapshot_list, obj, curr_region, region_list, volume_list)
{
	var callback = function(err, data) { handle_delete_snapshot(err, data, obj, snapshot_list, curr_region, region_list, volume_list); };
	if (ami_data.test_mode)
	{
		console.log("Pretending to delete snapshot " + curr_snapshot);
		var err = null;
		var data = "";
		callback(err, data);
	}
	else
	{
		var params = {
			SnapshotId: curr_snapshot
		};
		console.log("Deleting snapshot " + curr_snapshot);
		obj.ec2.deleteSnapshot(params, callback);
	}
}

function handle_describe_snapshots(err, data, snapshot_list, obj, curr_region, region_list, volume_list)
{
	if (err)
	{
		obj.emit('end_process_error', "describeSnapshots failed:\n" + err);
	}
	else
	{
		var curr_snapshot;
		var snapshot_volumes = new Array();
		data.Snapshots.forEach(function(element, index, array) {
			curr_snapshot = element.SnapshotId;
			volume_list.push_if_needed(element.VolumeId);
			snapshot_volumes.push(element.VolumeId);
		});
		console.log("Processing snapshot " + curr_snapshot + " with volume " + snapshot_volumes);
		delete_snapshot(curr_snapshot, snapshot_list, obj, curr_region, region_list, volume_list);
	}
}

function delete_snapshot_list(snapshot_list, obj, curr_region, region_list, volume_list)
{
	var curr_snapshot = snapshot_list.pop();

	var params = {
		SnapshotIds: [ curr_snapshot ]
	};
	var callback = function(err, data) { handle_describe_snapshots(err, data, snapshot_list, obj, curr_region, region_list, volume_list); };
	obj.ec2.describeSnapshots(params, callback);
}

function handle_delete_volume(err, data, volume_list, obj, curr_region, region_list)
{
	if (err)
	{
		console.log("deleteVolume failed.  Ignoring this error because it is possible the volume is in use or does not exist: " + err);
	}

	if (volume_list.length)
	{
		obj.emit('delete_volume_list', volume_list, curr_region, region_list);
	}
	else
	{
		handle_delete_from_region(obj, region_list);
	}
}

function delete_volume_list(volume_list, obj, curr_region, region_list)
{
	var curr_volume = volume_list.pop();
	var callback = function(err, data) { handle_delete_volume(err, data, volume_list, obj, curr_region, region_list); };
	if (ami_data.test_mode)
	{
		console.log("Pretending to delete volume " + curr_volume);
		var err = null;
		var data = "";
		callback(err, data);
	}
	else
	{
		var params = {
			VolumeId: curr_volume
		};
		console.log("Deleting volume " + curr_volume);
		obj.ec2.deleteVolume(params, callback);
	}
}

function create_delete_ami_object()
{
	var events = require('events');
	var obj = new events.EventEmitter();

	obj.ec2 = new AWS.EC2({region: 'us-east-1'});

	obj.start_process = function() {
		obj.emit("get_region_list", obj.error);
	};
	obj.on('start_process', obj.start_process);

	obj.get_region_list = function() {
		obj.region_list = new Array();
		populate_region_list(obj);
	};
	obj.on('get_region_list', obj.get_region_list);

	obj.region_list_received = function() {
		obj.emit('delete_from_region_list', obj.region_list);
	};
	obj.on('region_list_populated', obj.region_list_received);

	obj.delete_from_region_list = function(region_list) {
		delete_from_region_list(obj, region_list);
	};
	obj.on('delete_from_region_list', obj.delete_from_region_list);

	obj.delete_image_list = function(image_list, curr_region, region_list, snapshot_list, volume_list) {
		delete_image_list(image_list, obj, curr_region, region_list, snapshot_list, volume_list);
	}
	obj.on('delete_image_list', obj.delete_image_list);


	obj.delete_snapshot_list = function(snapshot_list, curr_region, region_list, volume_list) {
		delete_snapshot_list(snapshot_list, obj, curr_region, region_list, volume_list);
	}
	obj.on('delete_snapshot_list', obj.delete_snapshot_list);

	obj.delete_volume_list = function(volume_list, curr_region, region_list) {
		delete_volume_list(volume_list, obj, curr_region, region_list);
	}
	obj.on('delete_volume_list', obj.delete_volume_list);

	obj.end_process_success = function() {
		console.log("All AMIs deleted");
	}
	obj.on('end_process_success', obj.end_process_success);
	
	obj.end_process_error = function(err) {
		console.log("Error deleting amis: " + err);
	}
	obj.on('end_process_error', obj.end_process_error);

	return obj;
}

function delete_all_amis_by_name()
{
	ami_data.delete_ami_object = create_delete_ami_object();
	ami_data.delete_ami_object.emit("start_process");
}


function main()
{
	process_args();
	console.log("Deleting AMIs named " + ami_data.ami_name_list + " from all regions.");
	if (ami_data.test_mode)
	{
		console.log("Running in test mode so no AMIs will be harmed during this run.");
	}

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
	delete_all_amis_by_name();
}
main();
