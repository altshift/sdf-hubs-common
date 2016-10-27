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
 * @param {number} _httpCode http error code
 * @param {string} _apiMessage info message from api
 *
 * @returns {object} the error object
 *
 */
function error(_httpCode, _apiMessage = "") {
    return {
        apiMessage: _apiMessage,
        httpCode: _httpCode,
        httpMessage: codeToMessage[`${_httpCode}`]
    };
}

/**
 * Build a code 400 error object to be sent to the client
 *
 * @param {string} _apiMessage info message from api
 * @param {object[]} fields array of validation errors
 *
 * @returns {object} the error object
 *
 */
function error400(_apiMessage, _fields) {
    const clientError = error(400, _apiMessage); // eslint-disable-line no-magic-numbers

    clientError.fields = _fields;

    return clientError;
}

/**
 * Build a 400 clientError from a javascript error from a swagger validation
 *
 * @param {Error} _jsError swagger validation javascript error object
 * @returns {object} the error object
 */
function error400FromJsError({message, results: {errors}}) {
    const fieldError = [];

    errors.map(swaggerError => {
        return {
            key: swaggerError.path.join("."),
            message: swaggerError.message,
            type: swaggerError.code
        };
    });

    return error400(message, fieldError);
}

/**
 * Build a code 500 error object to be sent to the client
 *
 * @param {object|string} _errorOrMessage Javascript error that occured or message
 *
 * @returns {object} the error object
 *
 */
function error500(_errorOrMessage) {
    const javascriptError = typeof _error === "object" ? _errorOrMessage : new Error(_errorOrMessage);
    const clientError = error(500, javascriptError.message); // eslint-disable-line no-magic-numbers

    clientError.stackTrace = javascriptError.stack;

    return clientError;
}

/**
 * Return true if given object is a valid client error
 *
 * @param {any} _error The error to test
 *
 * @returns {boolean} true if error is a client Error
 *
 */
function isClientError(_error) {
    const isObject = typeof _error === "object";
    const hasHttpCode = isObject && typeof _error.httpCode === "number";
    const hasHttpMessage = isObject && typeof _error.httpMessage === "string";

    const isError500 = isObject && _error.httpCode !== 500; // eslint-disable-line no-magic-numbers
    const hasStackIf500 = isObject && (isError500 || typeof _error.stackTrace === "string");

    return hasHttpCode && hasHttpMessage && hasStackIf500;
}

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

    if (isClientError(_errorOrMessage)) {
        clientError = _errorOrMessage;
    } else if (typeof _errorOrMessage === "string") {
        clientError = error500(_errorOrMessage);
    } else {
        const jsError = _errorOrMessage;
        const isValidationFail = jsError.failedValidation;
        const resFailMessage = "Response validation failed";
        const isResponseValidationFail = isValidationFail && jsError.message.includes(resFailMessage);

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
 * Generate a connect middleware to handle error.
 * There is no parameters for now but it is the correct way to expose a middleware.
 *
 * @returns {void}
 */
function apiErrorMiddlewareGenerator() {
    return function errorMiddleware(_error, _request, _result, _next) {
        const isApiCall = _request.swagger !== undefined;

        if (isApiCall) {
            const clientError = toClientError(_error);

            _result
                .status(clientError.httpCode)
                .send(clientError);
        } else {
            _next(_error);
        }
    };
}

module.exports = {
    apiErrorMiddlewareGenerator,
    error,
    error400,
    error500,
    isClientError,
    toClientError
};
