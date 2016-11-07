"use strict";

const amazonClient = require("aws-sdk");

/**
 * @param {string} _amazoneClientConfig config to connect to amazon client
 * @return {object} amazon s3 client
 */
function getS3Client(_amazoneClientConfig) {
    amazonClient.config.update(_amazoneClientConfig);
    const client = new amazonClient.S3();

    return client;
}

module.exports = {getS3Client};
