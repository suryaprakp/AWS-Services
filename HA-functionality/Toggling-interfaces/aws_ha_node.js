var instance_id;
var ha_info = [];
var ha_link_config = [];
var no = 1;
var call_level;
var primary_instance = [];
var secondary_instance = [];
var child_process = require('child_process');

var lineReader = require('readline').createInterface({
    input: require('fs').createReadStream('/home/adminuser/config/ha_node_ips')
});

lineReader.on('line', function (line) {
    // console.log('Line from file:', line);
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
    //console.log("ha_link_config array of key-value pairs :",ha_link_config);
});

function ReturnPromiseObject(instance_id_param)
{
    return new AWS.EC2().describeNetworkInterfaces(instance_id_param).promise();
}

function ReturnPromiseObject_detach(attach_id_param)
{
    return new AWS.EC2().detachNetworkInterface(attach_id_param).promise();
}

var no_trails = 1;
function UpdateUdev_test()
{
    if(secondary_instance[0]["Status"] != 'in-use' || secondary_instance[1]["Status"] != 'in-use'){
        if(no_trails < 6) {
            console.log("If we are here  in UpdateUdevTest, Means Interfaces are not ready, so cant start udev rules , Trying once again, Trail no :", no_trails);
            no_trails++;
            setTimeout(function(){
                GetStatusOfInterfaces(3);
            },5000);
            return;
        }
    }
    const testFolder = '/sys/class/net';
    const fs = require('fs');
    fs.readdirSync(testFolder).forEach(file => {
        console.log("Adapter Name:",file);
        if(file != 'lo' &&  file != 'tn-mgt0' &&  file != 'tn-la1' && file != 'tn-la0' && file != 'tn-wa0'){
            // exec: spawns a shell.
            console.log("udevadm test on",file);
            child_process.execSync('udevadm test /sys/class/net/'+file, function(error, stdout, stderr){
                if(error)
                    console.log("stderr :",stderr);
                if(stdout)
                    console.log("stderr :",stdout);
                if(stderr)
                    console.log("stderr :",error);
            });
        }
    });
    console.log("Done updating udev rules");
    if(ha_role === "primary" || ha_role === "secondary"){
        console.log("primary Disabling t2_app!!");
        Disablet2_app();
    }
}

function Disablet2_app()
{
 console.log("Disabling t2_app !");
    child_process.execSync('sudo touch  /home/adminuser/bin/disabled', function(error,stdout,stderr){
        if (error !== null)
            console.log('exec error for disabling t2_app , During touching disabled file ' + error);
    });
    setTimeout(function(){
        Enablet2_app();
    },2000);
}

function Enablet2_app()
{
    console.log("Enabling t2_app !");
    var child_process = require('child_process');
    child_process.execSync('sudo rm -f /home/adminuser/bin/disabled', function(error, stdout, stderr){
         if (error !== null)
            console.log('exec error for enabling  t2_app , During deleting disabled file ' + error);
    });
}

