FROM centos:centos7.5.1804

# CentOS Dockage image is fairly stripped down and is by default
# configured to not install man pages. Re-enable installing man pages
# by removing the 'nodocs' option.
RUN sed -i 's/nodocs//g' /etc/yum.conf

RUN yum-config-manager --disable updates

# Install basics
RUN yum -y install \
    man \
    bzip2 \
    tar \
    zip \
    unzip \
    curl \
    which \
    less \
    wget \
    git

# Install admin conveniences
RUN yum -y install \
    bash-completion \
    vim \
    openssh-clients

## Install terraform
COPY install-terraform.sh /install-terraform.sh
RUN sh /install-terraform.sh

# Mountpoints where a environment deploy root should be mounted.
RUN mkdir -p /deploy
VOLUME ["/deploy"]

# Volume for aws credentials
VOLUME ["/root/.aws"]

COPY bashrc /root/.bashrc

RUN mkdir -p /root/admin
COPY adminrc /root/admin/
COPY WELCOME /root/admin/
COPY admin.terraform.sh /root/admin/
COPY admin.aws.sh /root/admin/
COPY admin.datadog.sh /root/admin/

WORKDIR /deploy

COPY entrypoint /entrypoint
RUN chmod +x /entrypoint
ENTRYPOINT ["/entrypoint"]
