"use strict";

// local dependencies
const {
    send400,
    send403,
    send404,
    handleErrorAsync,
    tooManyArgumentsError
} = require("./clientError/errorDefinitions");

const {populate, getParamsObject, getPaginationLinks} = require("./apiHelpers");

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
    const collectionHasSoftDelete = collection.attributes._isSuppressed !== undefined;

    if (!collection) {
        _next(`Unable to find collection "${_request.asData.collectionName}" `
            + `from Url "${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

        return;
    }

    if (collectionHasSoftDelete) {
        query.where._isSuppressed = false;
    }

    const queryPromise = collection.findOne(query);

    populate(queryPromise, collection)
        .then(_result => {
            const itemExists = _result;

            if (itemExists) {
                _response.send(_result);
            } else {
                send404(_next, `GET: Unable to find item with id '${id}' `
                    + `from '${_request.asData.collectionName}'`);
            }
        })
        .catch(handleErrorAsync(_next));
}

/**
 * @param {object} _request connect request
 * @param {object} _response connect response
 * @param {function} _next connect next callback
 * @returns {void}
 */
function getRoute(_request, _response, _next) {
    const params = getParamsObject(_request.swagger);
    const {collection, collectionName} = _request.asData;
    const collectionHasSoftDelete = collection.attributes._isSuppressed !== undefined;

    if (!collection) {
        _next(`Unable to find collection "${collectionName}" `
            + `from Url "${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

        return;
    }

    if (collectionHasSoftDelete) {
        params.where._isSuppressed = false;
    }

    const queryPromise = collection.find(params);
    const queryCountPromise = collection.count(params.where);

    populate(queryPromise, collection)
        .then(_result => {
            return queryCountPromise.then(_countResult => {
                const url = _request.getFullUrl();

                _response
                    .set({
                        Link: getPaginationLinks(url, params.skip, params.limit, _countResult),
                        "X-Current-Page": Math.ceil((params.skip || 0) / params.limit),
                        "X-Total-Item-Count": _countResult,
                        "X-Total-Page-Count": Math.ceil(_countResult / params.limit)
                    })
                    .send(_result);
            });
        })
        .catch(handleErrorAsync(_next));
}

/**
 * @param {object} _request connect request
 * @param {object} _response connect response
 * @param {function} _next connect next callback
 * @returns {void}
 */
function postRoute(_request, _response, _next) {
    const paramKeys = Object.keys(_request.swagger.params);
    const postedItemName = paramKeys.length > 0 ? paramKeys[0] : null;
    const postedItem = postedItemName ? _request.swagger.params[postedItemName] : null;
    const collection = _request.asData.collection;

    if (!collection) {
        _next(`Unable to find collection "${_request.asData.collectionName}" `
            + `from Url "${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

        return;
    }

    if (postedItem === null) {
        send400(
            "Post must contain data for creating item",
            [{key: postedItemName, message: "", type: "required"}]
        );
    } else if (paramKeys.length > 1) {
        const error = tooManyArgumentsError(
            _request.swagger.params,
            "Too many arguments, Post must have only one parameter."
        );

        _next(error);

        return;
    }

    const queryPromise = collection.create(postedItem.value);

    populate(queryPromise, collection)
        .then(_result => {
            _response.send(_result);
        })
        .catch(handleErrorAsync(_next));
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
                    send404(_next, `Unable to find item with id '${id}' `
                                        + `from '${collectionName}'`);
                }
            })
            .catch(handleErrorAsync(_next));
    } else {
        send403(_next, `You are not allowed to delete an object from '${collectionName}'`);
    }
}

module.exports = {
    deleteRoute,
    getByIdRoute,
    getRoute,
    postRoute,
    putRoute
};