function GetStatusOfInterfaces(call_level)
{
    var  params =  {
        NetworkInterfaceIds: []
    };
    var promises_array = [];
    var index,ind,ii;
    for(index=0;index<primary_instance.length;index++){
        params.NetworkInterfaceIds[0] = primary_instance[index]["NetworkInterfaceId"];
        promises_array.push(ReturnPromiseObject(params));
    }
    for(ind=0;ind<secondary_instance.length;ind++){
        params.NetworkInterfaceIds[0] = secondary_instance[ind]["NetworkInterfaceId"];
        promises_array.push(ReturnPromiseObject(params));
    }

    Promise.all(promises_array).then(function(values){

        for(index=0,ii=0;index<primary_instance.length;index++,ii++){
            primary_instance[index]["Status"] = values[ii].NetworkInterfaces[0]["Status"];
        }
        for(ind=0;ind<secondary_instance.length;ind++,ii++){
            console.log("value -->",values[ii]);
            secondary_instance[ind]["Status"] = values[ii].NetworkInterfaces[0]["Status"];
        }
        console.log("primary object Final :",primary_instance);
        console.log("secondary object Final :",secondary_instance);
        console.log("call value :",call_level);
        if(call_level === 1){
            console.log("Calling DetachInterfaces");
            DetachInterfacesAPI();
        }
        else if(call_level === 2)
        {
            console.log("Inside AttachInterfaceAPI");
            AttachInterfacesAPI();
        }
        else if(call_level === 3)
        {
            console.log("Inside UpdateUdev_test");
            UpdateUdev_test();
        }

    }).catch(function(error){
        console.log("Error-->",error)});
}
var trails = 1;
function AttachInterfacesAPI()
{
    if(primary_instance[0]["Status"] != 'available' || secondary_instance[0]["Status"] != "available" || primary_instance[1]["Status"] != 'available' || secondary_instance[1]["Status"] != "available"){    
        if(trails < 9) {
            console.log("If we are here , Means Interfaces are not ready");
            console.log("Amazon response time may vary depending on its load")
            console.log("we will wait for 5 sec and try again");
            console.log("Trails no ", trails);
            trails++;
            setTimeout(function(){
                GetStatusOfInterfaces(2);
            },5000);
            return;
        }        
    }
    else
    { 
        AttachInterface_primary(0);
        AttachInterface_secondary(0);
    }
}

function AttachInterface_primary(index)
{
    if(primary_instance[index]["DeviceIndex"] != secondary_instance[index]["DeviceIndex"]){
        console.log("Primary -- No indexes matching ",index);
        return;
    }
    if(primary_instance[index]["Status"] != 'available' || secondary_instance[index]["Status"] != "available"){
         console.log("Primary -- If we are here , Means Interfaces are not ready");
         return;
    }
    var primary_dev_index = primary_instance[index]["DeviceIndex"];
    var primary_instance_id = primary_instance[index]["InstanceId"];
    var sec_interface_id = secondary_instance[index]["NetworkInterfaceId"];
    var attach_param = {
        DeviceIndex: primary_dev_index,
        NetworkInterfaceId: sec_interface_id,
        InstanceId: primary_instance_id,
    }
    console.log("Primary -- Attaching Secondary Interface to Primary Instance, Interface Info: ", secondary_instance[index]);
    ec2.attachNetworkInterface(attach_param,function(err,data)
    {
        if(err)
            console.log("Error while attaching interface on primary",err,err.stack);
        else{
            console.log("Primary -- Attached Interface on Primary Instance ID: ",primary_instance[index]["InstanceId"]);
            console.log("Primary -- Attached Interface to Primary, Interface Info: ", secondary_instance[index]);
            console.log("Primary -- Attached Interface to Primary, Interface Info: ", secondary_instance[index]["PrivateIpAddress"]);
             if(index === 0)
                AttachInterface_primary(1);
            else if(index === 1)
            {
                setTimeout(function(){
                    GetStatusOfInterfaces(3);
                },10000);
            }
        }
    });
}

function AttachInterface_secondary(index)
{
    if(primary_instance[index]["DeviceIndex"] != secondary_instance[index]["DeviceIndex"]){
        console.log("Secondary -- No indexes matching ",index);
        return;
    }
    if(primary_instance[index]["Status"] != 'available' || secondary_instance[index]["Status"] != "available"){
        console.log("Secondary -- If we are here , Means Interfaces are not ready");
        return;
    }
    var sec_dev_index = secondary_instance[index]["DeviceIndex"];
    var sec_instance_id = secondary_instance[index]["InstanceId"];
    var primary_interface_id = primary_instance[index]["NetworkInterfaceId"];
    attach_param = {
        DeviceIndex: sec_dev_index,
        NetworkInterfaceId: primary_interface_id,
        InstanceId: sec_instance_id,
    }
    console.log("Secondary -- Attaching Primary Interface to Secondary Instance, Interface Info: ", primary_instance[index]);
    ec2.attachNetworkInterface(attach_param,function(err,data)
    {
        if(err)
            console.log("Error while attaching interface on secondary",err,err.stack);
        else{
            console.log("Secondary -- Attached Interface on Secondary Instance ID: ",secondary_instance[index]["InstanceId"]);
            console.log("Secondary -- Attached Interface to Secondary, Interface Info: ", primary_instance[index]);
            console.log("Secondary -- Attached Interface to Secondary, Interface IP: ", primary_instance[index]["PrivateIpAddress"]);
           if(index === 0)
                AttachInterface_secondary(1);
         }
    });
}

