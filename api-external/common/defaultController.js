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
    const id = _request.swagger.params.id.value;
    const query = {where: {id}};
    const collection = _request.asData.collection;
    const collectionName = _request.asData.collectionName;
    const collectionHasSoftDelete = collection.attributes._isSuppressed !== undefined;

    if (!collection) {
        _next(`Unable to find collection "${_request.asData.collectionName}" `
            + `from Url "${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

        return;
    }

    if (collectionHasSoftDelete) {
        collection
            .update(query, {_isSuppressed: true})
            .then(_result => {
                if (_result.length > 0) {
                    _response.status(204).send(); // eslint-disable-line no-magic-numbers
                } else {
                    clientError.send404(_next, `Unable to find item with id '${id}' `
                                        + `from '${collectionName}'`);
                }
            })
            .catch(clientError.handleAsync(_next));
    } else {
        clientError.send403(_next, `You are not allowed to delete an object from '${collectionName}'`);
    }
}


module.exports = {
    deleteRoute,
    getByIdRoute,
    getRoute,
    postRoute,
    putRoute
};





