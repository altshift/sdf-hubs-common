"use strict";

// local dependencies
const clientError = require("./error");
const apiHelpers = require("./apiHelpers");

/**
 * Send to the client the requested document by id,
 * collection is guessed from url
 * Send a 404 if document is not found
 *
 * @param {object} _request connect request
 * @param {object} _response connect response
 * @param {function} _next connect next callback
 * @returns {void}
 */
function getByIdRoute(_request, _response, _next) {
    const id = _request.swagger.params.id.value;
    const query = {where: {id}};
    const collection = _request.asData.collection;

    if (!collection) {
        _next(`Unable to find collection "${_request.asData.collectionName}" `
            + `from Url "${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

        return;
    }

    const queryPromise = collection.findOne(query);

    apiHelpers
        .populate(queryPromise, collection)
        .then(_result => {
            const itemExists = _result;

            if (itemExists) {
                _response.send(_result);
            } else {
                clientError.send404(_next, `Unable to find item with id '${id}' `
                    + `from '${_request.asData.collectionName}'`);
            }
        })
        .catch(clientError.handleAsync(_next));
}

/**
 * @param {object} _request connect request
 * @param {object} _response connect response
 * @param {function} _next connect next callback
 * @returns {void}
 */
function getRoute(_request, _response, _next) {
}

/**
 * @param {object} _request connect request
 * @param {object} _response connect response
 * @param {function} _next connect next callback
 * @returns {void}
 */
function postRoute(_request, _response, _next) {

}

/**
 * @param {object} _request connect request
 * @param {object} _response connect response
 * @param {function} _next connect next callback
 * @returns {void}
 */
function putRoute(_request, _response, _next) {

}

/**
 * @param {object} _request connect request
 * @param {object} _response connect response
 * @param {function} _next connect next callback
 * @returns {void}
 */
function deleteRoute(_request, _response, _next) {

}


module.exports = {
    deleteRoute,
    getByIdRoute,
    getRoute,
    postRoute,
    putRoute
};





