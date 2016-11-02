"use strict";

const codeToMessage = {
    "400": "Bad Request",
    "401": "Unauthorized (please authenticate)",
    "403": "Forbidden",
    "404": "Not Found",
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
function error(_httpCode, _apiMessage = null) {
    const clientError = {
        httpCode: _httpCode,
        httpMessage: codeToMessage[`${_httpCode}`]
    };

    if (_apiMessage) {
        clientError.apiMessage = _apiMessage;
    }

    return clientError;
}

/**
 * Build a code validation error object to be sent to the client
 *
 * @param {string} _apiMessage info message from api
 * @param {object[]} _fields array of validation errors
 * @param {Error} _httpCode http code of the error
 *
 * @returns {object} the error object
 *
 */
function validationError(_apiMessage, _fields, _httpCode) {
    const clientError = error(_httpCode, _apiMessage); // eslint-disable-line no-magic-numbers

    clientError.fields = _fields;

    return clientError;
}

/**
 * Build a code 404 error object to be sent to the client
 *
 * @param {string} _apiMessage info message from api
 *
 * @returns {object} the error object
 *
 */
function error404(_apiMessage) {
    const clientError = error(404, _apiMessage); // eslint-disable-line no-magic-numbers

    return clientError;
}

/**
 * Build a 400 clientError from a javascript error from a swagger validation
 *
 * @param {Error} _jsError swagger validation javascript error object
 * @param {Error} _httpCode http code of the error
 * @returns {object} the error object
 */
function validationErrorFromJsError(_jsError, _httpCode) {
    const isFieldError = _jsError.results !== undefined && Array.isArray(_jsError.results.errors);
    let fieldError = null;

    if (isFieldError) {
        fieldError = _jsError.results.errors.map(({description, message, path, code}) => {
            const validationMessage = description ? `${message} => ${description}` : message;

            return {
                key: path.join("."),
                message: validationMessage,
                type: code
            };
        });
    }

    return validationError(_jsError.message, fieldError, _httpCode);
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
    const isJsError = typeof _errorOrMessage === "object";
    const javascriptError = isJsError ? _errorOrMessage : new Error(_errorOrMessage);
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
        const jsError = _errorOrMessage || {};
        const isValidationFail = jsError.failedValidation;
        const resFailMessage = "Response validation failed";
        const isResponseValidationFail = isValidationFail && jsError.message.includes(resFailMessage);

        if (isResponseValidationFail) {
            clientError = validationErrorFromJsError(jsError, 500);// eslint-disable-line no-magic-numbers
        } else if (isValidationFail) {
            clientError = validationErrorFromJsError(jsError, 400);// eslint-disable-line no-magic-numbers
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
    return function errorMiddleware(_error, _request, _response, _next) {
        const isApiCall = _request.swagger !== undefined;

        if (isApiCall) {
            const clientError = toClientError(_error);
            // stringify to have a consistent size to set the length of the Content
            const stringifiedClientError = JSON.stringify(clientError);
            // needed because it seems that the length is not recalculated
            // if the initial send was a string/html*/
            const contentLength = stringifiedClientError.length;

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

/**
 * @param {function} _next connect next middleware cb
 * @param {string} _error the error to deal with
 * @returns {void}
 */
function send(_next, _error) {
    _next(_error);
}

/**
 * @param {function} _next connect next middleware cb
 * @param {string} _message (optional) message of the error
 * @returns {void}
 */
function send404(_next, _message = null) {
    send(_next, error404(_message));
}

/**
 * Send a 403 error (Forbidden)
 * @param {function} _next connect next middleware cb
 * @param {string} _message (optional) message of the error
 * @returns {void}
 */
function send403(_next, _message = null) {
    send(_next, error(403, _message)); // eslint-disable-line no-magic-numbers
}

/**
 * Generate a function that know how to deal with errors,
 * can be used directly in error callbacks
 *
 * @param {function} _next connect next middleware cb
 * @param {function} _callbackIfOk connect response
 * @returns {function} a callback that wan deal with errors
 */
function handleAsync(_next, _callbackIfOk = null) {
    return (...args) => {
        const argError = args[0];

        if (argError) {
            send(_next, argError);
        } else if (_callbackIfOk) {
            const otherArgs = args.splice(1);

            _callbackIfOk(otherArgs);
        }
    };
}




module.exports = {
    apiErrorMiddlewareGenerator,
    error,
    error404,
    error500,
    handleAsync,
    isClientError,
    send,
    send404,
    toClientError,
    validationError,
    validationErrorFromJsError
};
