/*******************************************************************************
Description:
a) This file is used on AWS platforms when High Availablity is turned on
b) This script shifts secondary private IP's from Stand-by to Active after failover
c) This script shifts elastic IP from Stand-by to Active after failover
d) Changes the route entry in LAN route table associated to LAN subnet.

Author: Surya Prakash Patel
Release: 9.3.1
**********************************************************************************/

function ReplaceRoute()
{
    var route_params; 
    for(i=0;i<lan_routes.length;i++){
        if (lan_routes[i]["NeedToChange"] === 1) {
            var route_params = {
              RouteTableId: ha_info["secondary"]["lan_link_config"]["RouteTableId"],
              DestinationCidrBlock: lan_routes[i]["DestinationCidrBlock"],
              NetworkInterfaceId:  lan_routes[i]["NetworkInterfaceId"]
            };
            ec2.replaceRoute(route_params, function(err, data) {
                if (err) {
                    fs.appendFileSync(logFile,"Error Replacing route:"+lan_routes[i] +"\n");
                    fs.appendFileSync(logFile,"Error returned from API : " + err + err.stack +"\n"); // an error occurred
                }else     
                    fs.appendFileSync(logFile,"Successfully Replaced route:" + JSON.stringify(data,null,2) +"\n");           // successful response
            });
        }
    }
    fs.appendFileSync(logFile,"Done processing , Exit from process !" +"\n");       
}

function ProcessRouteTable()
{
    for(i=0;i<lan_routes.length;i++){
        if( lan_routes[i]["NetworkInterfaceId"] === ha_info["secondary"]["lan_link_config"]["NetworkInterfaceId"]){
            lan_routes[i]["NetworkInterfaceId"] = ha_info["primary"]["lan_link_config"]["NetworkInterfaceId"];
            lan_routes[i]["NeedToChange"] = 1;
        }
    }
    for(i=0;i<lan_routes.length;i++){
        fs.appendFileSync(logFile,"LAN Routes Available : " + JSON.stringify(lan_routes[i],null,2) + "\n");
    } 
    ReplaceRoute();   
}

function RouteTableSubnet()
{
    var route_params = {
        Filters: [{
            Name: 'association.subnet-id',
            Values: [ha_info["secondary"]["lan_link_config"]["SubnetId"]]
        }]
    };
    ec2.describeRouteTables(route_params, function(err, data) {
        if (err) {
            fs.appendFileSync(logFile,"couldnt find Route table associated with subnet:" + ha_info["secondary"]["lan_link_config"]["SubnetId"] +"\n");
            fs.appendFileSync(logFile,"Error returned from API : " + err + err.stack +"\n"); // an error occurred
        }else{     
            ha_info["secondary"]["lan_link_config"]["RouteTableId"] = data["RouteTables"][0]["RouteTableId"];
            ha_info["secondary"]["lan_link_config"]["Routes"] = data["RouteTables"][0]["Routes"];
            fs.appendFileSync(logFile,"Route table ID:"+ ha_info["secondary"]["lan_link_config"]["RouteTableId"] +"\n");
            fs.appendFileSync(logFile,"Route table routes:" + JSON.stringify(data["RouteTables"][0]["Routes"],null,2) +"\n");
            lan_routes = data["RouteTables"][0]["Routes"];
            ProcessRouteTable();
        }   
    });
}

function ChangeRoutingTableEntry()
{
    //First we need to fill up the params
    var lan_link_interface_id = ha_info["secondary"]["lan_link_config"]["NetworkInterfaceId"];
    var interfaceid_params = {
        NetworkInterfaceIds: [
            lan_link_interface_id
        ]
    };

    ec2.describeNetworkInterfaces(interfaceid_params, function(err, data) {
        if (err)
            fs.appendFileSync(logFile,"Error while fetching Interface information through Interface ID : " + err + err.stack + "\n"); // an error occurred
        else
        {
            if(data["NetworkInterfaces"].length != 0 ) {
                ha_info["secondary"]["lan_link_config"]["SubnetId"] = data["NetworkInterfaces"][0]["SubnetId"];
                RouteTableSubnet();
            }
            else {
                fs.appendFileSync(logFile,"couldnt find the Subnet ID associated with Network Interface :" + ha_info["secondary"]["lan_link_config"]["NetworkInterfaceId"]+ "\n");
            }
        }
    });
}

