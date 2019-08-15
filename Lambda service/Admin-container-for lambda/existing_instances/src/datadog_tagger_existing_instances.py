import json
import boto3
import logging
import time
import datetime
import subprocess
from datadog import initialize, api

logger = logging.getLogger()

logging.basicConfig(
    filename='loggingsdk_executeinlab_withsource.log',
    level=logging.INFO,
    format='%(asctime)s.%(msecs)03d %(levelname)s %(module)s - %(funcName)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)

datadogApiKeys = {
        'api_key': 'dc2c0d3122a6bf9cbd3b1d19d9abba21',
        'app_key': '16fd5bfbfce0d68d91131b264109781e9b71c71d'
    }
initialize(**datadogApiKeys)

# Datadog API to tag instances only in datadog perspective not on AWS
def createTagsDataDog(instanceId,dataDogTagList=[]):

    logger.info("Inside create Tags for DataDog!")
    logger.info("Before Tags of instance" +  instanceId + "is :" + str(api.Tag.get(instanceId)))
    api.Tag.create(instanceId, tags=dataDogTagList, source = "API")
    logger.info("After creating Tags of instance"+  instanceId + "is :" +str(api.Tag.get(instanceId)))

# Datadog API to remove tags on instances only in datadog perspective not on AWS

def deleteTagsDataDog(instanceId):
    logger.info("Inside delete Tags for DataDog!")
    logger.info("Before Tags of instance" +  instanceId + "is :" + str(api.Tag.get(instanceId)))
    api.Tag.delete(instanceId)
    logger.info("After deleting Tags of instance"+  instanceId + "is :" +str(api.Tag.get(instanceId)))

# AWS API to tag instances , awstagList forms all the required objects for a instance at once 
def createTagsAWS(instanceId,awstagList=[]):

    logger.info("Insdie create Tags !")
    resp = client.create_tags(
        Resources=[instanceId],
        Tags = awstagList
    )
    logger.info("Response for create_tags:" + str(resp))

dictVpcNames = {}
def getVpcNameFromId(vpcId):
    vpcName = "None"

    if vpcId in dictVpcNames:
        logger.info("From Hash :" + dictVpcNames[vpcId])
        vpcName = dictVpcNames[vpcId]
    else:  
        response = client.describe_vpcs(
            VpcIds=[vpcId]
        )
        if "Tags" in response["Vpcs"][0] :
            if response["Vpcs"][0]["Tags"][0]["Key"] == "Name" :
                dictVpcNames[vpcId] = response["Vpcs"][0]["Tags"][0]["Value"]
                vpcName = response["Vpcs"][0]["Tags"][0]["Value"]
                logger.info("From API VpcName:" + vpcName)

    return vpcName

dictSubnetNames = {}
def getSubnetNameFromId(subnetId):
    subnetName = "None"

    if subnetId in dictSubnetNames:
        logger.info("From Hash :" + dictSubnetNames[subnetId])
        subnetName = dictSubnetNames[subnetId]
    else:  
        response = client.describe_subnets(
            SubnetIds=[subnetId]
        )
        if "Tags" in response["Subnets"][0] :
            if response["Subnets"][0]["Tags"][0]["Key"] == "Name" :
                dictSubnetNames[subnetId] = response["Subnets"][0]["Tags"][0]["Value"]
                subnetName = response["Subnets"][0]["Tags"][0]["Value"]
                logger.info("From API VpcName:" + subnetName)
    
    return subnetName

def getIpDetails(networkInterfacesList):

    logger.info("Inside getIpDetails \n")
    for item in networkInterfacesList:
        if "PrivateIpAddresses" in item:
            for index in range(len(item["PrivateIpAddresses"])):
                ip = item["PrivateIpAddresses"][index]["PrivateIpAddress"]
                dataList.append({'Key': "Ip",'Value':ip})
                tagList.append("ip:"+ip)
        
        if "Association" in item:
            eip = item["Association"]["PublicIp"]
            dataList.append({'Key': "ElasticIp",'Value':eip})
            tagList.append("eip:"+eip)

def describeInstances():
    count = 0
    logger.info("Inside Describe Instances!\n")
    response = client.describe_instances()
    resp = response["Reservations"]
    #respprint=json.loads(resp)

    for item in resp:
        dataList.clear()
        tagList.clear()
        subnetId = vpcId = tenancy = hypervisor = virtualizationType = mgmtIp = "None"
        ebs = ena = keyName = vpcName = subnetName = "None"
        data = item['Instances'][0]
        placement = data['Placement']
        
        if "KeyName" in data:
            logger.info("KeyName: {}".format(data['KeyName']))
            keyName=data['KeyName']
        else:
            logger.warning("KeyName: {}".format("Not Assigned, mostly unlikely"))
        
        if "Hypervisor" in data:
            logger.info("Hypervisor: {}".format(data['Hypervisor']))
            hypervisor = data['Hypervisor']      
        else:
            logger.info("Hypervisor: {}".format("None"))
        
        if "VirtualizationType" in data:
            logger.info("VirtualizationType: {}".format(data['VirtualizationType']))
            virtualizationType = data['VirtualizationType']      
        else:
            logger.info("VirtualizationType: {}".format("None"))
        
        if "Tenancy" in placement:
            logger.info("Tenancy: {}".format(placement['Tenancy']))
            tenancy = placement['Tenancy']      
        else:
            logger.info("Tenancy: {}".format("Not Assigned"))
        
        if "SubnetId" in data:
            logger.info("SubnetId: {}".format(data['SubnetId']))
            subnetId = data['SubnetId']
            subnetName = getSubnetNameFromId(subnetId)      
        else:
            logger.info("SubnetId: {}".format("None"))

        if "VpcId" in data:
            logger.info("VpcId: {}".format(data['VpcId']))
            vpcId = data['VpcId']
            vpcName = getVpcNameFromId(vpcId)      
        else:
            logger.info("VpcId: {}".format("None, Very Unusual"))
        
        if "InstanceId" in data:
            logger.info("InstanceId: {}".format(data['InstanceId']))
            instanceId = data['InstanceId']
        else:
            logger.warning("InstanceId: {}".format("None, Very Unusual"))
        
        if "EnaSupport" in data:
            logger.info("EnaSupport: {}".format(data['EnaSupport']))
            ena=str(data['EnaSupport'])
        else:
            logger.warning("EnaSupport: {}".format("Not Eligible"))
            
        if "EbsOptimized" in data:
            logger.info("EbsOptimized: {} \n".format(data['EbsOptimized']))
            ebs=str(data['EbsOptimized'])
        else:
            logger.warning("EbsOptimized: {}\n".format("Not Eligible"))

        if "NetworkInterfaces" in data:
            #logger.info("NetworkInterfaces: {} \n".format(data['NetworkInterfaces']))
            getIpDetails(data['NetworkInterfaces'])
        else:
            logger.warning("NetworkInterfaces: {}\n".format("No Interfaces attached"))

        if "PrivateIpAddress" in data:
            logger.info("MgmtIp: {}".format(data['PrivateIpAddress']))
            mgmtIp = data['PrivateIpAddress']
        else:
            logger.warning("MgmtIp: {}".format("None, Very Unusual"))

        #This dataList can be used to assign tags to instance on AWS you should just need to pass dataList to the API
        dataList.append({'Key': "SubnetId",'Value': subnetId})
        dataList.append({'Key': "SubnetName",'Value': subnetName})
        dataList.append({'Key': "VpcId",'Value': vpcId})
        dataList.append({'Key': "VpcName",'Value': vpcName})
        dataList.append({'Key': "KeyName",'Value': keyName})
        dataList.append({'Key': "Hypervisor",'Value': hypervisor})
        dataList.append({'Key': "VirtualizationType",'Value': virtualizationType})   
        dataList.append({'Key': "Tenancy",'Value': tenancy})
        dataList.append({'Key': "EnaSupport",'Value': ena})
        dataList.append({'Key': "EbsOptimized",'Value': ebs})
        dataList.append({'Key': "ManagementIp",'Value': mgmtIp})

        #Preparing List for DataDog

        tagList.append("subnet-id:"+subnetId)
        tagList.append("subnet-name:"+subnetName)
        tagList.append("vpc-id:"+vpcId)
        tagList.append("vpc-name:"+vpcName)
        tagList.append("key-name:"+keyName)
        tagList.append("hypervisor:"+hypervisor)
        tagList.append("virtualization-type:"+virtualizationType)
        tagList.append("ebs-optimized:"+ebs)
        tagList.append("ena-enabled:"+ena)
        tagList.append("tenancy:"+tenancy)
        tagList.append("mgmt-ip:"+mgmtIp)
        
        #dataList = {'Key': "EnaSupport",'Value': "enaSupport"},{'Key': "EbsOptimized",'Value': "ebsOptimized"}
        #flist = json.dumps(dataList)
        #awslist = json.loads(flist)

        logger.info("Instance count:{}".format(count))
        count=count+1
        logger.info("Final Datalist: {}".format(dataList))
        logger.info("Final taglist for DataDog: {}".format(tagList))
        #createTagsDataDog(instanceId,tagList)
        #deleteTagsDataDog(instanceId)

dataList = []
tagList = []
client = {}
logger.info("Started process !")
try:
    client = boto3.client('ec2')
    resp = client.describe_regions()
    rp = resp["Regions"]
    for item in rp:
        logger.info("Executing script in region : {}".format(item["RegionName"]))
        client = boto3.client('ec2', region_name=item["RegionName"])
        describeInstances()
        logger.info("ended!!!")
except Exception as e:
    logger.error("Something went wrong:" + str(e))