var detach_trails=1;
function DetachInterfacesAPI()
{
    if(primary_instance[0]["Status"] != 'in-use' || secondary_instance[0]["Status"] != 'in-use' || primary_instance[1]["Status"] != 'in-use' || secondary_instance[1]["Status"] != 'in-use'){    
        if(detach_trails < 3) {
            console.log("If we are here , Means Interfaces are not ready to detach");
            console.log("Amazon response time may vary depending on its load")
            console.log("we will wait for 5 sec and try again");
            console.log("Trails no ", trails);
            detach_trails++;
            setTimeout(function(){
                GetStatusOfInterfaces(1);
            },5000);
            return;
        }        
    }
    else
    { 
        DetachInterface_primary(0);
        DetachInterface_secondary(0);
    }
}

function DetachInterface_primary(index)
{
    if(primary_instance[index]["Status"] != 'in-use'){
        console.log("Most Unlinkely state, That Interface is not in-use before detaching on primary");
        console.log("Exiting");
        return;
    }
    var primary_attachment_id = primary_instance[index]["AttachmentId"];
    var detach_param = {
        AttachmentId : primary_attachment_id,
        Force: true
    }
    console.log("started Detaching interfaces on primary!");
    ec2.detachNetworkInterface(detach_param,function(err,data)
    {
        if(err)
            console.log(err);
        else{
            console.log("Detach Interface successful on Primary Instance ID: ",primary_instance[index]["InstanceId"]);
            console.log("Detached Interface on Primary: ",  primary_instance[index]);
            console.log("Detached Interface on Primary IP: ",  primary_instance[index]["PrivateIpAddress"]);
            if(index === 0)
                DetachInterface_primary(1);
            else if(index === 1)
            {
                setTimeout(function(){
                    GetStatusOfInterfaces(2);
                },5000);
            }
        }
    });
}

function DetachInterface_secondary(index)
{
    if(secondary_instance[index]["Status"] != 'in-use'){
        console.log("Most Unlinkely state, That Interface is not in-use before detaching on secondary");
        console.log("Exiting");
        return;
    }

    var secondary_attachment_id = secondary_instance[index]["AttachmentId"];
    var detach_param = {
        AttachmentId : secondary_attachment_id,
        Force: true
    }
    console.log("started Detaching interfaces on secondary!");
    ec2.detachNetworkInterface(detach_param,function(err,data)
    {
        if(err)
            console.log(err);
        else{
            console.log("Detach Interface successful on Secondary Instance ID: ",secondary_instance[index]["InstanceId"]);
            console.log("Detached Interface on Secondary: ",  secondary_instance[index]);
            console.log("Detached Interface on Secondary IP: ",  secondary_instance[index]["PrivateIpAddress"]);
            if(index === 0)
                DetachInterface_secondary(1);
        }
    });
}

function GetInterfaceID(secondary_device_index)
{
    var sec_index_no = 999;
    for(var index=0;index<ha_info["secondary"]["Interfaces"].length;index++)
    {
        if(ha_info["secondary"]["Interfaces"][index]["DeviceIndex"] === secondary_device_index){
            sec_index_no = index;
        }
    }
    return sec_index_no;
}