function AssociateElasticIP(link_type)
{
    fs.appendFileSync(logFile,"Starting Associating Elastic IP" + "\n");
    fs.appendFileSync(logFile,"primary: " + JSON.stringify(ha_info["secondary"][link_type],null,2) + "\n");
    var associate_params = {
        AllocationId: ha_info["secondary"][link_type]["AllocationId"],
        NetworkInterfaceId: ha_info["primary"][link_type]["NetworkInterfaceId"],
        PrivateIpAddress: ha_info["secondary"][link_type]["SecondaryPrivateIpAddress"]
    };

    ec2.associateAddress(associate_params, function(err, data) {
        if (err){
            fs.appendFileSync(logFile,"Error associating Elastic IP to Interface" + ha_info["secondary"][link_type]["Association"]["PublicIp"]+ "\n")
            fs.appendFileSync(logFile,"Error returned from API : " + err + err.stack +"\n"); // an error occurred
        } else {
            fs.appendFileSync(logFile,"Successfully Associated Elastic IP "+ ha_info["secondary"][link_type]["Association"]["PublicIp"] + data  +"\n");
            fs.appendFileSync(logFile,"Response data:" + JSON.stringify(data,null,2) +"\n" );
        }
    });
}

function GetAllocationIDForAdapter(link_type)
{
    if(ha_info["secondary"][link_type]["Association"] === 'undefined'){
        fs.appendFileSync(logFile,"No ElasticIpAddress associated with secondary"+ link_type + "LINK adapter , we dont need to do anything !" +"\n");
        return;
    }
    else {
        fs.appendFileSync(logFile,"IF we are primary instance and here, Means ElasticIpAddress should be associated with Secondary WAN LINK" +"\n");
        
        var params = {
            PublicIps: [ha_info["secondary"][link_type]["Association"]["PublicIp"]]
        };

        ec2.describeAddresses(params, function(err, data) {
            if (err) fs.appendFileSync(logFile,"Error Describing Address:" +err + err.stack +"\n"); // an error occurred
            else {     
                //fs.appendFileSync(logFile,""data);           // successful response
                ha_info["secondary"][link_type]["AllocationId"] = data["Addresses"][0]["AllocationId"];
                AssociateElasticIP(link_type);
            }
        });
    }
}

function AssignPrivateIpAddresses(link_type,interface_pri_id,interface_sec_ip)
{
    // This function assigns the specified secondary private IP address to the specified network interface.
    var assign_params = {
        NetworkInterfaceId: interface_pri_id , 
        PrivateIpAddresses: [
            interface_sec_ip
        ]
    };

    ec2.assignPrivateIpAddresses(assign_params, function(err, data) {
        if (err) {  
            fs.appendFileSync(logFile,"Error UnAssigning PrivateIpAddress:" + interface_pri_id +"\n");
            fs.appendFileSync(logFile,"Error from API assignPrivateIpAddresses:" + err +  err.stack +"\n"); // an error occurred
        }
        else {     
            fs.appendFileSync(logFile,"Successfully Assigned PrivateIpAddresses" + interface_sec_ip +"\n");
            fs.appendFileSync(logFile,"Response data :" + JSON.stringify(data,null,2) + "\n");  // successful response
            GetAllocationIDForAdapter(link_type);
        }
    });
}

