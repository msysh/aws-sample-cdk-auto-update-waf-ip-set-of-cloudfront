'use strict';

const axios = require('axios');
const { WAFV2Client,
    ListIPSetsCommand,
    GetIPSetCommand,
    CreateIPSetCommand,
    UpdateIPSetCommand } = require("@aws-sdk/client-wafv2");

const wafv2 = new WAFV2Client();

const NamePrefix = process.env.NAME_PREFIX || 'AutoUpdateWafIpSetOfCloudFront-';
const GlobalCloudFrontIpSetName = `${NamePrefix}CloudFront-Global`;
const RegionalCloudFrontIpSetName = `${NamePrefix}CloudFront-Regional`;

const IpRangeUrl = 'https://ip-ranges.amazonaws.com/ip-ranges.json';

const getIpRange = async () => {
    const response = await axios(IpRangeUrl);
    const globalIps = new Array();
    const regionalIps = new Array();
    response.data.prefixes.forEach(item => {
        if (item.service !== 'CLOUDFRONT') return;
        if (item.region === 'GLOBAL'){
            globalIps.push(item.ip_prefix);
        }
        else{
            regionalIps.push(item.ip_prefix);
        }
    });
    console.debug(`Global IPs : ${globalIps.length}`);
    console.debug(`Regional IPs : ${regionalIps.length}`);

    return { globalIps, regionalIps };
};

const getCurrentIpSet = async () => {
    const command = new ListIPSetsCommand({
        Scope: 'REGIONAL'
    });
    const response = await wafv2.send(command);

    let globalIpSet = undefined;
    let regionalIpSet = undefined;
    response.IPSets.forEach((ipSet) => {
        if (ipSet.Name === GlobalCloudFrontIpSetName) globalIpSet = ipSet;
        else if (ipSet.Name === RegionalCloudFrontIpSetName) regionalIpSet = ipSet;
    });
    console.debug(globalIpSet);
    console.debug(regionalIpSet);

    return { globalIpSet, regionalIpSet };
};

const updateIpSet = async (ipSet, ips, region, updateDate) => {

    let command = new GetIPSetCommand({
        Id: ipSet.Id,
        Name: ipSet.Name,
        Scope: 'REGIONAL'
    });
    let response = await wafv2.send(command);
    let lockToken = response.LockToken;
    console.info(`LockToken : ${lockToken}`);

    command = new UpdateIPSetCommand({
        Addresses: ips,
        Id: ipSet.Id,
        Name: ipSet.Name,
        Description: `CloudFront ${region} IP List / Updated : ${updateDate}`,
        LockToken: lockToken,
        Scope: 'REGIONAL'
    });
    response = await wafv2.send(command);
    lockToken = response.NextLockToken;
    console.debug(`Next LockToken : ${lockToken}`);

    return lockToken;
};

const createIpSet = async (ipSetName, ips, region, updateDate) => {

    const command = new CreateIPSetCommand({
        Addresses: ips,
        IPAddressVersion: 'IPV4',
        Name: ipSetName,
        Description: `CloudFront ${region} IP List / Updated : ${updateDate}`,
        Scope: 'REGIONAL',
    });
    const response = await wafv2.send(command);
    console.debug(response);

    return response;
};

let response;

exports.lambdaHandler = async (event, context) => {
    console.debug(event);

    const updateDate = (new Date()).toISOString();

    let globalIpNum = 0;
    let regionalIpNum = 0;

    await Promise.all([getIpRange(), getCurrentIpSet()])
    .then(([ { globalIps, regionalIps }, { globalIpSet, regionalIpSet } ]) => {

        globalIpNum = globalIps.length;
        regionalIpNum = regionalIps.length;

        console.debug(`Global IP Set : ${globalIpSet}`);
        console.debug(`Regional IP Set : ${regionalIpSet}`);

        let globalIpSetPromise;
        if (globalIpSet){
            globalIpSetPromise = updateIpSet(globalIpSet, globalIps, 'Global', updateDate);
        }
        else{
            globalIpSetPromise = createIpSet(GlobalCloudFrontIpSetName, globalIps, 'Global', updateDate);
        }

        let regionalIpSetPromise;
        if (regionalIpSet){
            regionalIpSetPromise = updateIpSet(regionalIpSet, regionalIps, 'Regional', updateDate);
        }
        else{
            regionalIpSetPromise = createIpSet(RegionalCloudFrontIpSetName, regionalIps, 'Regional', updateDate);
        }

        return Promise.all([globalIpSetPromise, regionalIpSetPromise]);
    })
    .then((data) => {
        console.info(data);

        response = {
            "source": `${NamePrefix}Lambda`,
            "statusCode": 200,
            "status": "success",
            "color": "#00DD00",
            "title": "Successfully updated WAF IP Set of CloudFront",
            "message": `*Status Code* : 200\n*Global IP* : ${globalIpNum}\n*Regional IP* : ${regionalIpNum}\n*Changed at* : ${event['create-time']}\n*Update IP Set at* : ${updateDate}`,
            "changedAt": event['create-time'],
            "updateIpSetAt": updateDate,
            "globalIpNum": globalIpNum,
            "regionalIpNum": regionalIpNum,
            "url": event['url']
        }
    })
    .catch((error) => {
        console.error(error);

        response = {
            "source": `${NamePrefix}Lambda`,
            "statusCode": error['$metadata']['httpStatusCode'],
            "status": "failed",
            "color": "#DD0000",
            "title": "Failed to update WAF IP Set of CloudFront",
            "message": `*Status Code* : ${error['$metadata']['httpStatusCode']}\n*Error* : ${error['__type']}\n*Request ID* : ${error['$metadata']['requestId']}\n*Changed at* : ${event['create-time']}`,
            "changedAt": event['create-time'],
            "errorType": error['__type'],
            "requestId": error['$metadata']['requestId']
        }
    });

    return response;
};

