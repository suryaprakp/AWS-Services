# Description
- This file is used on AWS platforms when High Availablity is turned on ,
- This script take cares of Hot swapping the NIC's b/w active and stand-by VPX pairs .
- We are using AWS API's to do hot swapping of NIC's.
- Changing the UDEV rules is part of the HA design to let process understand interfaces

# Requirements
- nodejs  
- AWS nodejs sdk
- For autentication you need access and secret keys from AWS

Author: Surya Prakash Patel
