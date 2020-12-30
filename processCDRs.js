
const AWS = require('aws-sdk');
const util = require('util');
const mysql = require('mysql2/promise');

const DBHost = process.env.DATABASE_HOST;
const DBUser = process.env.DATABASE_USER;
const DBPassword = process.env.DATABASE_PASSWORD;

// get reference to S3 client
const s3 = new AWS.S3();
const mysqlParams = {
    host: DBHost,
    port: 3306,
    user: DBUser,
    password: DBPassword,
    database: "CDRs"
};

async function downloadCDR(event) {
    const srcBucket = event.Records[0].s3.bucket.name;
    const srcKey    = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    try {
        const params = {
            Bucket: srcBucket,
            Key: srcKey
        };
        var callDetailRecord = await s3.getObject(params).promise();
    } catch (error) {
        console.log(error);
    }
    return callDetailRecord;
}

async function uploadCDR(connection, callDetailRecord, priceComponents) {
    try {
        const parsedCallDetailRecord = JSON.parse(callDetailRecord.Body.toString());
        const sql = "INSERT INTO CallDetail (AwsAccountId,TransactionId,CallId,VoiceConnectorId,Status,StatusMessage,BillableDurationSeconds,DestinationPhoneNumber,DestinationCountry,SourcePhoneNumber,SourceCountry,UsageType,ServiceCode,Direction,StartTimeEpochSeconds,EndTimeEpochSeconds,Region,Streaming,CallCost,CostPerminute,Currency) VALUES ('" + parsedCallDetailRecord.AwsAccountId + "','" + parsedCallDetailRecord.TransactionId + "','" + parsedCallDetailRecord.CallId + "','" + parsedCallDetailRecord.VoiceConnectorId + "','" + parsedCallDetailRecord.Status + "','" + parsedCallDetailRecord.StatusMessage + "','" + parsedCallDetailRecord.BillableDurationSeconds + "','" + parsedCallDetailRecord.DestinationPhoneNumber + "','" + parsedCallDetailRecord.DestinationCountry + "','" + parsedCallDetailRecord.SourcePhoneNumber + "','" + parsedCallDetailRecord.SourceCountry + "','" + parsedCallDetailRecord.UsageType + "','" + parsedCallDetailRecord.ServiceCode + "','" + parsedCallDetailRecord.Direction + "','" + parsedCallDetailRecord.StartTimeEpochSeconds + "','" + parsedCallDetailRecord.EndTimeEpochSeconds + "','" + parsedCallDetailRecord.Region + "','" + parsedCallDetailRecord.Streaming + "','" + priceComponents.callCost + "','" + priceComponents.pricePerMinute + "','" + priceComponents.currency + "')";
        console.log("sql: ", sql);
        var response = await connection.query(sql);
    } catch (error) {
        console.log(error);
    }
    var responseP = JSON.parse(JSON.stringify(response[0]));
    return responseP;
}

async function getPrices(callDetailRecord) {
    var parsedCallDetailRecord = JSON.parse(callDetailRecord.Body.toString());
    // console.log("getPrices CDR: ", parsedCallDetailRecord);
    var params = {
        Filters: [
            {
                Field: "ServiceCode",
                Type: "TERM_MATCH",
                Value: "AmazonChimeVoiceConnector"
            },
            {
                Field: "usagetype",
                Type: "TERM_MATCH",
                Value: parsedCallDetailRecord.UsageType
            }
        ],
        MaxResults: 1,
        ServiceCode: "AmazonChimeVoiceConnector"
    };
    var pricing = new AWS.Pricing({
        apiVersion: '2017-10-15',
        region: 'us-east-1',
    }).getProducts(params);
    
    var promise = pricing.promise();
    
    promise.then(
        function(data) {
            // console.log("pricing data: ", data);
            return data;
        },
        function(error) {
            console.log(error);
        }
    );
    // console.log(promise);
    return promise;
}

exports.handler = async function(event, context, callback) {
    const connection = await mysql.createConnection(mysqlParams);
    const callDetailRecord = await downloadCDR(event);
    const pricing = await getPrices(callDetailRecord);
    console.log("main pricing: ", pricing);

    var parsedCallDetailRecord = JSON.parse(callDetailRecord.Body.toString());    
    var sku = Object.keys(pricing.PriceList[0].terms.OnDemand);
    var rateCode = Object.keys(pricing.PriceList[0].terms.OnDemand[sku].priceDimensions);
    var currency = Object.keys(pricing.PriceList[0].terms.OnDemand[sku].priceDimensions[rateCode].pricePerUnit);
    var pricePerMinute = pricing.PriceList[0].terms.OnDemand[sku].priceDimensions[rateCode].pricePerUnit[currency];
    const callCost = pricePerMinute * parsedCallDetailRecord.BillableDurationSeconds;
    var priceComponents = {"currency": currency, "pricePerMinute": pricePerMinute, "callCost": callCost};
    console.log("priceComponents: ", priceComponents);      

    const uploadStatus = await uploadCDR(connection, callDetailRecord, priceComponents);
    return uploadStatus;
};