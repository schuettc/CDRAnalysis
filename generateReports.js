
const AWS = require('aws-sdk');
const util = require('util');
const mysql = require('mysql2/promise');

const sns = new AWS.SNS();

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

var connectorBillableSeconds = 0;
var connectorCost = 0;
var totalCosts = [];
var connectorTotal = {};
var message = "";

async function sendSNS(totalCosts) {
    totalCosts.forEach (obj => {
        message += "Voice Connector ID: " + obj.voiceConnectorId + "\n";
        message += "Voice Connector Seconds: " + obj.voiceConnectorSeconds + "\n";
        message += "Voice Connector Cost: " + obj.voiceConnectorCost + "\n";
        message += "----------------------------------\n";
    })
    var params = {
        Message: message,
        TopicArn: 'arn:aws:sns:us-east-1:104621577074:DailyVoiceConnectorReport'
    };

    // Create promise and SNS service object
    var publishSNS = await sns.publish(params).promise();
    return publishSNS;
}

async function queryDay(connection, voiceconnector) {
    console.log(voiceconnector)
    try {
        const sql = "SELECT * FROM CallDetail WHERE CONVERT_TZ(timestamp, 'UTC', '+6:00') BETWEEN CURDATE() - INTERVAL 1 DAY AND CURDATE() - INTERVAL 1 SECOND AND VoiceConnectorId = ?;";
        console.log("sql: ", sql);
        var response = await connection.query(sql, voiceconnector.VoiceConnectorId);
    } catch (error) {
        console.log(error);
    }
    var recordsFromYesterday = JSON.parse(JSON.stringify(response[0]));
    console.log("recordsFromYesterday: ", recordsFromYesterday);
    return recordsFromYesterday;
}

async function queryConnectors(connection) {
    try {
        const sql = "SELECT DISTINCT VoiceConnectorId FROM CallDetail;";
        console.log("sql: ", sql);
        var response = await connection.query(sql);
    } catch (error) {
        console.log(error);
    }
    var voiceConnectors = JSON.parse(JSON.stringify(response[0]));
    return voiceConnectors;
}


exports.handler = async function(event, context, callback) {
    const connection = await mysql.createConnection(mysqlParams);
    const voiceConnectors = await queryConnectors(connection);

    for (const voiceconnector of voiceConnectors) {
        connectorBillableSeconds = 0;
        connectorCost = 0; 
                
        console.log(voiceconnector.VoiceConnectorId);
        const recordsFromYesterday = await queryDay(connection, voiceconnector);
            recordsFromYesterday.forEach(obj => {
                connectorBillableSeconds += Number(obj.BillableDurationSeconds);
                connectorCost += Number(obj.CallCost);
        });
        connectorTotal = { voiceConnectorId: voiceconnector.VoiceConnectorId, voiceConnectorSeconds: connectorBillableSeconds, voiceConnectorCost: connectorCost };
        totalCosts.push(connectorTotal);
    }
    
    console.log("totalCosts: ", totalCosts);


    await sendSNS(totalCosts);
  
};