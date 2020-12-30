
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
    password: DBPassword
};

async function createTable(connection) {
    try {
        const sql = "CREATE TABLE IF NOT EXISTS 'CDRs' ( 'id' INT AUTOINCREMENT PRIMARY, AwsAccountId VARCHAR(45), TransactionId VARCHAR(45), CallId VARCHAR(45), VoiceConnectorId VARCHAR(45), Status VARCHAR(45), StatusMessage VARCHAR(45), BillableDurationSeconds VARCHAR(45), SourcePhoneNumber VARCHAR(45), DestinationPhoneNumber VARCHAR(45), SourceCountry VARCHAR(45), DestinationCountry VARCHAR(45), UsageType VARCHAR(45), ServiceCode VARCHAR(45), Direction VARCHAR(45), StartTimeEpochSeconds VARCHAR(45), EndTimeEpochSeconds VARCHAR(45), Region VARCHAR(45), Streaming VARCHAR(45), CallCost DECIMAL(10,10), CostPerMinute DECIMAL(10,10), Currency VARCHAR(45), timestamp TIMESTAMP);" 
        console.log("sql: ", sql);
        var response = await connection.query(sql);
    } catch (error) {
        console.log(error);
    }
    var responseP = JSON.parse(JSON.stringify(response[0]));
    return responseP;
}

exports.handler = async function(event, context, callback) {
    const connection = await mysql.createConnection(mysqlParams);
    const tableCreation = await createTable(connection);
    return tableCreation;
}
