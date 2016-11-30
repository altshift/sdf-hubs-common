"use strict";

// node dependencies
const url = require("url");
const {deepifyObject} = require("../../lib/resquetHelpers");


/**
 * @param {object} _response the response object calculated
 * @param {object} responses swagger responses definitions
 * @returns {object} filtered _response
 */
function filterResponses(_response, {responses}) {
    const responseDef = responses["200"] || responses["201"];

    if (responseDef !== undefined) {
        const expectedResponseFields = Object.keys(responseDef.schema.items.properties);

        if (Array.isArray(_response)) {
            return _response.map((_value) => {
                return Object.keys(_value)
                    .filter((__value) => expectedResponseFields.includes(__value))
                    .reduce((_prev, _cur) => {
                        _prev[_cur] = _value[_cur];

                        return _prev;
                    }, {});
            });
        } else {
            return Object.keys(_response)
                .filter((_value) => expectedResponseFields.includes(_value))
                .reduce((_prev, _cur) => {
                    _prev[_cur] = _response[_cur];

                    return _prev;
                }, {});
        }
    } else {
        return _response;
    }
}

/**
 * @param {string} _url an url to guess the collection from
 * @returns {string} the collection name
 */
function guessCollectionFromUrl(_url) {
    const urlParts = _url.split("/");
    let collectionName = urlParts.length > 1 ? urlParts[1] : null;

    if (collectionName) {
        collectionName = collectionName[0].toUpperCase() + collectionName.substring(1);
        if (collectionName[collectionName.length - 1] === "s") {
            collectionName = collectionName.substr(0, collectionName.length - 1);
        }
    }

    return collectionName;
}

/**
 * Build the header value of Links for the pagination links last, first, next and prev
 *
 * @param {string} _url base url to use as a template
 * @param {number} _itemSkipped base number of items skipped from which to compute next/prev pages
 * @param {string} _pageSize pageSize value, representing page size
 * @param {string} _totalItem total number of item
 * @returns {string} the Links, header-ready
 */
function getPaginationLinks(_url, _itemSkipped = 0, _pageSize, _totalItem) {
    let links = "";
    const isPaginationAllowed = typeof _pageSize === "number";

    if (isPaginationAllowed) {
        const parsedUrl = url.parse(_url, true);
        const nextPageAllowed = _itemSkipped + _pageSize < _totalItem;
        const prevPageAllowed = _itemSkipped > 0;
        const linksDescriptors = [
            {
                addLink: nextPageAllowed,
                rel: "last",
                skip: Math.floor(_totalItem / _pageSize) * _pageSize,
                withComma: false
            },
            {
                addLink: prevPageAllowed,
                rel: "first",
                skip: 0,
                withComma: nextPageAllowed
            },
            {
                addLink: prevPageAllowed,
                rel: "prev",
                skip: Math.max(0, _itemSkipped - _pageSize),
                withComma: nextPageAllowed || prevPageAllowed
            },
            {
                addLink: nextPageAllowed,
                rel: "next",
                skip: _itemSkipped + _pageSize,
                withComma: nextPageAllowed || prevPageAllowed
            }
        ];

        // Used in order to force url.format to rewrite from query
        delete parsedUrl.search;

        links = linksDescriptors
            .filter((_desc) => _desc.addLink)
            .reduce((_accumulator, _desc) => {
                const newParsedUrl = JSON.parse(JSON.stringify(parsedUrl));
                let accumulatedLinks = _accumulator;

                if (_desc.withComma) {
                    accumulatedLinks += ", ";
                }
                newParsedUrl.query.$skip = _desc.skip;
                accumulatedLinks += `<${url.format(newParsedUrl)}>; rel="${_desc.rel}"`;

                return accumulatedLinks;
            }, "");
    }

    return links;
}

/**
 * Return true if the response needs pagination
 *
 * @param {object} _swaggerMeta swagger api data for this request
 * @returns {boolean} true if the response needs pagination, false otherwise
 */
function isPaginationNeeded(_swaggerMeta) {
    const hasLimit = Object.keys(_swaggerMeta.params).includes("$limit");
    const hasSkip = Object.keys(_swaggerMeta.params).includes("$skip");

    return hasLimit && hasSkip;
}
/**
 * Return a json plain object of the parameters
 *
 * @param {object} _swaggerMeta swagger api data for this request
 * @returns {object} the parma object (ready to use in waterline for example)
 */
function getParamsObject(_swaggerMeta) {
    const objectParams = {where: {}};

    Object.keys(_swaggerMeta.params).forEach((_key) => {
        if (_swaggerMeta.params[_key].value !== undefined) {
            // $limit or $sort
            if (_key[0] === "$") {
                objectParams[_key.substring(1)] = _swaggerMeta.params[_key].value;
            } else {
                const cleanKey = _key
                    .replace("$gt", ">=")
                    .replace("$lt", "<=");

                objectParams.where[cleanKey] = _swaggerMeta.params[_key].value;
            }
        }
    });

    objectParams.where = deepifyObject(objectParams.where);

    return objectParams;
}

/**
 * Parse given object and replace wterline association values by our api association values
 *
 * @param {object} _object javascript object to parse in order to find api association
 * @returns {object} the object in argument
 */
function resolveApiAssociation(_object) {
    return Object.keys(_object).forEach((_key) => {
        const regex = /^\$api_association_(.*)$/;
        const matches = _key.match(regex);
        const associatedKey = matches && matches.length > 1 && matches[1];

        if (associatedKey) {
            _object[associatedKey] = _object[_key];
            delete _object[_key];
        }
    });
}

/**
 * Populate the given model for given association with the
 * value from _associationKey in the association document
 *
 * @param {object} _model the populated model instance
 * @param {string} _associationField the association field name in our model instance
 * @param {string} _associationKey the association key we want to use instead of the full model instance
 * @returns {object} Waterline query which is a promise too
 */
function mapAssociation(_model, _associationField, _associationKey) {
    const tmpKey = `$api_association_${_associationField}`;

    if (_model[_associationField]) {
        _model[tmpKey] = _model[_associationField].map((associationDoc) => {
            return associationDoc[_associationKey];
        });
    }

    return _model;
}

/**
 * Populate the given model for all waterline associations with api association values
 *
 * @param {promise<object>} _queryPromise promise returning a model or an array of model
 * @param {object} _collection waterline collection used for query
 * @returns {object} the promise returning the model populated
 */
function populate(_queryPromise, _collection) {
    const associationsKeys = _collection.getAssociationPopulateKey
        && _collection.getAssociationPopulateKey() || {};
    const associations = _collection.associations;
    let query = _queryPromise;

    associations.forEach(({alias}) => {
        const associatedKey = associationsKeys[alias] || "id";
        const populateQuery = {};

        if (associatedKey) {
            populateQuery.select = [associatedKey];
        }
        query = query.populate(alias, populateQuery);
    });

    return query.then((_model) => {
        associations.forEach(({alias}) => {
            const associatedKey = associationsKeys[alias] || "id";

            if (Array.isArray(_model)) {
                _model.forEach((_aModel) => {
                    mapAssociation(_aModel, alias, associatedKey);
                });
            } else if (_model) {
                mapAssociation(_model, alias, associatedKey);
            }
        });

        return _model;
    });
}

module.exports = {
    filterResponses,
    getPaginationLinks,
    getParamsObject,
    guessCollectionFromUrl,
    isPaginationNeeded,
    populate,
    resolveApiAssociation
};
