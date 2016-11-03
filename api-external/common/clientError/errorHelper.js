"use strict";
/* eslint-disable no-magic-numbers */

// local dependencies
const errorDefinitions = require("./errorDefinitions");
const errorSails = require("./errorSails");

/**
 * Transform an error or message to a client error
 *
 * @param {object|string} _errorOrMessage Error that occured or message
 *
 * @returns {object} the error object
 *
 */
function toClientError(_errorOrMessage) {
    let clientError;

    if (errorDefinitions.isClientError(_errorOrMessage)) {
        clientError = _errorOrMessage;
    } else if (typeof _errorOrMessage === "string") {
        clientError = errorDefinitions.error500(_errorOrMessage);
    } else {
        const jsError = _errorOrMessage || {};

        // Try to convert to sails related error
        clientError = errorSails.toClientError(jsError);

        if (!clientError) {
            const isValidationFail = jsError.failedValidation;
            const resFailMessage = "Response validation failed";
            const isResponseValidationFail = isValidationFail && jsError.message.includes(resFailMessage);

            if (isResponseValidationFail) {
                clientError = errorDefinitions.validationErrorFromJsError(jsError, 500);
            } else if (isValidationFail || jsError.status === 400) {
                clientError = errorDefinitions.validationErrorFromJsError(jsError, 400);
            } else {
                clientError = errorDefinitions.error500(jsError);
            }
        }
    }

    return clientError;
}

/**
 * Generate a connect middleware to handle error.
 * There is no parameters for now but it is the correct way to expose a middleware.
 *
 * @returns {void}
 */
function apiErrorMiddlewareGenerator() {
    return function errorMiddleware(_error, _request, _response, _next) {
        const isApiCall = _request.swagger !== undefined;

        if (isApiCall) {
            const clientError = toClientError(_error);
            // stringify to have a consistent size to set the length of the Content
            const stringifiedClientError = JSON.stringify(clientError);
            // needed because it seems that the length is not recalculated
            // if the initial send was a string/html*/
            const contentLength = Buffer.byteLength(stringifiedClientError, "utf8");

            if (clientError.httpCode === 500) { // eslint-disable-line no-magic-numbers
                console.error(clientError); // eslint-disable-line no-console
            }

            _response
                .set("Content-length", contentLength)
                 // needed because it seems that the type is not recalculated if
                 // the initial send was a string/html
                .set("Content-Type", "application/json")
                .status(clientError.httpCode)
                .send(stringifiedClientError);
        } else {
            _next(_error);
        }
    };
}

module.exports = {
    apiErrorMiddlewareGenerator,
    toClientError
};
