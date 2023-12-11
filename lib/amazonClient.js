"use strict";

var amazonClient = require("aws-sdk");
var https = require("https");
var q = require("q");

var host = 'sdf-services-proxy-4f9720fcd964.herokuapp.com';
var basePath = "/aws/s3";
var auth = "winehub:wineh*ub-ksd5fj66i^^osd5vf1*$vlmm";

/**
 * @param {string} _amazoneClientConfig config to connect to amazon client
 * @return {object} amazon s3 client
 */

module.exports.getS3Client = function getS3Client(_amazoneClientConfig) {
    amazonClient.config.update(_amazoneClientConfig);
    var client = new amazonClient.S3();

    return client;
}

module.exports.s3GetObject = function s3GetObject(bucket, fileKey, region) {
    var deferred = q.defer();

    var pathAndQuery = basePath;
    pathAndQuery += "?bucket=" + bucket;
    pathAndQuery += "&key=" + fileKey;
    pathAndQuery += "&region=" + region;

    var options = {
        host: host,
        path: pathAndQuery,
        method: 'GET',
        auth: auth
    };

    var request = https.request(options, function (res) {
        var data = "";
        res.on('data', function(chunk) {
            data += chunk;
        });
        
        res.on("end", function() {
            if (res.statusCode == 200) {
                deferred.resolve(data);
            } else {
                var err = new Error("s3GetObject Error: " + res.statusCode + ": " + data);
                deferred.reject(err);
            }
        });
    }).on('error', function(err) {
        deferred.reject(err);
    });

    request.end();

    return deferred.promise;
};


module.exports.s3PutObject = function s3PutObject(region, bucket, fileKey, contentType, fileContent, ACL, cacheControl) {
    var deferred = q.defer();
    
    var pathAndQuery = basePath;
    pathAndQuery += "?bucket=" + bucket;
    pathAndQuery += "&key=" + fileKey;
    pathAndQuery += "&region=" + region;

    if (ACL) {
        pathAndQuery += "&acl=" + ACL;
    }

    if (cacheControl) {
        pathAndQuery += "&cacheControl=" + cacheControl;
    }

    var options = {
        host: host,
        path: pathAndQuery,
        method: 'PUT',
        headers: {
            "content-type": contentType//"text/plain",  // <--Very important!!!
        },
        auth: auth
    };

    var req = https.request(options, function(res) {
        var data = "";
        res.on('data', function(chunk) {
            data += chunk;
        });

        res.on('end', function() {
            if (res.statusCode != 200) {
                deferred.reject("Error " + res.statusCode + ": " + data);
            } else {
                deferred.resolve();
            }
        });
    });

    req.on('error', function(err) {
        deferred.reject(err);
    });

    req.write(fileContent);


    req.end();

    return deferred.promise;
};
