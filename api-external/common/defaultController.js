"use strict";

// local dependencies
const {
    send400,
    send403,
    error404,
    handleErrorAsync,
    tooManyArgumentsError
} = require("./clientError/errorDefinitions");

const {populate, getParamsObject, getPaginationLinks} = require("./apiHelpers");
const {translateModelsAsync} = require("./translateModels");

/**
 * @param {object} [_options] Options of the generated controller
 * @param {string} [_options.collectionName] the name of the collection
 * @param {object} [_options.s3Config] amazon s3 configs
 * @param {function} [_options.finalizeJsonModel] Called with jsonified model data before
 * being sent to the client
 * @param {object} _options.s3Config.translationBucket amazon s3 bucket where to find translation files
 * @param {object} _options.s3Config.client connected amazon s3 client
 * @returns {object} A rest controller with default behaviour
 */
function generateDefaultController(_options = {}) {
    /**
     * @param {object} _model the jsonified model ready to be sent over the wire
     * @returns {promise<object>} promise returning the transformed object to send
     */
    function finalize(_model) {
        const json = _model.toJSON();

        return new Promise((_resolve, _reject) => {
            if (typeof _options.finalizeJsonModel === "function") {
                _options.finalizeJsonModel(json).then(_resolve, _reject);
            } else {
                _resolve(json);
            }
        });
    }

    /**
     * @param {object[]} _models the models to finalize
     * @returns {promise<object>} promise returning the transformed object to send
     */
    function finalizeAll(_models) {
        return new Promise((_resolve, _reject) => {
            const allModels = [];
            const allPromises = _models.map((_model, _index) => {
                return finalize(_model).then((_json) => {
                    allModels[_index] = _json;
                });
            });

            Promise.all(allPromises)
                .then(() => {
                    _resolve(allModels);
                })
                .catch(_reject);
        });
    }

    /**
     * @param {string} _404message message to send if 404
     * @returns {promise<object>} promise returning the query result if no 404
     */
    function test404Async(_404message) {
        return function test404(_queryResult) {
            const itemIsMissing = _queryResult === undefined;

            if (itemIsMissing) {
                throw error404(_404message);
            }

            return _queryResult;
        };
    }

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
        const collection = global[_options.collectionName] || _request.asData.collection;
        const collectionHasSoftDelete = collection.attributes._isSuppressed !== undefined;

        if (!collection) {
            _next(`Unable to find collection "${_request.asData.collectionName}" from Url `
                + `"${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

            return;
        }

        if (collectionHasSoftDelete) {
            query.where._isSuppressed = false;
        }

        const queryPromise = collection.findOne(query);

        populate(queryPromise, collection)
            .then(test404Async(`GET: Unable to find item with id '${id}' `
                        + `from '${_request.asData.collectionName}'`))
            .then(finalize)
            .then((_result) => _response.send(_result))
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
        const collectionName = _options.collectionName || _request.asData.collectionName;
        const collection = global[collectionName];
        const collectionHasSoftDelete = collection && collection.attributes._isSuppressed !== undefined;
        const s3Config = _options.s3Config || {};

        if (!collection) {
            _next(`Unable to find collection "${collectionName}" from Url `
                + `"${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

            return;
        }

        if (collectionHasSoftDelete) {
            params.where._isSuppressed = false;
        }

        const queryPromise = collection.find(params);
        const queryCountPromise = collection.count(params.where);

        populate(queryPromise, collection)
            .then(translateModelsAsync(
                collection,
                s3Config.client,
                s3Config.translationBucket
            ))
            .then(finalizeAll)
            .then((_result) => {
                return queryCountPromise.then((_countResult) => {
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
            _next(`Unable to find collection "${_request.asData.collectionName}" from Url `
                + `"${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

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
            .then(finalize)
            .then((_result) => _response.send(_result))
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
        const collectionName = _options.collectionName || _request.asData.collectionName;
        const collection = global[collectionName];
        const collectionHasSoftDelete = collection.attributes._isSuppressed !== undefined;

        if (!collection) {
            _next(`Unable to find collection "${_request.asData.collectionName}" from Url `
                + `"${_request.url}" in default getByIdRoute, maybe the route should be overloaded?`);

            return;
        }

        if (collectionHasSoftDelete) {
            collection
                .update(query, {_isSuppressed: true})
                .then(test404Async(`DELETE: Unable to find item with id '${id}' `
                                            + `from '${collectionName}'`))
                .then(() => {
                    _response.status(204).send(); // eslint-disable-line no-magic-numbers
                })
                .catch(handleErrorAsync(_next));
        } else {
            send403(_next, `You are not allowed to delete an object from '${collectionName}'`);
        }
    }

    return {
        deleteRoute,
        getByIdRoute,
        getRoute,
        postRoute,
        putRoute
    };
}

module.exports = generateDefaultController;