var trails = 1;
function CheckForStatusAndAssignPrivateIpAddresses(link_type,interface_pri_id,interface_sec_ip)
{
    var interface_params = {
        Filters: [{
            Name: 'addresses.private-ip-address',
            Values: [interface_sec_ip]
        }]
    };

    ec2.describeNetworkInterfaces(interface_params, function(err, data) {
        if (err)
            fs.appendFileSync(logFile,'Error while fetching secondary_instance IP'+ interface_sec_ip + err + err.stack +"\n"); // an error occurred
        else
        {
            if(data["NetworkInterfaces"].length === 0 ) {
                fs.appendFileSync(logFile,"Private Ip adderess is unassigned ,Now assign private address to Primary adapter" +"\n");
                AssignPrivateIpAddresses(link_type,interface_pri_id,interface_sec_ip);
            }
            else {
                fs.appendFileSync(logFile,"Private Ip adderess is still assigned :"+ interface_sec_ip +"\n");
                if(trails < 6) {
                    fs.appendFileSync(logFile,"Trying once again, Trail no :"+ trails +"\n");
                    trails++;
                    setTimeout(function(){
                        CheckForStatusAndAssignPrivateIpAddresses(link_type,interface_pri_id,interface_sec_ip);
                    },3000);
                }
            }
        }
    });
}

function UnAssignPrivateIpAddress(link_type,interface_pri_id,interface_sec_id,interface_sec_ip)
{
    // This function unassigns the specified private IP address from the specified network interface.
    var unassign_params = {
        NetworkInterfaceId: interface_sec_id, 
        PrivateIpAddresses: [
            interface_sec_ip
        ]
    };
    ec2.unassignPrivateIpAddresses(unassign_params, function(err, data) {
        if (err) fs.appendFileSync(logFile,"Error Unassigning PrivateIpAddress:" + interface_sec_ip + err + err.stack +"\n"); // an error occurred
        else {    
            fs.appendFileSync(logFile,"Successfully Unassigned PrivateIpAddresses ,Response:"+ interface_sec_ip + "\n");
            fs.appendFileSync(logFile,"Response data :" + JSON.stringify(data,null,2) + "\n");  // successful response
            CheckForStatusAndAssignPrivateIpAddresses(link_type,interface_pri_id,interface_sec_ip);
            //AssociateElasticIP();
        }         
    });
}

function ProcessLinksIPs()
{
    for(index=0;index<ha_info["secondary"]["wan_link_config"]["PrivateIpAddresses"].length;index++) {
        if(!(ha_info["secondary"]["wan_link_config"]["PrivateIpAddresses"][index].hasOwnProperty('Primary') &&
            ha_info["secondary"]["wan_link_config"]["PrivateIpAddresses"][index]["Primary"])){
            ha_info["secondary"]["wan_link_config"]["SecondaryPrivateIpAddress"] = ha_info["secondary"]["wan_link_config"]["PrivateIpAddresses"][index]["PrivateIpAddress"];
            
            if(ha_info["secondary"]["wan_link_config"]["PrivateIpAddresses"][index].hasOwnProperty('Association'))
                ha_info["secondary"]["wan_link_config"]["Association"] = ha_info["secondary"]["wan_link_config"]["PrivateIpAddresses"][index]["Association"];
            else
                ha_info["secondary"]["wan_link_config"]["Association"] = "undefined";
            //fs.appendFileSync(logFile,"WAN Association -->",ha_info["secondary"]["wan_link_config"]["Association"]);
        }
    }

    for(index=0;index<ha_info["secondary"]["lan_link_config"]["PrivateIpAddresses"].length;index++) {
        if(!(ha_info["secondary"]["lan_link_config"]["PrivateIpAddresses"][index].hasOwnProperty('Primary') &&
            ha_info["secondary"]["lan_link_config"]["PrivateIpAddresses"][index]["Primary"])){
            ha_info["secondary"]["lan_link_config"]["SecondaryPrivateIpAddress"] = ha_info["secondary"]["lan_link_config"]["PrivateIpAddresses"][index]["PrivateIpAddress"];
            
            if(ha_info["secondary"]["lan_link_config"]["PrivateIpAddresses"][index].hasOwnProperty('Association'))
                ha_info["secondary"]["lan_link_config"]["Association"] = ha_info["secondary"]["lan_link_config"]["PrivateIpAddresses"][index]["Association"];
            else
                ha_info["secondary"]["lan_link_config"]["Association"] = "undefined";

            fs.appendFileSync(logFile,"LAN Association :"+ ha_info["secondary"]["lan_link_config"]["Association"] +"\n");
        }
    }
    fs.appendFileSync(logFile,"WAN LINK Config :" + JSON.stringify(ha_info["secondary"]["wan_link_config"],null,2) +"\n");
    fs.appendFileSync(logFile,"LAN LINK Config :" + JSON.stringify(ha_info["secondary"]["lan_link_config"],null,2) +"\n");

    UnAssignPrivateIpAddress("wan_link_config",ha_info["primary"]["wan_link_config"]["NetworkInterfaceId"],ha_info["secondary"]["wan_link_config"]["NetworkInterfaceId"],ha_info["secondary"]["wan_link_config"]["SecondaryPrivateIpAddress"]);
    UnAssignPrivateIpAddress("lan_link_config",ha_info["primary"]["lan_link_config"]["NetworkInterfaceId"],ha_info["secondary"]["lan_link_config"]["NetworkInterfaceId"],ha_info["secondary"]["lan_link_config"]["SecondaryPrivateIpAddress"]);
    ChangeRoutingTableEntry();
}