function PrepareObjects()
{
    for(var index=0;index<ha_info["primary"]["Interfaces"].length;index++){
        //if(!ha_info["primary"]["Interfaces"][index]["IsAvailableOnPrimary"]){
            var primary_attachment_id = ha_info["primary"]["Interfaces"][index]["AttachmentId"];
            var sec_instance_id = ha_info["secondary"]["InstanceId"];
            var device_index =  ha_info["primary"]["Interfaces"][index]["DeviceIndex"];
            var sec_index_no = GetInterfaceID(device_index);
            if(sec_index_no == 999){
                console.log("Couldnt Find the Interface with device Index " , index);
                continue;
            }
            console.log("Primary Index :",index);
            console.log("Secondary Index :",sec_index_no);
            ha_info["primary"]["Interfaces"][index]["InstanceId"] =  ha_info["primary"]["InstanceId"];
            ha_info["secondary"]["Interfaces"][sec_index_no]["InstanceId"] =  ha_info["secondary"]["InstanceId"];
            primary_instance.push(ha_info["primary"]["Interfaces"][index]);
            secondary_instance.push(ha_info["secondary"]["Interfaces"][sec_index_no]);
            //AttachandDetachAWS_API(index,sec_index_no);
        //}
    }
    console.log("primary object :",primary_instance);
    console.log("secondary object :",secondary_instance);
    if(ha_role === "primary"){
         GetStatusOfInterfaces(1);
    }   
    else {
        setTimeout(function(){
            GetStatusOfInterfaces(3);
        },65000);
    }
}

function AssociateMACAddresstoUDEV()
{
    var fs = require('fs');
    var udev_filename = "/etc/udev/rules.d/100-admin-net-aws-ha.rules"
    var stream = fs.createWriteStream(udev_filename);
    console.log("Writing MAC address to udev");
    console.log("Creating File : /etc/udev/rules.d/100-admin-net-aws-ha.rules");
    stream.once('open', function(fd) {
    for(var index=0;index<ha_info["secondary"]["Interfaces"].length;index++){
        if(ha_role === "primary")
        {
            if((ha_info["secondary"]["Interfaces"][index]["DeviceIndex"] === 1) && (ha_link_config["tn-la0"] === ha_info["secondary"]["Interfaces"][index]["PrivateIpAddress"])){
                stream.write("SUBSYSTEM==\"net\", DRIVERS==\"vif\", NAME=\"tn-la0\", ATTR{address}==\""+ha_info["secondary"]["Interfaces"][index]["MAC"]+"\"\n");
                stream.write("SUBSYSTEM==\"net\", DRIVERS==\"ixgbevf\", NAME=\"tn-la0\", ATTR{address}==\""+ha_info["secondary"]["Interfaces"][index]["MAC"]+"\"\n");
            }
            else if((ha_info["secondary"]["Interfaces"][index]["DeviceIndex"] === 2) && (ha_link_config["tn-wa0"] === ha_info["secondary"]["Interfaces"][index]["PrivateIpAddress"])){
                stream.write("SUBSYSTEM==\"net\", DRIVERS==\"vif\", NAME=\"tn-wa0\", ATTR{address}==\""+ha_info["secondary"]["Interfaces"][index]["MAC"]+"\"\n");
                 stream.write("SUBSYSTEM==\"net\", DRIVERS==\"ixgbevf\", NAME=\"tn-wa0\", ATTR{address}==\""+ha_info["secondary"]["Interfaces"][index]["MAC"]+"\"\n");
            }
        }
        else
        {   
            if((ha_info["secondary"]["Interfaces"][index]["DeviceIndex"] === 1) && (ha_link_config["tn-la0"] != ha_info["secondary"]["Interfaces"][index]["PrivateIpAddress"])){
                stream.write("SUBSYSTEM==\"net\", DRIVERS==\"vif\", NAME=\"tn-la0\", ATTR{address}==\""+ha_info["secondary"]["Interfaces"][index]["MAC"]+"\"\n");
                stream.write("SUBSYSTEM==\"net\", DRIVERS==\"ixgbevf\", NAME=\"tn-la0\", ATTR{address}==\""+ha_info["secondary"]["Interfaces"][index]["MAC"]+"\"\n");
            }
            else if((ha_info["secondary"]["Interfaces"][index]["DeviceIndex"] === 2) && (ha_link_config["tn-wa0"] != ha_info["secondary"]["Interfaces"][index]["PrivateIpAddress"])){
                stream.write("SUBSYSTEM==\"net\", DRIVERS==\"vif\", NAME=\"tn-wa0\", ATTR{address}==\""+ha_info["secondary"]["Interfaces"][index]["MAC"]+"\"\n");
                 stream.write("SUBSYSTEM==\"net\", DRIVERS==\"ixgbevf\", NAME=\"tn-wa0\", ATTR{address}==\""+ha_info["secondary"]["Interfaces"][index]["MAC"]+"\"\n");
            }
        }
    }
    console.log("Done writing rules to file /etc/udev/rules.d/100-admin-net-aws-ha.rules");
    stream.end();
    PrepareObjects();
    });
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
            console.log('Error while fetching secondary_instance ID',err, err.stack); // an error occurred
        else
        {
            if(data["NetworkInterfaces"].length != 0 ) {
                sec_instance_id = data["NetworkInterfaces"][0]["Attachment"]["InstanceId"];
                console.log("secondary instance id :",sec_instance_id);
                DescribeInstance(sec_instance_id, "secondary");
            }
            else {
                console.log("couldnt find the peer instance with ip:", interface_ip);
            }

        }
    });
}

