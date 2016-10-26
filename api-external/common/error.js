"use strict";

const codeToMessage = {
    "400": "Bad Request",
    "401": "Unauthorized (please authenticate)",
    "403": "Forbidden",
    "429": "Too many requests",
    "500": "Internal server error"
};

/**
 * Build an error object to be sent to the client
 *
 * @param {number} $httpCode http error code
 * @param {string} $apiMessage info message from api
 *
 * @returns {object} the error object
 *
 */
function error($httpCode, $apiMessage = "") {
    return {
        apiMessage: $apiMessage,
        httpCode: $httpCode,
        httpMessage: codeToMessage[`${$httpCode}`]
    };
}

/**
 * Build a code 400 error object to be sent to the client
 *
 * @param {string} $apiMessage info message from api
 * @param {object[]} fields array of validation errors
 *
 * @returns {object} the error object
 *
 */
function error400($apiMessage, fields) {
    const clientError = error(400, $apiMessage); // eslint-disable-line no-magic-numbers

    clientError.fields = fields;

    return clientError;
}

/**
 * Build a 400 clientError from a javascript error from a swagger validation
 *
 * @param {Error} $jsError javascript error object
 * @returns {object} the error object
 */
function error400FromJsError($jsError) {
    const errors = $jsError.results.errors;
    const fieldError = [];

    errors.forEach(swaggerError => {
        fieldError.push({
            key: swaggerError.path.join("."),
            message: swaggerError.message,
            type: swaggerError.code
        });
    });

    return error400($jsError.message, fieldError);
}

/**
 * Build a code 500 error object to be sent to the client
 *
 * @param {object|string} $errorOrMessage Javascript error that occured or message
 *
 * @returns {object} the error object
 *
 */
function error500($errorOrMessage) {
    const javascriptError = typeof $error === "object" ? $errorOrMessage : new Error($errorOrMessage);
    const clientError = error(500, javascriptError.message); // eslint-disable-line no-magic-numbers

    clientError.stackTrace = javascriptError.stack;

    return clientError;
}

/**
 * Return true if given object is a valid client error
 *
 * @param {object} $error The error to test
 *
 * @returns {boolean} true if error is a client Error
 *
 */
function isClientError($error) {
    const isObject = typeof $error === "object";
    const hasHttpCode = isObject && typeof $error.httpCode === "number";
    const hasHttpMessage = isObject && typeof $error.httpMessage === "string";

    const isError500 = isObject && $error.httpCode !== 500; // eslint-disable-line no-magic-numbers
    const hasStackIf500 = isObject && (isError500 || typeof $error.stackTrace === "string");

    return hasHttpCode && hasHttpMessage && hasStackIf500;
}

/**
 * Transform an error or message to a client error
 *
 * @param {object|string} $errorOrMessage Error that occured or message
 *
 * @returns {object} the error object
 *
 */
function toClientError($errorOrMessage) {
    let clientError;

    if (isClientError($errorOrMessage)) {
        clientError = $errorOrMessage;
    } else if (typeof $errorOrMessage === "string") {
        clientError = error500($errorOrMessage);
    } else {
        const jsError = $errorOrMessage;
        const isValidationFail = jsError.failedValidation;
        const resFailMessage = "Response validation failed";
        const isResponseValidationFail = isValidationFail && jsError.message.indexOf(resFailMessage);

        if (isResponseValidationFail) {
            clientError = error500(jsError);
        } else if (isValidationFail) {
            clientError = error400FromJsError(jsError);
        } else {
            clientError = error500(jsError);
        }
    }

    return clientError;
}

/**
 *
 * @param {string} _apiPath path of the api to detect
 *
 * @returns {void}
 */
function apiErrorMiddlewareGenerator() {
    return function errorMiddleware($error, $request, $result, $next) {
        const isApiCall = $request.swagger !== undefined;

        if (isApiCall) {
            const clientError = toClientError($error);

            // console.error($error.message, Object.keys($error), $error.failedValidation, $error.results, $error.code);
            $result.status(clientError.httpCode).send(clientError);
        } else {
            $next($error);
        }
    };
}

exports.error = error;
exports.error500 = error500;
exports.error400 = error400;
exports.isClientError = isClientError;
exports.toClientError = toClientError;

exports.apiErrorMiddlewareGenerator = apiErrorMiddlewareGenerator;