function DescribeInterfaceIP(interface_ip)
{
    var sec_instance_id;
    var interface_params = {
        Filters: [{
            Name: 'addresses.private-ip-address',
            Values: [interface_ip]
        }]
    };

    ec2.describeNetworkInterfaces(interface_params, function(err, data) {
        if (err)
            fs.appendFileSync(logFile,"Error while fetching secondary_instance ID" + err + err.stack +"\n"); // an error occurred
        else
        {
            if(data["NetworkInterfaces"].length != 0 ) {
                sec_instance_id = data["NetworkInterfaces"][0]["Attachment"]["InstanceId"];
                fs.appendFileSync(logFile,"secondary instance id :" + sec_instance_id +"\n");
                DescribeInstance(sec_instance_id, "secondary");
            }
            else {
                fs.appendFileSync(logFile,"Couldn't find the peer instance with ip:" + interface_ip +"\n");
            }

        }
    });
}

function CheckForSecondaryIPs()
{
    if((ha_info["primary"]["wan_link_config"]["PrivateIpAddresses"].length === 2) && (ha_info["primary"]["lan_link_config"]["PrivateIpAddresses"].length === 2) ){
        fs.appendFileSync(logFile,"IF we are primary and here means WAN link , LAN link associated with two IP's, we dont need to do anything !" +"\n");
        fs.appendFileSync(logFile,"Exiting from Process!" +"\n");
        return;
    }
    else{
        fs.appendFileSync(logFile,"IF we are primary instance and here, Means we need to associate secondary IP to WAN and LAN links" +"\n");
        var secondary_ha_ip = ha_link_config["ha-other"];
        DescribeInterfaceIP(secondary_ha_ip);
    }
}