function CheckForInterfaces_la0_wa0()
{
    var role = "primary";
    var interface_ip ;
    var count = 0;
    for(var link_name in ha_link_config)
    {
        //console.log("Link Name Before -->",link_name);
        if(!(link_name.indexOf("tn-la0")) || !(link_name.indexOf("tn-wa0")))
        {
            for(var index=0;index<ha_info["primary"]["Interfaces"].length;index++){
                //console.log("Interface Private IP address -->",ha_info[role]["Interfaces"][index]["PrivateIpAddress"]);
                //console.log("HA LINK CONFIG IP address -->",ha_link_config[link_name]);
                if(ha_info["primary"]["Interfaces"][index]["PrivateIpAddress"] == ha_link_config[link_name]){
                    console.log("Link Name & IP Found in Primary object :",link_name);
                    //ha_info[role]["Interfaces"][index]["IsAvailableOnPrimary"] = 1;
                    count = count+1;
                    // console.log("ha_info Final -->",ha_info[role]["Interfaces"][index]);
                }
            }
        }
    }
    console.log("Interface match count :",count);
    console.log("Primary Object count :",ha_info["primary"]["Interfaces"].length);
    if(ha_info["primary"]["Interfaces"].length == count){
        console.log("All NIC's are available to primary, This means we dont need to swap !");
        console.log("Exiting from the process");
        return;
    }
    else if("ha-other" in ha_link_config){
        interface_ip = ha_link_config["ha-other"];
        console.log("Interface IP to search :",interface_ip);
        DescribeInterfaceIP(interface_ip);
    }
}

function CheckForInterfaces_la0_wa0_secondary()
{
    var role = "primary";
    var interface_ip ;
    var interface_count = 0;
    for(var link_name in ha_link_config)
    {
        //console.log("Link Name Before -->",link_name);
        if(!(link_name.indexOf("tn-la0")) || !(link_name.indexOf("tn-wa0")))
        {
            for(var index=0;index<ha_info["primary"]["Interfaces"].length;index++){
                //console.log("Interface Private IP address -->",ha_info[role]["Interfaces"][index]["PrivateIpAddress"]);
                //console.log("HA LINK CONFIG IP address -->",ha_link_config[link_name]);
                if(ha_info["primary"]["Interfaces"][index]["PrivateIpAddress"] == ha_link_config[link_name]){
                    console.log("Link Name & IP Found in Primary object :",link_name);
                    //ha_info[role]["Interfaces"][index]["IsAvailableOnPrimary"] = 1;
                    interface_count = interface_count+1;
                    // console.log("ha_info Final -->",ha_info[role]["Interfaces"][index]);
                }
            }
        }
    }
    console.log("Interface match count :",interface_count);
    console.log("Primary Object count :",ha_info["primary"]["Interfaces"].length);
    if(interface_count === 0){
        console.log("All NIC's are available to secondary, This means we dont need to swap !");
        console.log("Exiting from the process");
        return;
    }
    else if("ha-other" in ha_link_config){
        interface_ip = ha_link_config["ha-other"];
        console.log("Interface IP to search :",interface_ip);
        DescribeInterfaceIP(interface_ip);
    }
}

