"use strict";

const tokenStatuses = {
    active: "active",
    inactive: "inactive"
};

const tokenRights = {
    read: "read",
    write: "write"
};

module.exports = {
    adapter: "postgres",
    attributes: {
        host: {type: "string"},
        key: {
            required: true,
            type: "string"
        },
        status: {
            "in": Object.keys(tokenStatuses),
            required: true,
            type: "string"
        },
        usageCount: {
            defaultsTo: false,
            required: true,
            type: "integer"
        },
        usageLimit: {
            required: true,
            type: "integer"
        },
        rights: {
            "in": Object.keys(tokenRights),
            defaultsTo: tokenRights.read,
            required: true,
            type: "string"
        },
        usedAt: {type: "date"}
    },
    tableName: "ApiKey",

    statuses: tokenStatuses // eslint-disable-line sort-keys
};