function DescribeInstance(instance_id,role)
{
    var describe_param = {
        InstanceIds:[instance_id],
        DryRun: false
    }
    fs.appendFileSync(logFile,"role :" + role +"\n");
    ec2.describeInstances(describe_param,function(err,data){
        if(err){
            fs.appendFileSync(logFile,"Error in describeInstances API : "+ err.stack +"\n");
        }
        else{
            var network_interfaces = data['Reservations'][0]['Instances'][0]['NetworkInterfaces'];
            ha_info[role] = [];
            ha_info[role]["Interfaces"] = [];
            ha_info[role]["InstanceId"] = instance_id;
            for(var index=0;index<network_interfaces.length;index++) {
                var InterfaceList= {};
                InterfaceList["NetworkInterfaceId"] = network_interfaces[index]["NetworkInterfaceId"];
                InterfaceList["PrivateIpAddress"] = network_interfaces[index]["PrivateIpAddress"];
                InterfaceList["MAC"] = network_interfaces[index]["MacAddress"];
                InterfaceList["DeviceIndex"] = network_interfaces[index]["Attachment"]["DeviceIndex"];
                if(network_interfaces[index].hasOwnProperty('Association')){
                    InterfaceList["ElasticIpAddress"] = network_interfaces[index]["Association"]["PublicIp"];
                }
                else{
                    InterfaceList["ElasticIpAddress"] = "undefined";
                }
                InterfaceList["AttachmentId"] = network_interfaces[index]["Attachment"]["AttachmentId"];
                if(InterfaceList["DeviceIndex"] === 2){
                    ha_info[role]["wan_link_config"] = InterfaceList;
                    if(network_interfaces[index].hasOwnProperty('PrivateIpAddresses'))
                        ha_info[role]["wan_link_config"]["PrivateIpAddresses"] = network_interfaces[index]["PrivateIpAddresses"];
                    else
                        ha_info[role]["wan_link_config"]["PrivateIpAddresses"] = "undefined";
                }
                else if(InterfaceList["DeviceIndex"] === 1){
                    ha_info[role]["lan_link_config"] = InterfaceList;
                     if(network_interfaces[index].hasOwnProperty('PrivateIpAddresses'))
                        ha_info[role]["lan_link_config"]["PrivateIpAddresses"] = network_interfaces[index]["PrivateIpAddresses"];
                    else
                        ha_info[role]["lan_link_config"]["PrivateIpAddresses"] = "undefined";
                }
                ha_info[role]["Interfaces"].push(InterfaceList);
                fs.appendFileSync(logFile,"Instance object : " + JSON.stringify(ha_info[role]["Interfaces"][index],null,2) +"\n");
                }
            }
            if(role === "primary"){
                CheckForSecondaryIPs();
            }
            else {
                ProcessLinksIPs();
            }
    });
}

function MetaRequest()
{
    meta.request("/latest/meta-data/instance-id", function(err, data_id){
        if(err)
            fs.appendFileSync(logFile,"Error in fetching meta-data needed for getting instance-id"+ err + err.stack +"\n");
         else{
            instance_id = data_id;
            fs.appendFileSync(logFile,"InstanceID of the Instance:" + instance_id +"\n");
            DescribeInstance(instance_id,"primary");
        }
    });
}

var instance_id;
var ha_info = [];
var ha_link_config = [];
var lan_routes = [];
var no=1;

//Started Logging Functionality 
var logFile = "/home/adminuser/log/SDWAN_aws_ha.log";
var maxLogSize = 2000000; // 2MB

var fs = require('fs');
var fileSizeInBytes = 0;
if (fs.existsSync(logFile)) {
     stats = fs.statSync(logFile);
     fileSizeInBytes = stats.size ;
}
if(fileSizeInBytes >= maxLogSize) {
    fs.writeFileSync(logFile, "Restarting log. Old size crossed ", maxLogSize, "\n");
}
fs.appendFileSync(logFile, "\n******************************* started logging " + new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '') + "***********************************\n" );

// Load the SDK and UUI
var AWS,ec2;
AWS = require('aws-sdk');
var meta  = new AWS.MetadataService();

//Processing VPX interface IP's from t2_app .
var lineReader = require('readline').createInterface({
    input: require('fs').createReadStream('/home/adminuser/config/ha_node_ips')
});

lineReader.on('line', function (line) {
    // fs.appendFileSync(logFile,'Line from file:', line);
    var arr = line.split(":");
    var link_name = arr[0];
    if(arr[0] === "tn-la1"){
        link_name = "tn-ha"+no;
        no = no+1;
    }
    var ip = arr[1].trim();
    if(link_name === "ha-pri" || link_name === "ha-sec")
    {
        if(ha_link_config["tn-ha1"] != ip &&  ha_link_config["tn-ha2"] != ip){
            link_name = "ha-other";
        }
    }
    ha_link_config[link_name] = ip;
    //fs.appendFileSync(logFile, "ha_link_config array of key-value pairs :",ha_link_config);
});

var args = process.argv.slice(2);

meta.request("/latest/meta-data/placement/availability-zone",function(err,data){
    if(err)
            fs.appendFileSync(logFile,"Cannot fetch region using metadata"+ err +"\n");
    else{
            str = data.substring(0, data.length - 1);
            fs.appendFileSync(logFile,"Region of the Instance:"+ str +"\n");
            AWS.config.update({region:str});
            ec2 = new AWS.EC2();
            MetaRequest();
        }
});