function RemoveHAandManagement()
{
    var role = "primary";
    //console.log("Inside Compare ha_info1",ha_info1);
    for (var key in ha_link_config)
    {
        console.log("Instance T2 APP Links config key, value : ",key,ha_link_config[key]);
    }
    for(var index=0;index<ha_info[role]["Interfaces"].length;index++) {
        if((ha_info[role]["Interfaces"][index]["DeviceIndex"] === 0) || (ha_info[role]["Interfaces"][index]["PrivateIpAddress"] === ha_link_config["tn-ha1"]) || (ha_info[role]["Interfaces"][index]["PrivateIpAddress"] == ha_link_config["tn-ha2"])){
            ha_info[role]["Interfaces"].splice(index,1);
            index--;
        }
    }
    for(index=0;index<ha_info[role]["Interfaces"].length;index++) {
        console.log("After removing HA and Management Interfaces info :",ha_info[role]["Interfaces"][index])
    }
    if(ha_role === "secondary")
        CheckForInterfaces_la0_wa0_secondary();
    else
        CheckForInterfaces_la0_wa0();
}

function DescribeInstance(instance_id,role)
{
    var describe_param = {
        InstanceIds:[instance_id],
        DryRun: false
    }
    console.log("role :",role);
    ec2.describeInstances(describe_param,function(err,data){
        if(err){
            console.log("Error in describeInstances API",err.stack);
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
                if(network_interfaces[index].hasOwnProperty('Association')){
                    InterfaceList["PublicIpAddress"] = network_interfaces[index]["Association"]["PublicIp"];
                }
                else{
                    InterfaceList["PublicIpAddress"] = "undefined";
                }
                InterfaceList["DeviceIndex"] = network_interfaces[index]["Attachment"]["DeviceIndex"];
                InterfaceList["AttachmentId"] = network_interfaces[index]["Attachment"]["AttachmentId"];
                //InterfaceList["IsAvailableOnPrimary"] = 0;
                ha_info[role]["Interfaces"].push(InterfaceList);
                console.log("Instance object : ",ha_info[role]["Interfaces"][index]);
            }
            if(role === "primary"){
                RemoveHAandManagement();
            }
            else {
                AssociateMACAddresstoUDEV();
            }
        }
    });
}

function MetaRequest()
{
    meta.request("/latest/meta-data/instance-id", function(err, data_id){
        if(err)
            console.log("Error in fetching meta-data needed for getting instance-id",err.stack);
         else{
            instance_id = data_id;
            console.log("InstanceID of the Instance:",instance_id);
            DescribeInstance(instance_id,"primary");
        }
    });
}

// Load the SDK and UUI
//AWS.config.loadFromPath('/home/adminuser/aws-sdk/config.json');
//ec2 = new AWS.EC2();
var AWS,ec2;
AWS = require('aws-sdk');
var meta  = new AWS.MetadataService();
var ha_role ;

var args = process.argv.slice(2);
console.log(" ******************************* started logging ************************************ ");
if(args[0] === "--primary"){
    ha_role = "primary";
    console.log("Role taken --> Primary");
}
else if(args[0] === "--secondary"){
    ha_role = "secondary"
    console.log("Role taken --> Secondary");
}
else
    console.log("Invalid argument !, try again");

meta.request("/latest/meta-data/placement/availability-zone",function(err,data){
    if(err)
            console.log(err);
    else{
            console.log(data);
            str = data.substring(0, data.length - 1);
            console.log("Region of the Instance:",str);
            AWS.config.update({region:str});
            ec2 = new AWS.EC2();
            MetaRequest();
        }
});
