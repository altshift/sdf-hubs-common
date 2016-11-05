"use strict";

const pg = require("pg");

let client, clientPromise;

/**
 * @param {string} _connectionUrl Url to connect to pg server
 * @return {promise} Promise returning a connected client
 */
function pgClient(_connectionUrl) {
    if (!client) {
        client = new pg.Client(_connectionUrl);
    }

    if (!clientPromise) {
        clientPromise = new Promise((_resolve, _reject) => {
            client.connect((_error, _client) => {
                if (_error) {
                    _reject(_error);
                } else {
                    _resolve(_client);
                }
            });
        });
    }

    return clientPromise;
}

module.exports = pgClient;
