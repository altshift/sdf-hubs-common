"use strict";

const moment = require("moment");
const {
    send401,
    send429,
    handleErrorAsync
} = require("../../api-external/common/clientError/errorDefinitions");

const apiKeyStatuses = {
    notFound: "not-found",
    ok: "ok",
    quotaExceeded: "quota-exceeded"
};

/**
 * Return the object when key is not found
 * @returns {object} The key status info
 */
function notFound() {
    return {status: apiKeyStatuses.notFound};
}

/**
 * Return the object when key is not found
 * @param {object} _apiKey The apiKey that is valid
 * @returns {object} The key status info
 */
function validKey(_apiKey) {
    return {
        apiKeyModel: _apiKey,
        limit: _apiKey.usageLimit,
        remaining: _apiKey.usageLimit - _apiKey.usageCount,
        status: apiKeyStatuses.ok
    };
}

/**
 * Return the object when quota of the key has been exceeded
 * @param {object} _apiKeyModel The model object from db
 * @returns {object} The key status info to return
 */
function quotaExceeded(_apiKeyModel) {
    const endOfDay = moment().endOf("day");
    const now = moment();
    const secondsUntilRefill = moment.duration(endOfDay.diff(now)).asSeconds();

    return {
        apiKeyModel: _apiKeyModel,
        retryAfter: Math.ceil(secondsUntilRefill),
        status: apiKeyStatuses.quotaExceeded
    };
}

/**
 * Get the key status info
 * @param {string} _key The key to check
 * @returns {promise<object>} Promise returning the key status info
 */
function checkApiKey(_key) {
    const query = {
        key: _key,
        status: global.ApiKey.statuses.active
    };

    return global.ApiKey.findOne(query)
        .then((_apiKey) => {
            if (_apiKey) {
                const lastUsedDay = moment(_apiKey.usedAt).dayOfYear();
                const todayDay = moment().dayOfYear();
                const lastUsedBeforeYesterday = lastUsedDay < todayDay;

                _apiKey.usageCount = (lastUsedBeforeYesterday ? 0 : _apiKey.usageCount) + 1;

                const quotaHasExceeded = _apiKey.usageCount > _apiKey.usageLimit;

                if (quotaHasExceeded) {
                    return quotaExceeded(_apiKey);
                } else {
                    return validKey(_apiKey);
                }
            } else {
                return notFound();
            }
        });
}

/**
 * Save the api key model
 * @param {object} _apiKeyModel model from db
 * @returns {promise} A promise returning the updated object
 */
function saveApiKey(_apiKeyModel) {
    return global.ApiKey.update({id: _apiKeyModel.id}, _apiKeyModel);
}

/**
 * @param {object} _request sails request
 * @param {object} _securityDef swagger security definition
 * @param {string} _apiKey the api key
 * @param {function} _callback swagger cb
 * @returns {void}
 */
function apiKeyCheck(_request, _securityDef, _apiKey, _callback) {
    const isApiRequest = _request.swagger !== undefined;

    if (isApiRequest) {
        if (_apiKey) {
            checkApiKey(_apiKey)
                .then((_apiKeyStatus) => {
                    _request.asData.apiKeyStatus = _apiKeyStatus;

                    if (_apiKeyStatus.status === apiKeyStatuses.notFound) {
                        return send401(_callback, `Invalid api_key: "${_apiKey}"`);
                    } else if (_apiKeyStatus.status === apiKeyStatuses.quotaExceeded) {
                        return send429(_callback, _apiKeyStatus.retryAfter);
                    } else if (_apiKeyStatus.status === apiKeyStatuses.ok) {
                        _callback();
                    } else {
                        _callback(new Error(`Unknown api key status: "${_apiKeyStatus.status}"`));
                    }

                    return undefined;
                })
                .catch(handleErrorAsync(_callback));
        } else {
            send401(_callback, "Missing api_key in header");
        }
    } else {
        _callback();
    }
}

/**
 * @param {object} _request sails request
 * @param {object} _response sails response
 * @param {function} _next sails next cb
 * @returns {void}
 */
function apiKeyIncrementMiddleware(_request, _response, _next) {
    const isApiRequest = _request.swagger !== undefined;

    if (isApiRequest === undefined) {
        _next();
    } else {
        const apiKeyStatus = _request.asData.apiKeyStatus;

        if (apiKeyStatus) {
            saveApiKey(apiKeyStatus.apiKeyModel).then(() => {
                _response.set("X-Rate-Limit", apiKeyStatus.limit);
                _response.set("X-Rate-Limit-Remaining", apiKeyStatus.remaining);
                _next();
            });
        } else {
            send401(_next, "Missing apiKey");
        }
    }
}

module.exports = {
    apiKeyCheck,
    apiKeyIncrementMiddleware,
    apiKeyStatuses,
    checkApiKey
};
