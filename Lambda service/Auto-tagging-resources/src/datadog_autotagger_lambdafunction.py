from __future__ import print_function
import json
import boto3
import logging
import time
import datetime
import os
import base64

from datadog import initialize, api
from datadog.api.constants import CheckStatus

logger = logging.getLogger()
logger.setLevel(logging.INFO)
client = boto3.client('ec2')
kms_client = boto3.client('kms')    
dataList = []
tagList = []
data = []

ENCRYPTED_DATADOG_KEYS = os.environ['DATADOG_API_KEY']
# Decrypt code should run once and variables stored outside of the function
# handler so that these are decrypted once per container
DECRYPTED_API_KEY = kms_client.decrypt(CiphertextBlob=base64.b64decode(ENCRYPTED_DATADOG_KEYS))['Plaintext']
datadogKeysJson = json.loads(DECRYPTED_API_KEY)

def initializeKeys():
    
    if ("api_key" in datadogKeysJson) and ("app_key" in datadogKeysJson):
        datadogApiKeys = {
            "api_key": datadogKeysJson["api_key"],
            "app_key": datadogKeysJson["app_key"]
        }
        initialize(**datadogApiKeys)
    else:
        logger.info("No keys found :" + str(datadogKeysJson))
        raise Exception("No keys found :" + str(datadogKeysJson))

# Datadog API to tag instances only in datadog perspective not on AWS
def createTagsDataDog(instanceId,dataDogTagList=[]):

    logger.info("Inside create Tags for DataDog!")
    count=1
    while (count < 10):
        logger.info("Retry Count:{}".format(count))
        logger.info("InstanceId:{}".format(instanceId))
        resp = api.Tag.get(instanceId)
        logger.info("Response : " + str(resp))
        if "tags" in resp :
            logger.info("Before Tags of instance" +  instanceId + "is :" + str(api.Tag.get(instanceId)))
            api.Tag.create(instanceId, tags=dataDogTagList, source = "API")
            logger.info("After creating Tags of instance"+  instanceId + "is :" +str(api.Tag.get(instanceId)))
            break
        else:
            logger.info("Inside errors !!!")
            count = count+1
            time.sleep(10)

    if(count >= 10):
        raise Exception(" It is taking longer time than expected from datadog, Aborting !")

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

def appendDetails(keyname):
    global data
    dictVariables = {
        'Hypervisor'   : 'hypervisor',
        'VirtualizationType'   : 'virtualization-type',
        'EbsOptimized' : 'ebs-optimized',
        'KeyName'      : 'key-name',
        'EnaSupport'   : 'ena-enabled',
        'PrivateIpAddress' : ' mgmt-ip'
    }
    keyvalue= "None"
    logger.info("keyname: {}".format(keyname))
    if keyname in data:
        keyvalue = data[keyname]
        logger.info("keyvalue: {}".format(keyvalue))
        if type(keyvalue) == bool :
            keyvalue = str(keyvalue)
        dataList.append({'Key': keyname,'Value': keyvalue})
        tagList.append(dictVariables[keyname]+":"+keyvalue)
    else:
        logger.warning("keyvalue: {}".format(keyvalue))     
 

def describeInstances(instanceId,user):

    logger.info("Inside Describe Instances!\n")
    response = client.describe_instances(InstanceIds=[instanceId])
    resp = response["Reservations"]
    global data

    for item in resp:

        data = item['Instances'][0]
        placement = data['Placement']

        appendDetails("KeyName")
        appendDetails("Hypervisor")
        appendDetails("VirtualizationType")
        appendDetails("EnaSupport")
        appendDetails("EbsOptimized")
        appendDetails("PrivateIpAddress")
        
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

        if "NetworkInterfaces" in data:
            getIpDetails(data['NetworkInterfaces'])
        else:
            logger.warning("NetworkInterfaces: {}\n".format("No Interfaces attached"))

        #This dataList can be used to assign tags to instance on AWS you should just need to pass dataList to the API
        dataList.append({'Key': "SubnetId",'Value': subnetId})
        dataList.append({'Key': "SubnetName",'Value': subnetName})
        dataList.append({'Key': "VpcId",'Value': vpcId})
        dataList.append({'Key': "VpcName",'Value': vpcName})
        dataList.append({'Key': "Tenancy",'Value': tenancy})
        dataList.append({'Key': "IamUser",'Value': user})

        #Preparing List for DataDog
        tagList.append("subnet-id:"+subnetId)
        tagList.append("subnet-name:"+subnetName)
        tagList.append("vpc-id:"+vpcId)
        tagList.append("vpc-name:"+vpcName)
        tagList.append("tenancy:"+tenancy)
        tagList.append("iamuser:"+user)

        logger.info("Final Datalist: {}".format(dataList))
        logger.info("Final taglist for DataDog: {}".format(tagList))
        createTagsDataDog(instanceId,tagList)
        #deleteTagsDataDog(instanceId)


def lambda_handler(event, context):
    logger.info('Event: ' + str(event))
    ids = []
    initializeKeys()

    try:
        region = event['region']
        detail = event['detail']
        eventname = detail['eventName']
        principal = detail['userIdentity']['principalId']
        userType = detail['userIdentity']['type']
    
        if userType == 'IAMUser':
            user = detail['userIdentity']['userName']
        else:
            user = principal.split(':')[1]
    
        logger.info('principalId: ' + str(principal))
        logger.info('region: ' + str(region))
        logger.info('eventName: ' + str(eventname))
        logger.info('detail: ' + str(detail))
    
        if (eventname == 'RebootInstances') and (detail['requestParameters']):
            requestParam = 'requestParameters'
        elif (eventname == 'RunInstances') and (detail['responseElements']):
            requestParam = 'responseElements'
        else:
            logger.warning('No response or supported action found')
            if detail['errorCode']:
                logger.error('errorCode: ' + detail['errorCode'])
            if detail['errorMessage']:
                logger.error('errorMessage: ' + detail['errorMessage'])
            return False

        items = detail[requestParam]['instancesSet']['items']
        for item in items:
            ids.append(item['instanceId'])
        logger.info(ids)
        logger.info('number of instances: ' + str(len(ids)))        
    
        if ids:
            for resourceid in ids:
                logger.info('Tagging resource ' + str(resourceid))
                describeInstances(resourceid,user)
        logger.info(' Remaining time (ms): ' + str(context.get_remaining_time_in_millis()) + '\n')
        return True
    except Exception as e:
        logger.error('Something went wrong: ' + str(e))
        return False