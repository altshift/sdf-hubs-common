"use strict";
/* eslint-disable no-magic-numbers */

// local dependencies
const errorDefinitions = require("./errorDefinitions");
const errorSails = require("./errorSails");
const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");

let errorTemplate;

fs.readFile(path.join(__dirname, "./errorTemplate.hbs"), "utf8", (_error, _content) => {
    if (_error) {
        throw _error;
    } else {
        errorTemplate = handlebars.compile(_content);
    }
});

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
 * @param {object} _response connect response
 * @param {object} _error error to display
 * @returns {void}
 */
function sendHtmlError(_response, _error) {
    if (_error.stackTrace) {
        const newLineRegex = /\n/g;
        const tabulationRegex = /\s\s\s\s/g;
        const filePathRegex = /\(([^)]*)\)/g;
        const withoutNodeModulesRegex = /(<a((?!node_modules)[^>])*>[^<]*<\/a>)/g;

        _error.stackTrace = _error.stackTrace.replace(newLineRegex, "<br>");
        _error.stackTrace = _error.stackTrace.replace(tabulationRegex, "&emsp;&emsp;");
        _error.stackTrace = _error.stackTrace.replace(filePathRegex, "<a href='file:///$1'>$1</a>");
        _error.stackTrace = _error.stackTrace.replace(withoutNodeModulesRegex, "<strong>$1</strong>");
    }
    const errorHtml = errorTemplate({error: _error});
    const contentLength = Buffer.byteLength(errorHtml, "utf8");

    // Reset swagger response validation
    if (_response.originalEnd) {
        _response.end = _response.originalEnd;
    }


    return _response
        .set("Content-Type", "text/html")
        .set("Content-length", contentLength)
        .send(errorHtml);
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
        const isHtmlAccepted = _request.get("Accept").includes("text/html");

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

            if (isHtmlAccepted) {
                return sendHtmlError(_response, clientError);
            } else {
                return _response
                    .set("Content-length", contentLength)
                    // needed because it seems that the type is not recalculated if
                    // the initial send was a string/html
                    .set("Content-Type", "application/json")
                    .status(clientError.httpCode)
                    .send(stringifiedClientError);
            }
        } else {
            return _next(_error);
        }
    };
}

module.exports = {
    apiErrorMiddlewareGenerator,
    toClientError
};
