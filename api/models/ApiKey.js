"use strict";

const tokenStatuses = {
    active: "active",
    inactive: "inactive"
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
        usedAt: {type: "date"}
    },
    tableName: "ApiKey",

    statuses: tokenStatuses // eslint-disable-line sort-keys
};
